import { Icon } from "../ui/Icon";
import { useCalls } from "./CallContext";

/** Start calls only through an explicit action in a connected conversation. */
export function CallButtons({ userId }: { userId: number }) {
  const calls = useCalls();
  if (!calls) return null;
  return <div className="call-buttons" role="group" aria-label="Call this connection">
    <button type="button" className="icon-button" title="Audio call" aria-label="Start audio call" disabled={calls.busy || !!calls.call} onClick={() => void calls.start(userId, "audio")}><Icon name="phone" size={19} /></button>
    <button type="button" className="icon-button" title="Video call" aria-label="Start video call" disabled={calls.busy || !!calls.call} onClick={() => void calls.start(userId, "video")}><Icon name="video" size={19} /></button>
  </div>;
}
