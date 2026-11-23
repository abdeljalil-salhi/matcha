import { useEffect, useId, useRef, useState } from "react";
import { api } from "../../api";
import { Icon } from "../ui/Icon";
import type { MapSettings } from "../../api/types/userMap";

interface Props { settings: MapSettings; onSaved: (settings: MapSettings) => void }

/** Save an explicit map-sharing choice directly, rolling back failed changes. */
export function MapSharing({ settings, onSaved }: Props) {
  const [visible, setVisible] = useState(settings.map_visible);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const descriptionId = useId();
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const privacy = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!privacyOpen) return;
    const outside = (event: PointerEvent) => {
      if (!privacy.current?.contains(event.target as Node)) setPrivacyOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [privacyOpen]);
  useEffect(() => setVisible(settings.map_visible), [settings.map_visible]);
  const save = async (next: boolean) => {
    setVisible(next); setBusy(true); setError(null);
    try { onSaved(await api.userMap.share(next)); }
    catch (cause) {
      setVisible(settings.map_visible);
      setError(cause instanceof Error ? cause.message : "Unable to update map sharing.");
    } finally { setBusy(false); }
  };
  return <section className="user-map__sharing" aria-label="Your map visibility">
    <div className="user-map__sharing-row">
      <label className="user-map__sharing-toggle">
        <input type="checkbox" checked={visible} disabled={busy} aria-describedby={descriptionId} onChange={(event) => void save(event.target.checked)} />
        <span>Show my approximate area</span>
      </label>
      <div className="user-map__privacy" ref={privacy}
        onPointerEnter={() => setPrivacyOpen(true)}
        onPointerLeave={(event) => {
          if (!event.currentTarget.contains(document.activeElement)) setPrivacyOpen(false);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPrivacyOpen(false);
        }}>
        <button type="button" className="user-map__privacy-info" aria-label="Map privacy details"
          aria-describedby={descriptionId} aria-expanded={privacyOpen}
          onFocus={() => setPrivacyOpen(true)} onClick={() => setPrivacyOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") { setPrivacyOpen(false); event.stopPropagation(); }
          }}>
          <Icon name="info" size={15} />
        </button>
        <span id={descriptionId} role="tooltip" className="user-map__privacy-tooltip" hidden={!privacyOpen}>
          Turning this on consents to sharing your saved area with compatible members. Off by default.
          Positions are rounded to roughly 1 km; exact device GPS stays private. Your marker follows
          your saved profile location. Turn off anytime; other maps refresh periodically.
        </span>
      </div>
      {busy ? <span className="text-small text-muted" role="status">Saving…</span> : null}
    </div>
    {error ? <div className="error-banner" role="alert">{error}</div> : null}
  </section>;
}
