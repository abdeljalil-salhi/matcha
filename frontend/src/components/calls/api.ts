import { request, type RequestOptions } from "../../api/client";
import type { CallMode, CallPage, CallSnapshot, SignalInput } from "./types";

const timedRequest = <T,>(path: string, options: RequestOptions = {}) => request<T>(path, {
  ...options, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
});

export const callApi = {
  current: (device: string, signal?: AbortSignal) => timedRequest<{ call: CallSnapshot | null }>("/calls/current", { query: { device_id: device }, signal }),
  ice: () => timedRequest<RTCConfiguration>("/calls/ice"),
  start: (userId: number, mode: CallMode, device: string) => timedRequest<{ call: CallSnapshot }>("/calls", { method: "POST", body: { user_id: userId, mode, device_id: device } }),
  read: (id: string, device: string, after: number, signal?: AbortSignal) => timedRequest<CallPage>(`/calls/${id}`, { query: { device_id: device, after }, signal }),
  action: (id: string, device: string, action: "accept" | "decline" | "end" | "fail") => timedRequest<{ call: CallSnapshot }>(`/calls/${id}/action`, { method: "POST", body: { action, device_id: device } }),
  heartbeat: (id: string, device: string) => timedRequest<{ call: CallSnapshot }>(`/calls/${id}/heartbeat`, { method: "POST", body: { device_id: device } }),
  signal: (id: string, device: string, packet: SignalInput) => timedRequest<{ id: number }>(`/calls/${id}/signals`, { method: "POST", body: { ...packet, device_id: device } }),
};
