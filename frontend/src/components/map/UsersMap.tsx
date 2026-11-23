import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api";
import type { MapBounds, MapProfile, MapSettings } from "../../api/types/userMap";
import { Button } from "../ui/Button";
import { MapMemberCard } from "./MapMemberCard";
import { MapSharing } from "./MapSharing";
import { UserMapCanvas } from "./UserMapCanvas";
import { useMapProfiles } from "./useMapProfiles";

/** Browse opted-in compatible members, without disclosing anyone's precise GPS. */
export function UsersMap() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<MapSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [selected, setSelected] = useState<MapProfile[]>([]);
  const { profiles, loading, error, limited, retry } = useMapProfiles(bounds);
  const loadSettings = useCallback(async () => {
    try { setSettings(await api.userMap.settings()); setSettingsError(null); }
    catch (cause) { setSettingsError(cause instanceof Error ? cause.message : "Unable to load map settings."); }
  }, []);
  useEffect(() => { void loadSettings(); }, [loadSettings, user?.location_set_at]);
  // Never retain a selected card after its profile disappears from the viewport response.
  const visibleSelection = profiles.filter((person) => selected.some((profile) => profile.id === person.id));
  const otherProfiles = profiles.filter((person) => !visibleSelection.some((profile) => profile.id === person.id));
  return <div className="user-map">
    {settingsError ? <div className="error-banner" role="alert">{settingsError} <Button onClick={() => void loadSettings()}>Retry</Button></div> : null}
    {!settings && !settingsError ? <p role="status">Loading map settings…</p> : null}
    {settings ? <>
      <MapSharing settings={settings} onSaved={setSettings} />
      <section className="card user-map__browse" aria-label="People on the map">
        <UserMapCanvas center={settings.center} profiles={profiles} onBounds={setBounds} onSelect={setSelected} selectedId={visibleSelection[0]?.id ?? null} />
        <p role="status">{loading ? "Loading people…" : `${profiles.length} ${profiles.length === 1 ? "person" : "people"} in this view`}</p>
        <details className="user-map__help"><summary>Map help & privacy</summary>
          <p>Tap a numbered cluster to zoom in, then select a person for their card. Shared points fan out at maximum zoom. All member positions are approximate. Device GPS only centers your map and is never saved. OpenStreetMap receives requests for the map areas you view.</p>
        </details>
        {error ? <div className="error-banner" role="alert">{error} <Button onClick={retry}>Retry</Button></div> : null}
        {limited ? <p role="status">Showing the first 1,000 people. Zoom in to see a smaller area.</p> : null}
        {!loading && !error && profiles.length === 0 ? <p>No opted-in compatible members in this view. Zoom out or explore another area.</p> : null}
      </section>
      {otherProfiles.length > 0 ? <section className="user-map__remaining" aria-label="Members in this map view">
        <header className="user-map__section-head">
          <div><h2>{visibleSelection.length ? "More people in this view" : "People in this view"}</h2><p>{otherProfiles.length} {otherProfiles.length === 1 ? "member" : "members"} to explore</p></div>
          {visibleSelection.length ? <button className="link-button" type="button" onClick={() => setSelected([])}>Clear selection</button> : null}
        </header>
        <div className="user-map__people">
          {otherProfiles.map((person) => <MapMemberCard key={person.id} person={person} />)}
        </div>
      </section> : null}
    </> : null}
  </div>;
}

