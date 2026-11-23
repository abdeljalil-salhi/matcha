import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import { Icon } from "../ui/Icon";

interface Props {
  map: L.Map;
  showNavigation?: boolean;
  hasSavedArea: boolean;
  locating: boolean;
  onWorldwide: () => void;
  onSavedArea: () => void;
  onLocate: () => void;
}

/** Keep React controls in Leaflet's corners without capturing map gestures. */
export function MapControls({ map, hasSavedArea, locating, onWorldwide, onSavedArea, onLocate, showNavigation = true }: Props) {
  const [navigation] = useState(() => document.createElement("div"));
  const [position] = useState(() => document.createElement("div"));
  useEffect(() => {
    const controls = [
      { host: navigation, position: "topleft" as const, className: "user-map-navigation" },
      { host: position, position: "bottomright" as const, className: "user-map-position" },
    ].map(({ host, position: corner, className }) => {
      host.className = className;
      L.DomEvent.disableClickPropagation(host);
      L.DomEvent.disableScrollPropagation(host);
      const control = new L.Control({ position: corner });
      control.onAdd = () => host;
      control.addTo(map);
      return control;
    });
    return () => controls.forEach((control) => control.remove());
  }, [map, navigation, position]);
  return <>
    {showNavigation ? createPortal(<div className="user-map-control-group" role="group" aria-label="Map areas">
      <button type="button" onClick={onWorldwide} aria-label="Explore worldwide" title="Explore worldwide"><Icon name="compass" size={16} /><span>Worldwide</span></button>
      {hasSavedArea ? <button type="button" onClick={onSavedArea} aria-label="My saved area" title="My saved area"><Icon name="pin" size={16} /><span>My area</span></button> : null}
    </div>, navigation) : null}
    {createPortal(<div className="user-map-control-group user-map-control-group--vertical" role="group" aria-label="Map position and zoom">
      <button type="button" onClick={onLocate} disabled={locating} aria-busy={locating || undefined} aria-label="Center on my device" title="Center on my device (GPS stays local)"><Icon name={locating ? "refresh" : "crosshair"} size={19} /></button>
      <button type="button" onClick={() => map.zoomIn()} aria-label="Zoom in" title="Zoom in"><Icon name="plus" size={19} /></button>
      <button type="button" onClick={() => map.zoomOut()} aria-label="Zoom out" title="Zoom out"><Icon name="minus" size={19} /></button>
    </div>, position)}
  </>;
}
