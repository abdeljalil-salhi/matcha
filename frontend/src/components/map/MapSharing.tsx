import { useEffect, useState } from "react";
import { api } from "../../api";
import type { MapSettings } from "../../api/types/userMap";
import { Button } from "../ui/Button";

interface Props { settings: MapSettings; onSaved: (settings: MapSettings) => void }

/** Save a separate, reversible opt-in without enabling GPS or changing matching location. */
export function MapSharing({ settings, onSaved }: Props) {
  const [visible, setVisible] = useState(settings.map_visible);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setVisible(settings.map_visible), [settings.map_visible]);
  const save = async () => {
    setBusy(true); setError(null); setSaved(false);
    try { onSaved(await api.userMap.share(visible)); setSaved(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update map sharing."); }
    finally { setBusy(false); }
  };
  return <section className="card user-map__sharing" aria-label="Your map visibility">
    <h2>Your map visibility</h2>
    <label className="consent-row">
      <input type="checkbox" checked={visible} disabled={busy} onChange={(event) => { setVisible(event.target.checked); setSaved(false); }} />
      <span>Show my approximate saved area to compatible members on the map. I consent to this separate map sharing.</span>
    </label>
    <p className="text-small text-muted">Off by default. Markers use rounded area coordinates, roughly 1 km, and never your exact device GPS. Your marker follows changes to your saved profile location. Turn this off at any time; other maps refresh periodically.</p>
    <Button onClick={() => void save()} loading={busy} disabled={visible === settings.map_visible}>Save map visibility</Button>
    {error ? <div className="error-banner" role="alert">{error}</div> : null}
    {saved ? <p role="status">{settings.map_visible ? "Your approximate area is now shared." : "You are hidden from the map."}</p> : null}
  </section>;
}
