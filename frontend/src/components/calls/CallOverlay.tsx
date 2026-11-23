import { useEffect, useState } from "react";
import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import { fullName } from "../../utils/format";
import { useCallTimer } from "./useCallTimer";
import { StreamMedia } from "./StreamMedia";
import type { useCallController } from "./useCallController";

/** Render incoming invitations and persistent, accessible audio/video controls. */
export function CallOverlay({ controller: c }: { controller: ReturnType<typeof useCallController> }) {
  const [minimized, setMinimized] = useState(false);
  const call = c.call;
  const elapsed = useCallTimer(call?.id, c.connected);
  useEffect(() => setMinimized(false), [call?.id]);
  if (!call && !c.busy && !c.notice) return null;
  if (!call) return <aside className="call-panel call-panel--notice" aria-label="Call status">
    <p role="status">{c.busy ? "Waiting for microphone or camera permission…" : c.notice}</p>
    <button type="button" className="link-button" onClick={c.busy ? c.end : c.dismissNotice}>{c.busy ? "Cancel" : "Dismiss"}</button>
  </aside>;
  const incoming = call.state === "ringing" && call.role === "callee";
  const title = incoming ? `Incoming ${call.mode} call` : call.state === "ringing" ? "Calling…" : c.connected ? `${call.mode === "video" ? "Video" : "Audio"} call` : "Connecting…";
  const elsewhere = !call.owned && !incoming;
  return <aside className={`call-panel${minimized && !incoming ? " call-panel--minimized" : ""}`}
    role={incoming ? "dialog" : "region"} aria-label={incoming ? title : "Active call"}>
    <header className="call-panel__head">
      <Avatar photoId={call.peer.photo_id} name={call.peer} size="sm" />
      <div><strong>{fullName(call.peer)}</strong><small>{elsewhere ? "Call open in another tab" : title}{elapsed ? <> · <time className="call-panel__timer" role="timer" aria-label="Call duration" aria-live="off">{elapsed}</time></> : null}</small></div>
      {!incoming ? <button type="button" className="icon-button" onClick={() => setMinimized(!minimized)} aria-label={minimized ? "Expand call" : "Minimize call"}><Icon name={minimized ? "plus" : "minus"} size={17} /></button> : null}
    </header>
    {call.mode === "video" && !incoming && call.owned ? <div className="call-panel__video" hidden={minimized}>
      {c.remote ? <StreamMedia stream={c.remote} video /> : <div className="call-panel__waiting"><Avatar photoId={call.peer.photo_id} name={call.peer} size="lg" /><p>{title}</p></div>}
      {c.local && !c.cameraOff ? <StreamMedia stream={c.local} video muted className="call-panel__preview" /> : null}
    </div> : null}
    {call.mode === "audio" && c.remote ? <StreamMedia stream={c.remote} video={false} /> : null}
    {c.notice ? <p role="status" className="call-panel__notice">{c.notice}</p> : null}
    {incoming ? <>
      <p className="call-panel__consent">Answering shares your microphone{call.mode === "video" ? " and camera" : ""} with this connection.</p>
      <div className="call-panel__controls call-panel__controls--incoming">
        <button type="button" className="call-answer call-answer--decline" aria-label="Decline" title="Decline call" onClick={c.decline}><Icon name="phone" size={22} /></button>
        <button type="button" className="call-answer call-answer--accept" aria-label="Answer" title={c.busy ? "Opening devices…" : "Answer call"} aria-busy={c.busy || undefined} disabled={c.busy} onClick={() => void c.accept()}><Icon name={c.busy ? "refresh" : "phone"} size={22} /></button>
        {c.busy ? <span className="sr-only" role="status">Opening devices…</span> : null}
      </div>
    </> : <div className="call-panel__controls call-panel__controls--active">
      {call.owned && call.state === "active" ? <>
        <button type="button" className={`call-control${c.muted ? " is-off" : ""}`} aria-label={c.muted ? "Unmute" : "Mute"} title={c.muted ? "Unmute microphone" : "Mute microphone"} aria-pressed={c.muted} onClick={c.toggleMute}><Icon name={c.muted ? "microphoneOff" : "microphone"} size={21} /></button>
        {call.mode === "video" ? <button type="button" className={`call-control${c.cameraOff ? " is-off" : ""}`} aria-label={c.cameraOff ? "Camera on" : "Camera off"} title={c.cameraOff ? "Turn camera on" : "Turn camera off"} aria-pressed={c.cameraOff} onClick={c.toggleCamera}><Icon name={c.cameraOff ? "videoOff" : "video"} size={21} /></button> : null}
      </> : null}
      <button type="button" className="call-answer call-answer--decline" aria-label={call.state === "ringing" ? "Cancel call" : "Hang up"} title={call.state === "ringing" ? "Cancel call" : "Hang up"} onClick={c.end}><Icon name="phone" size={22} /></button>
    </div>}
  </aside>;
}
