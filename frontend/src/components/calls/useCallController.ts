import { deviceId } from "./deviceId";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { callApi } from "./api";
import { PeerSession } from "./PeerSession";
import type { CallMode, CallSnapshot } from "./types";

const HEARTBEAT_MS = 5000;
const NETWORK_GRACE_MS = 12000;
const terminal = (call: CallSnapshot) => call.state !== "ringing" && call.state !== "active";
const stop = (stream: MediaStream | null) => stream?.getTracks().forEach((track) => track.stop());

/** Coordinate invitations, polling and tab-owned media independently of page navigation. */
export function useCallController(userId: number | undefined) {
  const [device] = useState(deviceId);
  const [call, setCall] = useState<CallSnapshot | null>(null);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const active = useRef<CallSnapshot | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const peer = useRef<PeerSession | null>(null);
  const epoch = useRef(0);
  const cursor = useRef(0);
  const preparing = useRef(false);
  const heartbeatAt = useRef(0);
  const lastSuccess = useRef(Date.now());

  const reset = useCallback(() => {
    epoch.current++;
    peer.current?.close(); peer.current = null;
    stop(stream.current); stream.current = null;
    active.current = null; cursor.current = 0; preparing.current = false;
    setCall(null); setLocal(null); setRemote(null); setConnected(false);
    setMuted(false); setCameraOff(false); setBusy(false);
  }, []);

  const finish = useCallback((message = "Call ended.", failed = false, explicit = false) => {
    const previous = active.current;
    reset(); setNotice(message);
    if (previous && (previous.owned || explicit)) void callApi.action(previous.id, device, failed ? "fail" : "end").catch(() => {});
  }, [reset, device]);

  const update = useCallback((next: CallSnapshot) => {
    if (terminal(next)) {
      reset();
      setNotice(next.state === "declined" ? "Call declined." : next.state === "missed" ? "No answer." : next.state === "failed" ? "Call could not connect." : "Call ended.");
      return;
    }
    if (!active.current || active.current.id !== next.id) setNotice(null);
    active.current = next; setCall(next);
  }, [reset]);

  const media = useCallback(async (next: CallSnapshot) => {
    if (peer.current || !next.owned || !stream.current || next.state !== "active") return;
    const version = epoch.current;
    const configuration = await callApi.ice();
    if (version !== epoch.current || peer.current || !stream.current) return;
    try {
      const session = new PeerSession({
        stream: stream.current, configuration,
        send: async (packet) => { await callApi.signal(next.id, device, packet); },
        onRemote: (value) => { if (version === epoch.current) setRemote(value); },
        onConnected: (value) => { if (version === epoch.current) setConnected(value); },
        onFailure: (message) => { if (version === epoch.current) finish(message, true); },
      });
      peer.current = session;
      if (next.role === "caller") await session.offer();
    } catch {
      if (version === epoch.current) finish("Could not initialize this call. Please try again.", true);
    }
  }, [device, finish]);

  const acquire = useCallback(async (mode: CallMode, version: number) => {
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.RTCPeerConnection) throw new Error("Calling requires a supported browser and HTTPS (or localhost).");
    const acquired = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === "video" ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" } : false });
    if (version !== epoch.current) { stop(acquired); return null; }
    stream.current = acquired; setLocal(acquired);
    return acquired;
  }, []);

  const start = useCallback(async (target: number, mode: CallMode) => {
    if (!userId || active.current || preparing.current) return;
    preparing.current = true; setBusy(true); setNotice(null);
    const version = ++epoch.current;
    try {
      if (!await acquire(mode, version)) return;
      const result = await callApi.start(target, mode, device);
      if (version !== epoch.current) { void callApi.action(result.call.id, device, "end").catch(() => {}); return; }
      if (active.current) throw new Error("Another call arrived. Please answer or decline it first.");
      heartbeatAt.current = 0; lastSuccess.current = Date.now(); update(result.call);
    } catch (cause) {
      if (version === epoch.current) { stop(stream.current); stream.current = null; setLocal(null); setNotice(cause instanceof Error ? cause.message : "Could not start the call."); }
    } finally { if (version === epoch.current) { preparing.current = false; setBusy(false); } }
  }, [acquire, device, update, userId]);

  const accept = useCallback(async () => {
    const invitation = active.current;
    if (!invitation || invitation.role !== "callee" || invitation.state !== "ringing" || preparing.current) return;
    preparing.current = true; setBusy(true); setNotice(null);
    const version = ++epoch.current;
    try {
      if (!await acquire(invitation.mode, version)) return;
      const result = await callApi.action(invitation.id, device, "accept");
      if (version !== epoch.current) { void callApi.action(invitation.id, device, "end").catch(() => {}); return; }
      update(result.call); heartbeatAt.current = 0; lastSuccess.current = Date.now();
      await media(result.call);
    } catch (cause) {
      if (version === epoch.current) {
        stop(stream.current); stream.current = null; setLocal(null);
        setNotice(cause instanceof Error ? cause.message : "Could not answer the call.");
        void callApi.action(invitation.id, device, "decline").catch(() => {});
        reset();
      }
    } finally { if (version === epoch.current) { preparing.current = false; setBusy(false); } }
  }, [acquire, device, media, reset, update]);

  const decline = useCallback(() => {
    const invitation = active.current;
    reset();
    if (invitation) void callApi.action(invitation.id, device, "decline").catch(() => setNotice("Could not decline the call. It will expire automatically."));
  }, [device, reset]);

  useEffect(() => {
    if (!userId) { reset(); setNotice(null); return; }
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | null = null;
    const poll = async () => {
      let again = false;
      const current = active.current;
      const version = epoch.current;
      request = new AbortController();
      try {
        if (current) {
          const page = await callApi.read(current.id, device, cursor.current, request.signal);
          if (disposed || version !== epoch.current) return;
          update(page.call);
          if (!terminal(page.call) && page.call.owned) {
            await media(page.call);
            if (disposed || version !== epoch.current) return;
            for (const packet of page.signals) {
              if (disposed || version !== epoch.current) return;
              if (!peer.current) break;
              try { await peer.current.receive(packet); }
              catch { finish("The call could not negotiate a connection.", true); return; }
              cursor.current = packet.id;
            }
            again = page.has_more;
            if (Date.now() - heartbeatAt.current >= HEARTBEAT_MS) {
              const renewed = await callApi.heartbeat(current.id, device);
              if (!disposed && version === epoch.current) update(renewed.call);
              heartbeatAt.current = Date.now();
            }
          }
        } else {
          const result = await callApi.current(device, request.signal);
          if (disposed || version !== epoch.current) return;
          if (result.call) {
            // Do not revive an ownerless media session after refresh or a closed tab.
            if (result.call.owned && !stream.current) {
              await callApi.action(result.call.id, device, "end");
            } else update(result.call);
          }
        }
        lastSuccess.current = Date.now();
      } catch (cause) {
        if (disposed || version !== epoch.current) return;
        const denied = cause instanceof ApiError && [401, 403, 404, 409].includes(cause.status);
        if (active.current && (denied || Date.now() - lastSuccess.current > NETWORK_GRACE_MS)) finish("The call ended because the connection was lost.");
      } finally {
        if (!disposed) timer = setTimeout(() => void poll(), again ? 0 : active.current ? 1000 : 2000);
      }
    };
    void poll();
    const unload = () => finish();
    window.addEventListener("pagehide", unload);
    return () => {
      disposed = true; clearTimeout(timer); request?.abort();
      window.removeEventListener("pagehide", unload);
      const previous = active.current;
      reset();
      if (previous?.owned) void callApi.action(previous.id, device, "end").catch(() => {});
    };
  }, [userId, device, finish, media, reset, update]);

  const toggleMute = () => {
    const next = !muted;
    stream.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  };
  const toggleCamera = () => {
    const next = !cameraOff;
    stream.current?.getVideoTracks().forEach((track) => { track.enabled = !next; });
    setCameraOff(next);
  };
  return { call, local, remote, busy, connected, muted, cameraOff, notice,
    start, accept, decline, end: () => finish("Call ended.", false, true), toggleMute, toggleCamera,
    dismissNotice: () => setNotice(null) };
}
