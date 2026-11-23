import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PeerSession } from "../src/components/calls/PeerSession";

class Stream {
  tracks: Array<{ id: string; stop: ReturnType<typeof vi.fn> }> = [];
  getTracks() { return this.tracks; }
  addTrack(track: typeof this.tracks[number]) { this.tracks.push(track); }
}
class Peer {
  static all: Peer[] = [];
  connectionState = "new";
  remoteDescription: unknown = null;
  localDescription = { sdp: "v=0\r\nlocal" };
  onicecandidate: ((event: unknown) => void) | null = null;
  ontrack: ((event: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  addTrack = vi.fn(); close = vi.fn(); addIceCandidate = vi.fn().mockResolvedValue(undefined);
  createOffer = vi.fn().mockResolvedValue({ type: "offer", sdp: "v=0\r\n" });
  createAnswer = vi.fn().mockResolvedValue({ type: "answer", sdp: "v=0\r\n" });
  setLocalDescription = vi.fn().mockResolvedValue(undefined);
  setRemoteDescription = vi.fn().mockImplementation(async (description) => { this.remoteDescription = description; });
  constructor() { Peer.all.push(this); }
}
beforeEach(() => { vi.useFakeTimers(); Peer.all = []; vi.stubGlobal("MediaStream", Stream); vi.stubGlobal("RTCPeerConnection", Peer); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup(send = vi.fn().mockResolvedValue(undefined)) {
  const track = { id: "local", stop: vi.fn() };
  const stream = new Stream(); stream.addTrack(track);
  const options = { stream: stream as unknown as MediaStream, configuration: {}, send,
    onConnected: vi.fn(), onRemote: vi.fn(), onFailure: vi.fn() };
  const session = new PeerSession(options);
  return { session, pc: Peer.all[0]!, track, options };
}

test("caller sends one offer and retries a failed packet with the same idempotency key", async () => {
  const send = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
  const { session, pc } = setup(send);
  await session.offer(); await session.offer();
  expect(pc.createOffer).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[0]![0]).toEqual(send.mock.calls[1]![0]);
  session.close();
});

test("early ICE is queued until the offer and the callee returns an answer", async () => {
  const { session, pc, options } = setup();
  await session.receive({ id: 1, kind: "ice", payload: { candidate: "candidate:1" } });
  expect(pc.addIceCandidate).not.toHaveBeenCalled();
  await session.receive({ id: 2, kind: "offer", payload: { sdp: "v=0\r\nremote" } });
  expect(pc.addIceCandidate).toHaveBeenCalledWith({ candidate: "candidate:1" });
  expect(options.send).toHaveBeenCalledWith(expect.objectContaining({ kind: "answer" }));
  session.close();
});

test("closing stops local and remote tracks and ignores late packets", async () => {
  const { session, pc, track, options } = setup();
  const remoteTrack = { id: "remote", stop: vi.fn() };
  pc.ontrack!({ track: remoteTrack });
  expect(options.onRemote).toHaveBeenCalled();
  session.close(); session.close();
  expect(track.stop).toHaveBeenCalledTimes(1); expect(remoteTrack.stop).toHaveBeenCalledTimes(1);
  expect(pc.close).toHaveBeenCalledTimes(1);
  await session.receive({ id: 3, kind: "ice", payload: { candidate: "late" } });
  expect(pc.addIceCandidate).not.toHaveBeenCalled();
});

test("connection timeout closes devices and reports a recoverable failure", async () => {
  const { track, pc, options } = setup();
  await vi.advanceTimersByTimeAsync(25000);
  expect(track.stop).toHaveBeenCalled(); expect(pc.close).toHaveBeenCalled();
  expect(options.onFailure).toHaveBeenCalledTimes(1);
});

test("temporary disconnect recovery cancels the grace timer and later disconnects expire", async () => {
  const { session, pc, track, options } = setup();
  pc.connectionState = "connected"; pc.onconnectionstatechange!();
  pc.connectionState = "disconnected"; pc.onconnectionstatechange!();
  await vi.advanceTimersByTimeAsync(5000);
  pc.connectionState = "connected"; pc.onconnectionstatechange!();
  await vi.advanceTimersByTimeAsync(11000);
  expect(track.stop).not.toHaveBeenCalled();
  pc.connectionState = "disconnected"; pc.onconnectionstatechange!();
  await vi.advanceTimersByTimeAsync(10000);
  expect(options.onFailure).toHaveBeenCalled(); session.close();
});

test("exhausted signaling retries release the microphone", async () => {
  const { session, track, options } = setup(vi.fn().mockRejectedValue(new Error("offline")));
  await expect(session.offer()).rejects.toThrow("offline");
  expect(track.stop).toHaveBeenCalled(); expect(options.onFailure).toHaveBeenCalledTimes(1);
});

test("partial peer initialization failure closes the peer and local media", () => {
  vi.stubGlobal("RTCPeerConnection", class extends Peer { addTrack = vi.fn(() => { throw new Error("device unavailable"); }); });
  const track = { id: "local", stop: vi.fn() }; const stream = new Stream(); stream.addTrack(track);
  expect(() => new PeerSession({ stream: stream as unknown as MediaStream, configuration: {},
    send: vi.fn(), onRemote: vi.fn(), onConnected: vi.fn(), onFailure: vi.fn(),
  })).toThrow("device unavailable");
  expect(track.stop).toHaveBeenCalled(); expect(Peer.all[0]!.close).toHaveBeenCalled();
});

test("device IDs remain valid when randomUUID is unavailable on an HTTP origin", async () => {
  const { deviceId } = await import("../src/components/calls/deviceId");
  const random = crypto.getRandomValues.bind(crypto);
  vi.stubGlobal("crypto", { getRandomValues: random });
  expect(deviceId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
