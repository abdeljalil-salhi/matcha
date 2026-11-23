import { useEffect, useRef, useState } from "react";

interface Props { stream: MediaStream; video: boolean; muted?: boolean; className?: string }

/** Attach live media without recording, exposing playback when autoplay is blocked. */
export function StreamMedia({ stream, video, muted = false, className = "" }: Props) {
  const element = useRef<HTMLMediaElement | null>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    let disposed = false;
    node.srcObject = stream;
    void node.play()?.catch(() => { if (!disposed && !muted) setBlocked(true); });
    return () => { disposed = true; node.srcObject = null; };
  }, [stream, muted]);
  const play = () => { void element.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true)); };
  return <div className={`call-media ${className}`}>
    {video ? <video ref={(node) => { element.current = node; }} autoPlay playsInline muted={muted} aria-label={muted ? "Your camera preview" : "Remote video"} />
      : <audio ref={(node) => { element.current = node; }} autoPlay aria-label="Call audio" />}
    {blocked ? <button type="button" className="btn btn--secondary btn--sm call-media__play" onClick={play}>Play call audio</button> : null}
  </div>;
}
