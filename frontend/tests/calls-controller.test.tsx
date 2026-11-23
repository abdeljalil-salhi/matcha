import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useCallController } from "../src/components/calls/useCallController";
import { callApi } from "../src/components/calls/api";
import type { CallSnapshot } from "../src/components/calls/types";

const media = vi.hoisted(() => ({ close: vi.fn(), offer: vi.fn().mockResolvedValue(undefined), receive: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/components/calls/PeerSession", () => ({ PeerSession: class { close = media.close; offer = media.offer; receive = media.receive; } }));
const call: CallSnapshot = { id: "call-1", mode: "audio", state: "ringing", role: "caller", owned: true,
  created_at: "2026-01-01T00:00:00Z", peer: { id: 2, username: "bob", first_name: "Bob", last_name: "Example", photo_id: null } };
const track = () => ({ stop: vi.fn(), enabled: true });
const mockStream = () => { const audio = track(); const video = track(); return {
  audio, video, getTracks: () => [audio, video], getAudioTracks: () => [audio], getVideoTracks: () => [video],
}; };

beforeEach(() => {
  vi.useFakeTimers(); media.close.mockClear(); media.offer.mockClear();
  vi.stubGlobal("RTCPeerConnection", class {});
  vi.spyOn(callApi, "current").mockResolvedValue({ call: null });
  vi.spyOn(callApi, "start").mockResolvedValue({ call });
  vi.spyOn(callApi, "action").mockResolvedValue({ call: { ...call, state: "ended" } });
  vi.spyOn(callApi, "read").mockResolvedValue({ call: { ...call, state: "active" }, signals: [], has_more: false });
  vi.spyOn(callApi, "heartbeat").mockResolvedValue({ call: { ...call, state: "active" } });
  vi.spyOn(callApi, "ice").mockResolvedValue({ iceServers: [] });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function devices(stream = mockStream()) {
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  return { stream, getUserMedia };
}

test("starting audio asks only for microphone and ending releases all tracks", async () => {
  const { stream, getUserMedia } = devices();
  const { result } = renderHook(() => useCallController(1));
  await act(async () => result.current.start(2, "audio"));
  expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({ audio: true, video: false });
  expect(callApi.start).toHaveBeenCalledTimes(1);
  act(() => result.current.end());
  expect(stream.audio.stop).toHaveBeenCalled(); expect(stream.video.stop).toHaveBeenCalled();
  expect(result.current.call).toBeNull();
});

test("late permission success after cancellation stops the stream without inviting", async () => {
  const stream = mockStream(); let resolve!: (value: unknown) => void;
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => new Promise((done) => { resolve = done; }) } });
  const { result } = renderHook(() => useCallController(1));
  let started!: Promise<void>;
  act(() => { started = result.current.start(2, "video"); });
  act(() => result.current.end());
  await act(async () => { resolve(stream); await started; });
  expect(stream.audio.stop).toHaveBeenCalled(); expect(callApi.start).not.toHaveBeenCalled();
});

test("permission denial never creates a call and surfaces the error", async () => {
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error("Permission denied")) } });
  const { result } = renderHook(() => useCallController(1));
  await act(async () => result.current.start(2, "audio"));
  expect(callApi.start).not.toHaveBeenCalled(); expect(result.current.notice).toBe("Permission denied");
});

test("incoming invitations do not capture devices until answered", async () => {
  const { getUserMedia } = devices();
  const incoming = { ...call, role: "callee" as const, owned: false };
  vi.mocked(callApi.current).mockResolvedValue({ call: incoming });
  vi.mocked(callApi.action).mockResolvedValue({ call: { ...incoming, owned: true, state: "active" } });
  const { result } = renderHook(() => useCallController(1));
  await act(async () => {});
  expect(result.current.call?.role).toBe("callee"); expect(getUserMedia).not.toHaveBeenCalled();
  await act(async () => result.current.accept());
  expect(getUserMedia).toHaveBeenCalledTimes(1); expect(callApi.action).toHaveBeenCalledWith(call.id, expect.any(String), "accept");
});

test("mute and camera controls change tracks and signout releases media", async () => {
  const { stream } = devices();
  const { result, rerender } = renderHook(({ user }) => useCallController(user), { initialProps: { user: 1 as number | undefined } });
  await act(async () => result.current.start(2, "video"));
  act(() => result.current.toggleMute()); act(() => result.current.toggleCamera());
  expect(stream.audio.enabled).toBe(false); expect(stream.video.enabled).toBe(false);
  rerender({ user: undefined });
  expect(stream.audio.stop).toHaveBeenCalled(); expect(result.current.call).toBeNull();
});

test("ordinary rerenders preserve the call, while terminal server state releases it", async () => {
  const { stream } = devices();
  const { result, rerender } = renderHook(() => useCallController(1));
  await act(async () => result.current.start(2, "audio"));
  rerender(); expect(result.current.call?.id).toBe(call.id); expect(stream.audio.stop).not.toHaveBeenCalled();
  vi.mocked(callApi.read).mockResolvedValue({ call: { ...call, state: "ended" }, signals: [], has_more: false });
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(result.current.call).toBeNull(); expect(stream.audio.stop).toHaveBeenCalled();
});

test("page exit stops devices and ends the owned call", async () => {
  const { stream } = devices();
  const { result } = renderHook(() => useCallController(1));
  await act(async () => result.current.start(2, "audio"));
  act(() => window.dispatchEvent(new Event("pagehide")));
  expect(stream.audio.stop).toHaveBeenCalled(); expect(result.current.call).toBeNull();
  expect(callApi.action).toHaveBeenCalledWith(call.id, expect.any(String), "end");
});

test("a different tab cannot renew or recreate media for the active call", async () => {
  const { getUserMedia } = devices();
  vi.mocked(callApi.current).mockResolvedValue({ call: { ...call, state: "active", owned: false } });
  vi.mocked(callApi.read).mockResolvedValue({ call: { ...call, state: "active", owned: false }, signals: [], has_more: false });
  const { result } = renderHook(() => useCallController(1));
  await act(async () => {});
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(getUserMedia).not.toHaveBeenCalled(); expect(callApi.heartbeat).not.toHaveBeenCalled();
  act(() => result.current.end());
  expect(callApi.action).toHaveBeenCalledWith(call.id, expect.any(String), "end");
});

test("invalid remote setup stops media immediately rather than retrying with live devices", async () => {
  const { stream } = devices();
  const { result } = renderHook(() => useCallController(1));
  await act(async () => result.current.start(2, "audio"));
  media.receive.mockRejectedValueOnce(new Error("bad remote SDP"));
  vi.mocked(callApi.read).mockResolvedValue({ call: { ...call, state: "active" },
    signals: [{ id: 1, kind: "answer", payload: { sdp: "v=0\r\n" } }], has_more: false });
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(stream.audio.stop).toHaveBeenCalled(); expect(result.current.call).toBeNull();
});
