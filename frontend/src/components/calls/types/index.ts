export type CallMode = "audio" | "video";
export type CallState = "ringing" | "active" | "ended" | "declined" | "missed" | "failed";
export interface CallPeer {
  id: number; username: string; first_name: string; last_name: string; photo_id: number | null;
}
export interface CallSnapshot {
  id: string; mode: CallMode; state: CallState; role: "caller" | "callee";
  owned: boolean; peer: CallPeer; created_at: string;
}
export interface CallSignal {
  id: number; kind: "offer" | "answer" | "ice";
  payload: { sdp?: string } & RTCIceCandidateInit;
}
export interface CallPage { call: CallSnapshot; signals: CallSignal[]; has_more: boolean }
export interface SignalInput {
  kind: CallSignal["kind"]; payload: CallSignal["payload"]; client_id: string;
}
