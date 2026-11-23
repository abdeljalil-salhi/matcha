import { Icon } from "../components/ui/Icon";
import { UsersMap } from "../components/map/UsersMap";

export function MapPage() {
  return (
    <div className="container map-page">
      <header className="page-heading page-heading--compact">
        <p className="eyebrow inline-with-icon"><Icon name="pin" size={15} /> People nearby</p>
        <h1>Explore people on the map</h1>
        <p className="lead">
          Discover compatible members who choose to share their approximate area.
          Your exact device location is never published, and you can control what you share.
        </p>
      </header>
      <UsersMap />

    </div>
  );
}
