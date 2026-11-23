import L from "leaflet";

const ZOOM_DURATION_SECONDS = 0.65;

/** Zoom clusters first, separating coincident public points only at maximum zoom. */
export function zoomToMembers(group: L.MarkerClusterGroup, map: L.Map, cluster: L.MarkerCluster): void {
  map.closePopup();
  map.stop();
  if (map.getZoom() >= map.getMaxZoom()) { cluster.spiderfy(); return; }
  const revealSharedPoint = () => {
    if (map.getZoom() < map.getMaxZoom()) return;
    const first = cluster.getAllChildMarkers()[0];
    const parent = first ? group.getVisibleParent(first) : null;
    if (parent && "spiderfy" in parent && typeof parent.spiderfy === "function") parent.spiderfy();
  };
  const animate = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  map.once("moveend", () => {
    // Animated clusters finish rebuilding after the map has stopped moving.
    if (animate && map.getZoom() >= map.getMaxZoom()) group.once("animationend", revealSharedPoint);
    revealSharedPoint();
  });
  const bounds = cluster.getBounds();
  const zoom = Math.min(map.getMaxZoom(), Math.max(map.getZoom() + 1, map.getBoundsZoom(bounds, false, L.point(64, 64))));
  map.flyTo(bounds.getCenter(), zoom, {
    duration: ZOOM_DURATION_SECONDS,
    animate,
  });
}
