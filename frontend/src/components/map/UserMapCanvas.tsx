import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapBounds, MapCenter, MapProfile } from "../../api/types/userMap";
import { useMemberMarkers } from "./useMemberMarkers";
import { MapMemberPopup } from "./MapMemberPopup";
import { MapControls } from "./MapControls";

export interface MapAreaRequest { mode: "nearby" | "worldwide" | "all"; revision: number }

interface Props {
  areaRequest?: MapAreaRequest;
  center: MapCenter | null;
  profiles: MapProfile[];
  onBounds: (bounds: MapBounds) => void;
  onSelect: (profiles: MapProfile[]) => void;
  selectedId?: number | null;
}

const GPS_TIMEOUT_MS = 15000;
const WORLD_CENTER: L.LatLngTuple = [25, 0];
const WORLD_ZOOM = 2;
const PUBLIC_GRID = 100;
const normalizeLongitude = (value: number) => ((value + 180) % 360 + 360) % 360 - 180;

/** Round viewport bounds outwards so requests do not reveal a precise GPS center. */
export function publicBounds(map: L.Map): MapBounds {
  const bounds = map.getBounds();
  const allLongitudes = bounds.getEast() - bounds.getWest() >= 360;
  return {
    west: allLongitudes ? -180 : Math.max(-180, Math.floor(normalizeLongitude(bounds.getWest()) * PUBLIC_GRID) / PUBLIC_GRID),
    east: allLongitudes ? 180 : Math.min(180, Math.ceil(normalizeLongitude(bounds.getEast()) * PUBLIC_GRID) / PUBLIC_GRID),
    south: Math.max(-90, Math.floor(bounds.getSouth() * PUBLIC_GRID) / PUBLIC_GRID),
    north: Math.min(90, Math.ceil(bounds.getNorth() * PUBLIC_GRID) / PUBLIC_GRID),
  };
}

/** Render public area markers; precise device coordinates remain local to this map. */
export function UserMapCanvas({ center, profiles, onBounds, onSelect, selectedId = null, areaRequest }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const ownMarker = useRef<L.CircleMarker | null>(null);
  const initialCenter = useRef(center);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [tileError, setTileError] = useState(false);
  const alive = useRef(false);
  const [popupMap, setPopupMap] = useState<L.Map | null>(null);
  const [popupAnchor, setPopupAnchor] = useState<L.LatLng | null>(null);
  const closeSelection = useCallback(() => onSelect([]), [onSelect]);
  const selectMember = useCallback((person: MapProfile, point: L.LatLng) => {
    setPopupAnchor(point); onSelect([person]);
  }, [onSelect]);
  useMemberMarkers(popupMap, profiles, selectMember, setError);
  const currentProfiles = useRef(profiles);
  currentProfiles.current = profiles;
  const selected = profiles.find((person) => person.id === selectedId);

  useEffect(() => {
    alive.current = true;
    if (!container.current) return;
    const map = L.map(container.current, { worldCopyJump: true, maxZoom: 18, zoomControl: false });
    const saved = initialCenter.current;
    map.setView(saved ? [saved.latitude, saved.longitude] : WORLD_CENTER, saved ? 10 : WORLD_ZOOM);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).on("tileerror", () => setTileError(true)).on("tileload", () => setTileError(false)).addTo(map);
    const moved = () => onBounds(publicBounds(map));
    map.on("moveend", moved);
    mapRef.current = map;
    setPopupMap(map);
    moved();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container.current);
    return () => {
      alive.current = false;
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [onBounds]);

  useEffect(() => {
    if (center) mapRef.current?.setView([center.latitude, center.longitude], 10);
  }, [center?.latitude, center?.longitude]);


  useEffect(() => {
    const map = mapRef.current;
    if (!map || !areaRequest) return;
    map.closePopup();
    if (areaRequest.mode === "worldwide") map.setView(WORLD_CENTER, WORLD_ZOOM);
    else if (areaRequest.mode === "all" && currentProfiles.current.length) {
      map.fitBounds(L.latLngBounds(currentProfiles.current.map((person) => [person.latitude, person.longitude])), { padding: [50, 50], maxZoom: 13 });
    } else if (center) map.setView([center.latitude, center.longitude], 10);
  }, [areaRequest]);

  useEffect(() => {
    if (!selected || !mapRef.current) return;
    const point = L.latLng(selected.latitude, selected.longitude);
    setPopupAnchor(point);
    mapRef.current.panInside(point, { padding: [60, 60] });
  }, [selectedId]);

  const locate = () => {
    setError(null);
    if (!navigator.geolocation) { setError("Device location is unavailable. You can still browse the map."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition((position) => {
      if (!alive.current || !mapRef.current) return;
      const point: L.LatLngExpression = [position.coords.latitude, position.coords.longitude];
      ownMarker.current?.remove();
      ownMarker.current = L.circleMarker(point, { color: "#df7654", radius: 8 }).addTo(mapRef.current);
      const label = document.createElement("span");
      label.textContent = "Your device position (only on your map)";
      ownMarker.current.bindTooltip(label);
      mapRef.current.setView(point, 13);
      setLocating(false);
    }, () => {
      if (!alive.current) return;
      setLocating(false);
      setError("Could not access your device location. Allow browser permission or browse manually.");
    }, { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 0 });
  };

  return <>
    {error ? <div className="error-banner" role="alert">{error}</div> : null}
    {tileError ? <p role="status">Some map tiles could not load. Check your connection.</p> : null}
    <div ref={container} className="user-map__canvas" aria-label="Map of opted-in members" />
    {popupMap ? <MapControls map={popupMap} hasSavedArea={!!center} locating={locating}
      onWorldwide={() => { popupMap.closePopup(); popupMap.setView(WORLD_CENTER, WORLD_ZOOM); }}
      onSavedArea={() => { if (center) { popupMap.closePopup(); popupMap.setView([center.latitude, center.longitude], 10); } }}
      onLocate={locate} showNavigation={!areaRequest} /> : null}
    {popupMap && popupAnchor && selected ? <MapMemberPopup map={popupMap} person={selected} anchor={popupAnchor} onClose={closeSelection} /> : null}
  </>;
}
