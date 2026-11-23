import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { CityLocationSuggestion } from "../../api/types";
import { api } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { CityConfirmationRequired, lookupNetworkLocation, saveDetectedLocation } from "../../utils/location";
import { FEATURED_CHOICES, LOCATION_CHOICES, type LocationChoice } from "../../data/locations";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { LocationAttribution } from "../profile/LocationAttribution";
import { CityLocationConfirmation } from "../profile/CityLocationConfirmation";

const CITY_CHOICES = LOCATION_CHOICES.filter((choice) => choice.kind === "city");
const FEATURED_CITIES = FEATURED_CHOICES.filter((choice) => choice.kind === "city");
const NEIGHBORHOOD_CHOICES = LOCATION_CHOICES.filter((choice) => choice.kind === "neighborhood");
const DEFAULT_BOUNDS = L.latLngBounds(LOCATION_CHOICES.map((choice) => [choice.latitude, choice.longitude]));
const NEIGHBORHOOD_ZOOM = 7;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );

type Selection =
  | { type: "place"; choice: LocationChoice }
  | { type: "self"; latitude: number; longitude: number; label: string }
  | null;

interface OwnPosition {
  latitude: number;
  longitude: number;
  label: string;
}

const pinIcon = (label: string, self = false) =>
  L.divIcon({
    className: `places-map-pin${self ? " places-map-pin--self" : ""}`,
    html: `<span class="places-map-pin__dot"></span><span class="places-map-pin__label">${escapeHtml(label)}</span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

const geoMessage = (error: GeolocationPositionError) => {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location permission was blocked. Allow it for this site in your browser, or use approximate network location.";
  }
  if (error.code === error.TIMEOUT) {
    return "Getting your location timed out. Try again, or use approximate network location.";
  }
  return "Your location isn't available right now. Try again, or use approximate network location.";
};

export function PlacesMap() {
  const [citySuggestion, setCitySuggestion] = useState<CityLocationSuggestion | null>(null);
  const { refresh } = useAuth();
  const { notify } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const ownMarkerRef = useRef<L.Marker | null>(null);
  const selectedRef = useRef<Selection>(null);
  const [zoomLevel, setZoomLevel] = useState(3);
  const [selected, setSelected] = useState<Selection>(null);
  const [own, setOwn] = useState<OwnPosition | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [tileError, setTileError] = useState(false);
  const [consentToSave, setConsentToSave] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  selectedRef.current = selected;

  useEffect(() => { setCitySuggestion(null); }, [selected]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, { zoomControl: false, scrollWheelZoom: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    })
      .on("tileerror", () => setTileError(true))
      .on("tileload", () => setTileError(false))
      .addTo(map);

    map.fitBounds(DEFAULT_BOUNDS, { padding: [36, 36], maxZoom: 3 });
    map.on("zoomend", () => setZoomLevel(map.getZoom()));
    mapRef.current = map;
    setZoomLevel(map.getZoom());
    const observer = typeof ResizeObserver === "undefined" ? null
      : new ResizeObserver(() => map.invalidateSize());
    observer?.observe(container);

    return () => {
      observer?.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateMarkers = () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();

      const zoom = map.getZoom();
      const pool =
        zoom >= NEIGHBORHOOD_ZOOM
          ? NEIGHBORHOOD_CHOICES
          : zoom >= 5
            ? CITY_CHOICES
            : FEATURED_CITIES;
      const bounds = map.getBounds().pad(0.2);
      for (const choice of pool) {
        if (!bounds.contains([choice.latitude, choice.longitude])) continue;
        const marker = L.marker([choice.latitude, choice.longitude], {
          icon: pinIcon(choice.label),
          title: `${choice.label} — ${choice.detail}`,
          riseOnHover: true,
        }).addTo(map);
        marker.on("click", () => {
          setSelected({ type: "place", choice });
          map.flyTo(
            [choice.latitude, choice.longitude],
            Math.max(map.getZoom(), NEIGHBORHOOD_ZOOM + 1),
            { duration: 0.6 },
          );
        });
        markersRef.current.set(choice.id, marker);
      }
      markersRef.current.forEach((marker, id) => {
        marker.getElement()?.classList.toggle(
          "is-selected",
          selectedRef.current?.type === "place" && selectedRef.current.choice.id === id,
        );
      });
    };

    updateMarkers();
    map.on("moveend", updateMarkers);
    return () => {
      map.off("moveend", updateMarkers);
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
    };
    // Selection styling is handled by the effect below; rebuilding markers on
    // every click would make the map feel jumpy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    ownMarkerRef.current?.remove();
    ownMarkerRef.current = null;
    if (!own) return;

    const marker = L.marker([own.latitude, own.longitude], {
      icon: pinIcon("You", true),
      title: `Your approximate area — ${own.label}`,
      riseOnHover: true,
      zIndexOffset: 1000,
    }).addTo(map);
    marker.on("click", () => setSelected({ type: "self", ...own }));
    ownMarkerRef.current = marker;
    map.flyTo([own.latitude, own.longitude], Math.max(map.getZoom(), 10), { duration: 0.6 });

    return () => {
      marker.remove();
      if (ownMarkerRef.current === marker) ownMarkerRef.current = null;
    };
  }, [own]);

  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      marker.getElement()?.classList.toggle("is-selected", selected?.type === "place" && selected.choice.id === id);
    });
    ownMarkerRef.current?.getElement()?.classList.toggle("is-selected", selected?.type === "self");
  }, [selected, zoomLevel, own]);

  const fitAll = () => {
    mapRef.current?.fitBounds(DEFAULT_BOUNDS, { padding: [36, 36], maxZoom: 3 });
  };

  const locate = () => {
    setCitySuggestion(null);
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationError("Your browser doesn't support device location. Use approximate network location instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const positionValue: OwnPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: "Device location",
        };
        setLocating(false);
        setOwn(positionValue);
        setSelected({ type: "self", ...positionValue });
      },
      (error) => {
        setLocating(false);
        setLocationError(geoMessage(error));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const locateByNetwork = async () => {
    setCitySuggestion(null);
    setLocationError(null);
    setLocating(true);
    try {
      const found = await lookupNetworkLocation();
      const positionValue: OwnPosition = {
        latitude: found.latitude,
        longitude: found.longitude,
        label: found.label,
      };
      setOwn(positionValue);
      setSelected({ type: "self", ...positionValue });
    } catch (cause) {
      setLocationError(cause instanceof Error ? cause.message : "Unable to get an approximate location.");
    } finally {
      setLocating(false);
    }
  };

  const savePlace = async (choice: LocationChoice) => {
    setSavingId(choice.id);
    setCitySuggestion(null);
    setSaveError(null);
    try {
      await api.profile.setLocation({ source: "manual", query: choice.query });
      await refresh();
      notify(`${choice.label} saved as your area.`, "success");
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Unable to save that area.");
    } finally {
      setSavingId(null);
    }
  };

  const saveOwnLocation = async () => {
    if (!own || !consentToSave) return;
    setSavingId("self");
    setCitySuggestion(null);
    setSaveError(null);
    try {
      await saveDetectedLocation(own.latitude, own.longitude);
      await refresh();
      notify("Approximate location saved.", "success");
    } catch (cause) {
      if (cause instanceof CityConfirmationRequired) setCitySuggestion(cause.suggestion);
      else setSaveError(cause instanceof Error ? cause.message : "Unable to save your location.");
    } finally {
      setSavingId(null);
    }
  };

  const confirmCity = async () => {
    if (!citySuggestion || savingId) return;
    setSavingId("city");
    setSaveError(null);
    try {
      await api.profile.setLocation({ source: "manual", confirmation_token: citySuggestion.confirmation_token });
      setCitySuggestion(null);
      await refresh();
      notify("City saved as your approximate location.", "success");
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Unable to save your city.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="places-map">
      <div className="places-map__toolbar">
        <div>
          <h3>Places near you</h3>
          <p className="text-muted">
            Real OpenStreetMap tiles.{" "}
            {zoomLevel < 5
              ? "Featured places are shown — zoom in for every city."
              : zoomLevel < NEIGHBORHOOD_ZOOM
                ? "All built-in cities are visible — zoom in for neighborhoods."
                : "Neighborhood pins are visible."}
          </p>
        </div>
        <div className="places-map__actions">
          <Button
            variant="secondary"
            size="sm"
            loading={locating}
            icon={<Icon name="crosshair" size={16} />}
            onClick={locate}
          >
            Use my device
          </Button>
          <Button size="sm" loading={locating} onClick={() => void locateByNetwork()}>
            Use approximate location
          </Button>
        </div>
      </div>

      {locationError ? <div className="error-banner" role="alert">{locationError}</div> : null}
      {tileError ? <div className="notice notice--info" role="status">Some map tiles could not load. Check your connection.</div> : null}
      {citySuggestion ? <CityLocationConfirmation
        suggestion={citySuggestion} busy={savingId !== null}
        onConfirm={() => void confirmCity()} onCancel={() => setCitySuggestion(null)}
      /> : null}
      {saveError ? <div className="error-banner" role="alert">{saveError}</div> : null}

      <div className="places-map__leaflet-wrap">
        <div ref={containerRef} className="places-map__leaflet" aria-label="OpenStreetMap map of supported places" />
        <div className="places-map__controls" aria-label="Map controls">
          <button type="button" onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in">
            <Icon name="plus" size={17} />
          </button>
          <button type="button" onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out">
            <Icon name="minus" size={17} />
          </button>
          <button type="button" onClick={fitAll} aria-label="Show all places">
            <Icon name="refresh" size={16} />
          </button>
        </div>
      </div>

      <LocationAttribution />
      <div className="places-map__detail">
        {selected?.type === "place" ? (
          <>
            <span className="places-map__detail-icon"><Icon name="pin" size={18} /></span>
            <div className="places-map__detail-copy">
              <strong>{selected.choice.label}</strong>
              <span className="text-small text-muted">
                {selected.choice.detail} · {selected.choice.latitude}, {selected.choice.longitude}
              </span>
            </div>
            <Button
              size="sm"
              loading={savingId === selected.choice.id}
              onClick={() => void savePlace(selected.choice)}
            >
              Use this area
            </Button>
          </>
        ) : selected?.type === "self" ? (
          <>
            <span className="places-map__detail-icon places-map__detail-icon--self">
              <Icon name="crosshair" size={18} />
            </span>
            <div className="places-map__detail-copy">
              <strong>Your approximate area</strong>
              <span className="text-small text-muted">
                {selected.label} · {selected.latitude}, {selected.longitude}
              </span>
            </div>
            <div className="places-map__save">
              <label className="consent-row">
                <input type="checkbox" checked={consentToSave} onChange={(event) => setConsentToSave(event.target.checked)} />
                <span>
                  I consent to saving this approximate location for matching.
                  Online lookups send coordinates to our geocoding provider.
                </span>
              </label>
              <Button
                size="sm"
                disabled={!consentToSave}
                loading={savingId === "self"}
                onClick={() => void saveOwnLocation()}
              >
                Save as my location
              </Button>
            </div>
          </>
        ) : (
          <p className="text-muted">
            Select a pin to use that area, or zoom in to see neighborhoods inside each city.
          </p>
        )}
      </div>

      <div className="places-map__legend">
        <span><i className="places-map__legend-dot" /> Supported place</span>
        {own ? <span><i className="places-map__legend-dot places-map__legend-dot--self" /> Your area</span> : null}
        <span>{LOCATION_CHOICES.length} built-in places · any other area is looked up online</span>
      </div>
    </div>
  );
}
