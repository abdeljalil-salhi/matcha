import Leaflet from "leaflet";
import "leaflet.markercluster/dist/MarkerCluster.css";

let pending: Promise<typeof import("leaflet.markercluster")> | null = null;

/** Load the stable plugin after supplying the Leaflet global its legacy build requires. */
export function loadMarkerClusters(): Promise<typeof import("leaflet.markercluster")> {
  Object.assign(globalThis, { L: Leaflet });
  if (!pending) pending = import("leaflet.markercluster").catch((error) => { pending = null; throw error; });
  return pending;
}
