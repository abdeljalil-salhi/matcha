import { useState } from "react";
import { Icon } from "../components/ui/Icon";
import { UsersMap } from "../components/map/UsersMap";
import { PlacesMap } from "../components/map/PlacesMap";

export function MapPage() {
  const [placesOpen, setPlacesOpen] = useState(false);
  return (
    <div className="container map-page">
      <header className="page-heading page-heading--compact">
        <p className="eyebrow inline-with-icon"><Icon name="pin" size={15} /> People nearby</p>
        <h1>Explore people on the map</h1>
        <p className="lead">
          Discover compatible members who choose to share their approximate area.
          Your exact device location is never published.
        </p>
      </header>
      <UsersMap />
      <details className="user-map__places" onToggle={(event) => setPlacesOpen(event.currentTarget.open)}><summary>Choose or change your matching area</summary>
      <section className="card map-card" aria-label="Supported places map">
        {placesOpen ? <PlacesMap /> : null}
      </section>
      </details>
    </div>
  );
}
