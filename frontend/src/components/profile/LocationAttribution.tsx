/** Credit the OpenStreetMap data used by online location lookups. */
export function LocationAttribution() {
  return (
    <p className="field__hint location-attribution">
      Location search data ©{" "}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        OpenStreetMap contributors
      </a>.
    </p>
  );
}
