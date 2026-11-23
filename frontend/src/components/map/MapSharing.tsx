import { useEffect, useId, useState } from "react";
import { api } from "../../api";
import type { MapSettings } from "../../api/types/userMap";

interface Props { settings: MapSettings; onSaved: (settings: MapSettings) => void }

/** Save an explicit map-sharing choice directly, rolling back failed changes. */
export function MapSharing({ settings, onSaved }: Props) {
  const [visible, setVisible] = useState(settings.map_visible);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const descriptionId = useId();
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
      <details className="user-map__privacy"><summary>Privacy details</summary>
        <p id={descriptionId}>Turning this on consents to sharing your saved area with compatible members. Off by default. Positions are rounded to roughly 1 km; exact device GPS stays private. Your marker follows your saved profile location. Turn off anytime; other maps refresh periodically.</p>
      </details>
      {busy ? <span className="text-small text-muted" role="status">Saving…</span> : null}
    </div>
    {error ? <div className="error-banner" role="alert">{error}</div> : null}
  </section>;
}
