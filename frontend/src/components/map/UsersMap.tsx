import { useCallback, useEffect, useState } from "react";
import L from "leaflet";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api";
import type { MapBounds, MapProfile, MapSettings } from "../../api/types/userMap";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { PlacesMap } from "./PlacesMap";
import { MapSidebarMember } from "./MapSidebarMember";
import { MapQuickFilters } from "./MapQuickFilters";
import { MapSharing } from "./MapSharing";
import { UserMapCanvas, type MapAreaRequest } from "./UserMapCanvas";
import { useMapProfiles } from "./useMapProfiles";

const DEFAULT_FILTERS = { minAge: 18, maxAge: 120, distance: "", interest: "", fame: 0 };

/** Browse opted-in compatible members using their approximate public locations. */
export function UsersMap() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<MapSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [selected, setSelected] = useState<MapProfile[]>([]);
  const [areaRequest, setAreaRequest] = useState<MapAreaRequest>({ mode: "nearby", revision: 0 });
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [placesOpen, setPlacesOpen] = useState(false);
  const { profiles, loading, error, limited, retry } = useMapProfiles(bounds);
  const loadSettings = useCallback(async () => {
    try {
      const saved = await api.userMap.settings();
      setSettings(saved);
      setAreaRequest((current) => current.revision === 0
        ? { ...current, mode: saved.center ? "nearby" : "worldwide" } : current);
      setSettingsError(null);
    }
    catch (cause) { setSettingsError(cause instanceof Error ? cause.message : "Unable to load map settings."); }
  }, []);
  useEffect(() => { void loadSettings(); }, [loadSettings, user?.location_set_at]);
  const distanceTo = (person: MapProfile) => settings?.center
    ? L.latLng(settings.center.latitude, settings.center.longitude).distanceTo([person.latitude, person.longitude]) / 1000
    : null;
  const visible = profiles.filter((person) => person.age >= filters.minAge && person.age <= filters.maxAge
    && person.fame >= filters.fame && (!filters.interest || person.tags?.includes(filters.interest))
    && (!filters.distance || (distanceTo(person) ?? Infinity) <= Number(filters.distance)));
  const selectedId = visible.find((person) => selected.some((entry) => entry.id === person.id))?.id ?? null;
  const tags = [...new Set([...profiles.flatMap((person) => person.tags ?? []), filters.interest].filter(Boolean))].sort();
  const filterCount = Number(filters.minAge !== 18 || filters.maxAge !== 120) + Number(Boolean(filters.distance))
    + Number(Boolean(filters.interest)) + Number(filters.fame > 0);
  const navigateArea = (mode: MapAreaRequest["mode"]) => {
    setSelected([]);
    setAreaRequest((current) => ({ mode, revision: current.revision + 1 }));
  };
  return <div className="user-map">
    {settingsError ? <div className="error-banner" role="alert">{settingsError} <Button onClick={() => void loadSettings()}>Retry</Button></div> : null}
    {!settings && !settingsError ? <p role="status">Loading map settings…</p> : null}
    {settings ? <section className="map-explorer card" aria-label="People on the map">
      <aside className="map-explorer__sidebar">
        <div className="map-explorer__navigation" role="group" aria-label="Map areas">
          <button type="button" className={areaRequest.mode !== "worldwide" ? "is-active" : ""} aria-pressed={areaRequest.mode !== "worldwide"} disabled={!settings.center} onClick={() => navigateArea("nearby")}><Icon name="pin" size={17} /> Nearby</button>
          <button type="button" className={areaRequest.mode === "worldwide" ? "is-active" : ""} aria-pressed={areaRequest.mode === "worldwide"} onClick={() => navigateArea("worldwide")}><Icon name="compass" size={17} /> Worldwide</button>
        </div>
        <MapSharing settings={settings} onSaved={setSettings} />
        <div className="map-explorer__list-head"><h2>People nearby</h2><span>{visible.length} shown</span></div>
        <div className="map-explorer__members" aria-label="Members in this map view">
          {visible.map((person) => <MapSidebarMember key={person.id} person={person} distance={distanceTo(person)} selected={selectedId === person.id} onSelect={() => setSelected([person])} />)}
          {!loading && !error && !visible.length ? <p className="map-explorer__empty">No compatible members in this view. Adjust the filters or explore another area.</p> : null}
        </div>
        <div className="map-explorer__sidebar-footer">
          <Button full onClick={() => setFiltersOpen(true)} icon={<Icon name="sliders" size={18} />}>Filter people{filterCount ? <span className="map-explorer__filter-count">{filterCount}</span> : null}</Button>
          <button type="button" className="link-button" onClick={() => setPlacesOpen(true)}>Change matching area</button>
        </div>
      </aside>
      <div className="map-explorer__main">
        <div className="map-explorer__map">
          <MapQuickFilters filters={filters} onChange={setFilters} tags={tags}
            hasSavedArea={Boolean(settings.center)} onMoreFilters={() => setFiltersOpen(true)} />
          <UserMapCanvas center={settings.center} profiles={visible} onBounds={setBounds} onSelect={setSelected} selectedId={selectedId} areaRequest={areaRequest} />
        </div>
        <footer className="map-explorer__summary">
          <Icon name="userPlus" size={26} />
          <div><strong role="status">{loading ? "Loading people…" : `${visible.length} compatible ${visible.length === 1 ? "member" : "members"} in this area`}</strong><p>Approximate areas · Based on your preferences</p></div>
          <Button variant="soft" onClick={() => navigateArea("all")} disabled={!visible.length} icon={<Icon name="heart" size={16} />}>See all on map ({visible.length}) <Icon name="arrowRight" size={16} /></Button>
        </footer>
        {error ? <div className="error-banner" role="alert">{error} <Button onClick={retry}>Retry</Button></div> : null}
        {limited ? <p role="status">Showing the first 1,000 people. Zoom in to see a smaller area.</p> : null}
      </div>
    </section> : null}
    <Modal open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter people" size="sm" footer={<><Button variant="ghost" onClick={() => setFilters(DEFAULT_FILTERS)}>Reset filters</Button><Button onClick={() => setFiltersOpen(false)}>Show {visible.length} people</Button></>}>
      <div className="map-explorer__filters">
        <label>Interests<select className="input" value={filters.interest} onChange={(event) => setFilters({ ...filters, interest: event.target.value })}><option value="">Any interest</option>{tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select></label>
        <label>Minimum age<input className="input" type="number" min={18} max={120} value={filters.minAge} onChange={(event) => { const minAge = Math.max(18, Math.min(120, Number(event.target.value))); setFilters({ ...filters, minAge, maxAge: Math.max(minAge, filters.maxAge) }); }} /></label>
        <label>Maximum age<input className="input" type="number" min={18} max={120} value={filters.maxAge} onChange={(event) => { const maxAge = Math.max(18, Math.min(120, Number(event.target.value))); setFilters({ ...filters, maxAge, minAge: Math.min(maxAge, filters.minAge) }); }} /></label>
        <label>Distance from your saved area<select className="input" value={filters.distance} disabled={!settings?.center} onChange={(event) => setFilters({ ...filters, distance: event.target.value })}><option value="">Anywhere</option>{[5, 10, 25, 50, 100, 250].map((distance) => <option key={distance} value={distance}>{distance} km</option>)}</select></label>
        <label>Minimum fame<input className="input" type="number" min={0} max={100} value={filters.fame} onChange={(event) => setFilters({ ...filters, fame: Math.max(0, Math.min(100, Number(event.target.value))) })} /></label>
        <p className="text-small text-muted">Filters apply to members loaded in the current map view. Distances use approximate shared areas.</p>
      </div>
    </Modal>
    <Modal open={placesOpen} onClose={() => setPlacesOpen(false)} title="Choose your matching area" size="lg">{placesOpen ? <PlacesMap /> : null}</Modal>
  </div>;
}
