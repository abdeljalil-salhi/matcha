import { useState, type FormEvent, type KeyboardEvent } from "react";
import { api, type ResolvedLocation } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { lookupNetworkLocation, saveDetectedLocation } from "../../utils/location";
import { FEATURED_CHOICES, LOCATION_CHOICES, searchLocations } from "../../data/locations";
import { placeLabel } from "../../utils/format";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

interface LocationFormProps {
  current: {
    city: string | null;
    area: string | null;
    country_code: string | null;
    location_source: string | null;
  };
  onSaved: () => void | Promise<unknown>;
}

type Mode = "manual" | "gps";

const EXAMPLE_QUERIES = [
  { label: "Berlin", query: "Berlin, DE" },
  { label: "Tokyo", query: "Tokyo, JP" },
  { label: "Soho, London", query: "Soho, London" },
  { label: "New York", query: "New York, US" },
];

export function LocationForm({ current, onSaved }: LocationFormProps) {
  const { patchUser } = useAuth();
  const [mode, setMode] = useState<Mode>(current.location_source === "gps" ? "gps" : "manual");
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(-1);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [networkBusy, setNetworkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolvedLocation | null>(null);

  const onModeKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentMode: Mode) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next: Mode = currentMode === "manual" ? "gps" : "manual";
    setMode(next);
    setError(null);
    document.getElementById(`location-tab-${next}`)?.focus();
  };

  const commitLocation = (result: ResolvedLocation) => {
    setResolved(result);
    setSaved(`${placeLabel(result)} saved.`);
    // Update the auth context immediately so wizards and guards never wait for a refetch.
    patchUser({
      city: result.city,
      area: result.area,
      country_code: result.country_code,
      location_source: result.location_source,
    });
  };

  const save = async (payload: Parameters<typeof api.profile.setLocation>[0]) => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const result = await api.profile.setLocation(payload);
      commitLocation(result);
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save your location.");
    } finally {
      setBusy(false);
    }
  };

  const submitManual = (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) {
      setError("Choose a place above or enter a city or neighborhood.");
      return;
    }
    void save({ source: "manual", query: query.trim() });
  };

  const saveCoordinates = async (latitude: number, longitude: number) => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const result = await saveDetectedLocation(latitude, longitude);
      commitLocation(result);
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save your location.");
    } finally {
      setBusy(false);
    }
  };

  const useGps = () => {
    setError(null);
    setSaved(null);
    if (!consent) {
      setError("Please agree before we use your device location.");
      return;
    }
    if (!navigator.geolocation) {
      setError("Your browser doesn't support device location. Use approximate location or choose a place above.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void saveCoordinates(
          Math.round(position.coords.latitude * 100) / 100,
          Math.round(position.coords.longitude * 100) / 100,
        );
      },
      (failure) => {
        setBusy(false);
        if (failure.code === failure.PERMISSION_DENIED) {
          setError("Location permission was blocked. Allow it for this site, or use approximate location instead.");
        } else if (failure.code === failure.TIMEOUT) {
          setError("Getting your location timed out. Try again, or use approximate location instead.");
        } else {
          setError("We couldn't get your location. Try approximate location or choose a place above.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const useNetworkLocation = async () => {
    if (!consent) {
      setError("Please agree before we use an approximate location.");
      return;
    }
    setError(null);
    setSaved(null);
    setNetworkBusy(true);
    try {
      const found = await lookupNetworkLocation();
      await saveCoordinates(
        Math.round(found.latitude * 100) / 100,
        Math.round(found.longitude * 100) / 100,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to get an approximate location.");
    } finally {
      setNetworkBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api.profile.clearLocation();
      setResolved(null);
      setQuery("");
      patchUser({ city: null, area: null, country_code: null, location_source: null });
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to clear your location.");
    } finally {
      setBusy(false);
    }
  };

  const displayed = resolved ?? (current.city ? current : null);
  const selectedQuery = query.trim();
  const suggestions = searchLocations(query);

  const selectSuggestion = (value: string) => {
    setQuery(value);
    setHighlighted(-1);
    setError(null);
    setSaved(null);
    document.getElementById("location-query")?.focus();
  };

  const onQueryKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setHighlighted(-1);
      return;
    }
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setHighlighted((currentIndex) => (currentIndex + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setHighlighted((currentIndex) =>
        currentIndex <= 0 ? suggestions.length - 1 : currentIndex - 1,
      );
      return;
    }
    if (event.key === "Enter" && highlighted >= 0) {
      const choice = suggestions[highlighted];
      if (choice) {
        event.preventDefault();
        selectSuggestion(choice.query);
      }
    }
  };

  return (
    <div className="location-form">
      {displayed ? (
        <div className="location-summary">
          <span className="location-summary__pin"><Icon name="pin" size={18} /></span>
          <div>
            <strong>{placeLabel(displayed)}</strong>
            <span className="text-small text-muted">
              {displayed.country_code} · {displayed.location_source === "gps" ? "Device location" : "Added manually"}
            </span>
          </div>
          <button type="button" className="link-button link-button--danger" onClick={() => void clear()} disabled={busy}>
            Remove
          </button>
        </div>
      ) : (
        <div className="hint-box">
          Discovery needs a location. Choose one of the places below, type your own, or share your
          device location — but only if you explicitly agree.
        </div>
      )}

      <div className="segmented" role="tablist" aria-label="Location method">
        <button
          id="location-tab-manual"
          type="button"
          role="tab"
          aria-selected={mode === "manual"}
          aria-controls="location-panel-manual"
          tabIndex={mode === "manual" ? 0 : -1}
          className={mode === "manual" ? "is-active" : ""}
          onClick={() => {
            setMode("manual");
            setError(null);
          }}
          onKeyDown={(event) => onModeKeyDown(event, "manual")}
        >
          Enter manually
        </button>
        <button
          id="location-tab-gps"
          type="button"
          role="tab"
          aria-selected={mode === "gps"}
          aria-controls="location-panel-gps"
          tabIndex={mode === "gps" ? 0 : -1}
          className={mode === "gps" ? "is-active" : ""}
          onClick={() => {
            setMode("gps");
            setError(null);
          }}
          onKeyDown={(event) => onModeKeyDown(event, "gps")}
        >
          Use device location
        </button>
      </div>

      {error ? <div className="error-banner" role="alert">{error}</div> : null}
      {saved ? <div className="notice notice--success" role="status">{saved}</div> : null}

      {mode === "manual" ? (
        <div
          id="location-panel-manual"
          className="location-panel"
          role="tabpanel"
          aria-labelledby="location-tab-manual"
        >
          <section className="location-block" aria-labelledby="location-choices-title">
            <div className="location-block__head">
              <div>
                <h3 id="location-choices-title">Popular places</h3>
                <p>Pick a quick place, or search every supported city below.</p>
              </div>
              <span className="location-block__count">
                {FEATURED_CHOICES.length} quick picks · {LOCATION_CHOICES.length} searchable
              </span>
            </div>

            <div className="location-groups">
              <div className="location-group">
                <p className="location-group__label">Quick picks</p>
                <div className="location-choice-grid">
                  {FEATURED_CHOICES.map((choice) => {
                    const selected = selectedQuery.toLowerCase() === choice.query.toLowerCase();
                    return (
                      <button
                        type="button"
                        key={choice.id}
                        className={`location-choice${selected ? " is-selected" : ""}`}
                        aria-pressed={selected}
                        onClick={() => {
                          setQuery(choice.query);
                          setHighlighted(-1);
                          setError(null);
                          setSaved(null);
                        }}
                      >
                        <span className="location-choice__pin"><Icon name="pin" size={14} /></span>
                        <span className="location-choice__text">
                          <strong>{choice.label}</strong>
                          <small>{choice.detail}</small>
                        </span>
                        {selected ? <span className="location-choice__check"><Icon name="check" size={15} /></span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <form className="location-manual" onSubmit={submitManual}>
            <label className="field__label" htmlFor="location-query">City or neighborhood</label>
            <div className="location-manual__row">
              <div className="location-manual__field">
                <input
                  id="location-query"
                  className="input"
                  role="combobox"
                  aria-expanded={suggestions.length > 0}
                  aria-controls="location-suggestions"
                  aria-autocomplete="list"
                  aria-activedescendant={highlighted >= 0 ? `location-suggestion-${highlighted}` : undefined}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setHighlighted(-1);
                    setSaved(null);
                  }}
                  onKeyDown={onQueryKeyDown}
                  onBlur={() => window.setTimeout(() => setHighlighted(-1), 120)}
                  placeholder="Try Berlin, Tokyo or Soho, London"
                  autoComplete="off"
                />
                {suggestions.length > 0 ? (
                  <ul className="location-suggestions" id="location-suggestions" role="listbox">
                    {suggestions.map((choice, index) => (
                      <li
                        key={choice.id}
                        id={`location-suggestion-${index}`}
                        role="option"
                        aria-selected={highlighted === index}
                        className={highlighted === index ? "is-highlighted" : ""}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          selectSuggestion(choice.query);
                        }}
                      >
                        <Icon name="pin" size={14} />
                        <span><strong>{choice.label}</strong><small>{choice.detail}</small></span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <Button type="submit" loading={busy}>Save location</Button>
            </div>
            <p className="field__hint">
              We check {LOCATION_CHOICES.length} built-in places first. Any other city, neighborhood or
              address is looked up online when you save. Include a country if a name is ambiguous.
            </p>
            <div className="location-examples" aria-label="Example locations">
              <span className="text-small text-muted">Try an example:</span>
              {EXAMPLE_QUERIES.map((example) => (
                <button
                  key={example.query}
                  type="button"
                  className="location-example"
                  onClick={() => selectSuggestion(example.query)}
                >
                  {example.label}
                </button>
              ))}
            </div>
          </form>
        </div>
      ) : (
        <div
          id="location-panel-gps"
          className="gps-panel"
          role="tabpanel"
          aria-labelledby="location-tab-gps"
        >
          <div className="gps-panel__intro">
            <span className="gps-panel__icon"><Icon name="crosshair" size={21} /></span>
            <div>
              <h3>Use your device location</h3>
              <p>We round your coordinates and store only an approximate area.</p>
            </div>
          </div>
          <label className="consent-row">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>
              I explicitly consent to Matcha using my device location to find nearby profiles.
              Only an approximate area is stored.
            </span>
          </label>
          <div className="gps-panel__actions">
            <Button onClick={useGps} loading={busy} variant="secondary">Share my location</Button>
            <Button onClick={() => void useNetworkLocation()} loading={networkBusy} variant="ghost">
              Use approximate location
            </Button>
          </div>
          <p className="field__hint">
            If device location is unavailable, we can use a rough network location and then save
            the closest supported area. Nothing more precise is stored.
          </p>
        </div>
      )}
    </div>
  );
}
