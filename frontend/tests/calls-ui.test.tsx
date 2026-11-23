import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CallOverlay } from "../src/components/calls/CallOverlay";
import { StreamMedia } from "../src/components/calls/StreamMedia";
import type { useCallController } from "../src/components/calls/useCallController";

function controller(): ReturnType<typeof useCallController> {
  return {
    call: { id: "test-call", mode: "video", state: "ringing", role: "callee", owned: false,
      created_at: "2026-01-01T00:00:00Z", peer: { id: 2, username: "bob", first_name: "Bob", last_name: "Example", photo_id: null } },
    local: null, remote: null, busy: false, connected: false, muted: false, cameraOff: false, notice: null,
    start: vi.fn(), accept: vi.fn(), decline: vi.fn(), end: vi.fn(), toggleMute: vi.fn(), toggleCamera: vi.fn(), dismissNotice: vi.fn(),
  };
}
afterEach(() => vi.restoreAllMocks());

test("incoming video calls explicitly disclose devices and offer answer or decline", () => {
  const calls = controller();
  render(<CallOverlay controller={calls} />);
  expect(screen.getByRole("dialog", { name: "Incoming video call" })).toBeTruthy();
  expect(screen.getByText(/Answering shares your microphone and camera/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Answer" })); expect(calls.accept).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Decline" })); expect(calls.decline).toHaveBeenCalled();
});

test("active call controls remain available when minimized", () => {
  const calls = controller(); calls.call = { ...calls.call!, state: "active", owned: true }; calls.connected = true;
  render(<CallOverlay controller={calls} />);
  fireEvent.click(screen.getByRole("button", { name: "Mute" })); expect(calls.toggleMute).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Camera off" })); expect(calls.toggleCamera).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Minimize call" }));
  expect(screen.getByRole("button", { name: "Expand call" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Hang up" })); expect(calls.end).toHaveBeenCalled();
});

test("streams attach without recording and detach on unmount", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  const stream = {} as MediaStream;
  const { unmount } = render(<StreamMedia stream={stream} video />);
  const video = screen.getByLabelText("Remote video") as HTMLVideoElement;
  await act(async () => {});
  expect(video.srcObject).toBe(stream); expect(play).toHaveBeenCalled();
  unmount(); expect(video.srcObject).toBeNull();
});

test("blocked autoplay offers an explicit playback button", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValueOnce(new Error("autoplay denied")).mockResolvedValue(undefined);
  render(<StreamMedia stream={{} as MediaStream} video={false} />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Play call audio" }));
  await act(async () => {});
  expect(screen.queryByRole("button", { name: "Play call audio" })).toBeNull();
});

test("the call timer starts only on connection and survives minimizing and reconnecting", () => {
  vi.useFakeTimers();
  try {
    const calls = controller(); calls.call = { ...calls.call!, state: "active", owned: true };
    const { rerender } = render(<CallOverlay controller={calls} />);
    expect(screen.queryByRole("timer")).toBeNull();
    act(() => vi.advanceTimersByTime(5000));
    calls.connected = true; rerender(<CallOverlay controller={calls} />);
    expect(screen.getByRole("timer").textContent).toBe("00:00");
    act(() => vi.advanceTimersByTime(65000));
    expect(screen.getByRole("timer").textContent).toBe("01:05");
    fireEvent.click(screen.getByRole("button", { name: "Minimize call" }));
    calls.connected = false; rerender(<CallOverlay controller={calls} />);
    act(() => vi.advanceTimersByTime(2000));
    calls.connected = true; rerender(<CallOverlay controller={calls} />);
    expect(screen.getByRole("timer").textContent).toBe("01:07");
    calls.call = { ...calls.call!, id: "new-call" }; calls.connected = false;
    rerender(<CallOverlay controller={calls} />);
    expect(screen.queryByRole("timer")).toBeNull();
  } finally { vi.useRealTimers(); }
});

test("muted microphone and disabled camera use distinct icons with accessible actions", () => {
  const calls = controller(); calls.call = { ...calls.call!, state: "active", owned: true };
  calls.muted = true; calls.cameraOff = true;
  render(<CallOverlay controller={calls} />);
  expect(screen.getByRole("button", { name: "Unmute" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Camera on" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Unmute" })); expect(calls.toggleMute).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Camera on" })); expect(calls.toggleCamera).toHaveBeenCalled();
});
