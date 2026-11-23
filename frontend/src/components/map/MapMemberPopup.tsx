import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import type { MapProfile } from "../../api/types/userMap";
import { fullName } from "../../utils/format";
import { MapMemberCard } from "./MapMemberCard";

interface Props { map: L.Map; person: MapProfile; anchor: L.LatLng; onClose: () => void }

/** Portal one React profile card into Leaflet while preserving router context and escaping. */
export function MapMemberPopup({ map, person, anchor, onClose }: Props) {
  const [host] = useState(() => document.createElement("div"));
  useEffect(() => {
    const width = Math.max(180, Math.min(340, map.getSize().x - 80));
    const popup = L.popup({ className: "user-map-popup", minWidth: width, maxWidth: width,
      autoPan: true, autoPanPadding: [20, 20], closeButton: true,
    }).setLatLng(anchor).setContent(host).openOn(map);
    L.DomEvent.disableClickPropagation(host);
    L.DomEvent.disableScrollPropagation(host);
    popup.on("remove", onClose);
    return () => { popup.off("remove", onClose); popup.remove(); };
  }, [map, anchor.lat, anchor.lng, host, onClose]);
  return createPortal(<section aria-label={`${fullName(person)} on the map`}>
    <MapMemberCard person={person} popup />
  </section>, host);
}
