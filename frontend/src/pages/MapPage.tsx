import { Icon } from "../components/ui/Icon";
import { PlacesMap } from "../components/map/PlacesMap";

export function MapPage() {
  return (
    <div className="container map-page">
      <header className="page-heading">
        <p className="eyebrow inline-with-icon"><Icon name="pin" size={15} /> Places preview</p>
        <h1>Explore nearby areas</h1>
        <p className="lead">
          Matcha uses approximate areas for matching. Browse built-in cities and neighborhoods
          worldwide, save any of them as your area, or share your device location if you agree.
        </p>
      </header>
      <section className="card map-card" aria-label="Supported places map">
        <PlacesMap />
      </section>
    </div>
  );
}
