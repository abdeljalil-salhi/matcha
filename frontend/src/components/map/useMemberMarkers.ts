import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { MapProfile } from "../../api/types/userMap";
import { photoUrl } from "../../api";
import { fullName } from "../../utils/format";
import { zoomToMembers } from "./clusterNavigation";
import { loadMarkerClusters } from "./markerClusters";

interface Entry { marker: L.Marker; latitude: number; longitude: number; photoId: number }
const MARKER_SIZE = 44;

function memberIcon(person: MapProfile): L.DivIcon {
  const image = document.createElement("img");
  image.src = photoUrl(person.photo_id);
  image.alt = "";
  const frame = document.createElement("span");
  frame.append(image);
  return L.divIcon({ html: frame, className: "user-map-pin", iconSize: [MARKER_SIZE, MARKER_SIZE], iconAnchor: [22, 22] });
}

/** Maintain individual markers in zoomable clusters without rebuilding them on each poll. */
export function useMemberMarkers(
  map: L.Map | null, profiles: MapProfile[],
  onSelect: (person: MapProfile, point: L.LatLng) => void,
  onError: (message: string) => void,
) {
  const [group, setGroup] = useState<L.MarkerClusterGroup | null>(null);
  const markers = useRef(new Map<number, Entry>());
  const latest = useRef({ profiles, onSelect, onError });
  latest.current = { profiles, onSelect, onError };

  useEffect(() => {
    if (!map) return;
    let disposed = false;
    let layer: L.MarkerClusterGroup | null = null;
    setGroup(null);
    void loadMarkerClusters().then(({ MarkerClusterGroup }) => {
      if (disposed) return;
      layer = new MarkerClusterGroup({
        maxClusterRadius: 55, zoomToBoundsOnClick: false, spiderfyOnMaxZoom: false,
        showCoverageOnHover: false, spiderfyDistanceMultiplier: 1.8,
        animate: !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
        iconCreateFunction: (cluster) => {
          const label = document.createElement("span");
          label.textContent = String(cluster.getChildCount());
          label.setAttribute("aria-label", `${cluster.getChildCount()} people. Zoom in to explore.`);
          return L.divIcon({ html: label, className: "user-map-cluster", iconSize: [44, 44] });
        },
      }).addTo(map);
      layer.on("clusterclick", (event) => zoomToMembers(layer!, map, event.layer));
      layer.on("clusterkeypress", (event) => {
        const original = (event as L.LeafletKeyboardEvent).originalEvent;
        if (original?.key === "Enter" || original?.key === " ") {
          zoomToMembers(layer!, map, event.layer);
        }
      });
      setGroup(layer);
    }).catch(() => { if (!disposed) latest.current.onError("Could not load map markers. Refresh the page to retry."); });
    return () => { disposed = true; layer?.remove(); markers.current.clear(); };
  }, [map]);

  useEffect(() => {
    if (!group) return;
    const ids = new Set(profiles.map((profile) => profile.id));
    for (const [id, entry] of markers.current) {
      if (!ids.has(id)) { group.removeLayer(entry.marker); markers.current.delete(id); }
    }
    for (const person of profiles) {
      let entry = markers.current.get(person.id);
      if (entry && (entry.latitude !== person.latitude || entry.longitude !== person.longitude)) {
        group.removeLayer(entry.marker); markers.current.delete(person.id); entry = undefined;
      }
      if (entry) {
        if (entry.photoId !== person.photo_id) { entry.marker.setIcon(memberIcon(person)); entry.photoId = person.photo_id; }
        continue;
      }
      const label = document.createElement("span");
      label.textContent = fullName(person);
      const marker = L.marker([person.latitude, person.longitude], {
        icon: memberIcon(person), title: `${fullName(person)}, ${person.age}`,
        alt: `View ${fullName(person)} on the map`, riseOnHover: true,
      }).bindTooltip(label).on("click", () => {
        const current = latest.current.profiles.find((profile) => profile.id === person.id);
        if (current) latest.current.onSelect(current, marker.getLatLng());
      });
      marker.on("add", () => marker.getElement()?.setAttribute("aria-label", `View ${fullName(person)} on the map`));
      markers.current.set(person.id, { marker, latitude: person.latitude, longitude: person.longitude, photoId: person.photo_id });
      group.addLayer(marker);
    }
  }, [group, profiles]);
}
