import { deviceId } from "./deviceId";
import type { CallSignal, SignalInput } from "./types";

const CONNECTION_TIMEOUT_MS = 25000;
const DISCONNECT_TIMEOUT_MS = 10000;

interface Options {
  stream: MediaStream;
  configuration: RTCConfiguration;
  send: (packet: SignalInput) => Promise<void>;
  onRemote: (stream: MediaStream) => void;
  onConnected: (connected: boolean) => void;
  onFailure: (message: string) => void;
}

/** Own one peer connection and release every media resource when closed. */
export class PeerSession {
  private pc: RTCPeerConnection;
  private remote = new MediaStream();
  private candidates: RTCIceCandidateInit[] = [];
  private closed = false;
  private descriptionStarted = false;
  private sending = Promise.resolve();
  private deadline: ReturnType<typeof setTimeout>;
  private disconnected?: ReturnType<typeof setTimeout>;

  constructor(private options: Options) {
    try { this.pc = new RTCPeerConnection(options.configuration); }
    catch (cause) { options.stream.getTracks().forEach((track) => track.stop()); throw cause; }
    this.deadline = setTimeout(() => this.fail("Could not connect this call. Please try again."), CONNECTION_TIMEOUT_MS);
    try {
      for (const track of options.stream.getTracks()) this.pc.addTrack(track, options.stream);
    } catch (cause) { this.close(); throw cause; }
    this.pc.onicecandidate = (event) => {
      if (event.candidate && !this.closed) {
        void this.transmit("ice", event.candidate.toJSON()).catch(() => {});
      }
    };
    this.pc.ontrack = (event) => {
      if (this.closed) { event.track.stop(); return; }
      if (!this.remote.getTracks().some((track) => track.id === event.track.id)) this.remote.addTrack(event.track);
      options.onRemote(this.remote);
    };
    this.pc.onconnectionstatechange = () => {
      if (this.closed) return;
      const state = this.pc.connectionState;
      options.onConnected(state === "connected");
      if (state === "connected") { clearTimeout(this.deadline); clearTimeout(this.disconnected); this.disconnected = undefined; }
      if (state === "failed") this.fail("The call connection failed.");
      if (state === "disconnected" && !this.disconnected) {
        this.disconnected = setTimeout(() => this.fail("The call was disconnected."), DISCONNECT_TIMEOUT_MS);
      }
    };
  }

  private fail(message: string) {
    if (this.closed) return;
    this.close();
    this.options.onFailure(message);
  }

  private transmit(kind: CallSignal["kind"], payload: CallSignal["payload"]): Promise<void> {
    const packet: SignalInput = { kind, payload, client_id: deviceId() };
    this.sending = this.sending.then(async () => {
      if (this.closed) return;
      let last: unknown;
      for (let attempt = 0; attempt < 3 && !this.closed; attempt++) {
        try { await this.options.send(packet); return; }
        catch (cause) { last = cause; }
      }
      if (!this.closed) throw last;
    });
    void this.sending.catch(() => this.fail("Call setup could not be delivered. Please try again."));
    return this.sending;
  }

  async offer(): Promise<void> {
    if (this.closed || this.descriptionStarted) return;
    this.descriptionStarted = true;
    await this.pc.setLocalDescription(await this.pc.createOffer());
    if (!this.closed) await this.transmit("offer", { sdp: this.pc.localDescription!.sdp });
  }

  async receive(signal: CallSignal): Promise<void> {
    if (this.closed) return;
    if (signal.kind === "ice") {
      if (this.pc.remoteDescription) await this.pc.addIceCandidate(signal.payload);
      else this.candidates.push(signal.payload);
      return;
    }
    if (this.pc.remoteDescription) return;
    await this.pc.setRemoteDescription({ type: signal.kind, sdp: signal.payload.sdp });
    for (const candidate of this.candidates.splice(0)) {
      if (this.closed) return;
      await this.pc.addIceCandidate(candidate);
    }
    if (signal.kind === "offer" && !this.closed) {
      await this.pc.setLocalDescription(await this.pc.createAnswer());
      if (!this.closed) await this.transmit("answer", { sdp: this.pc.localDescription!.sdp });
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.deadline); clearTimeout(this.disconnected);
    this.pc.ontrack = null; this.pc.onicecandidate = null; this.pc.onconnectionstatechange = null;
    this.pc.close();
    this.options.stream.getTracks().forEach((track) => track.stop());
    this.remote.getTracks().forEach((track) => track.stop());
    this.candidates = [];
  }
}
