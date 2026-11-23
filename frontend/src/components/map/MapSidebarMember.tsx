import { Link } from "react-router-dom";
import type { MapProfile } from "../../api/types/userMap";
import { fullName, placeLabel } from "../../utils/format";
import { Icon } from "../ui/Icon";
import { Photo } from "../ui/Photo";

export function MapSidebarMember({ person, distance, selected, onSelect }: {
  person: MapProfile; distance: number | null; selected: boolean; onSelect: () => void;
}) {
  const name = fullName(person);
  const tags = person.tags ?? [];
  return <article className={`map-member${selected ? " is-selected" : ""}`}>
    <button className="map-member__select" type="button" onClick={onSelect}
      aria-label={`Show ${name} on the map`} aria-pressed={selected}>
      <Photo photoId={person.photo_id} alt="" className="map-member__photo" />
    </button>
    <div className="map-member__body">
      <Link to={`/profile/${person.id}`} aria-label={`View ${name}'s profile`}><h3>{name}, {person.age}</h3></Link>
      <p><Icon name="pin" size={13} /><bdi>{distance === null ? placeLabel(person) : `~${Math.round(distance)} km away`}</bdi></p>
      <ul>{tags.slice(0, 3).map((tag) => <li key={tag}>#{tag}</li>)}{tags.length > 3 ? <li className="map-member__more">+{tags.length - 3}</li> : null}</ul>
    </div>
    <span className="map-member__fame" aria-label={`Fame rating: ${person.fame}`}><Icon name="star" size={12} /> {person.fame}</span>
  </article>;
}
