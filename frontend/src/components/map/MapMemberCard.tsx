import { Link } from "react-router-dom";
import type { MapProfile } from "../../api/types/userMap";
import { fullName, placeLabel } from "../../utils/format";
import { Icon } from "../ui/Icon";
import { Photo } from "../ui/Photo";

/** Present a member with a bounded portrait, readable location and compact profile action. */
export function MapMemberCard({ person, popup = false }: { person: MapProfile; popup?: boolean }) {
  const name = fullName(person);
  const area = placeLabel(person);
  const footer = <div className="user-map__person-footer">
    <span className="user-map__fame" aria-label={`Fame rating: ${person.fame}`}><Icon name="star" size={13} />{person.fame}</span>
    <Link className="btn btn--soft btn--sm" to={`/profile/${person.id}`} aria-label={`View ${name}'s profile`}>
      View profile <Icon name="chevronRight" size={14} />
    </Link>
  </div>;
  return <article className="card user-map__person">
    <Photo className="user-map__portrait" photoId={person.photo_id} alt={`${name}'s profile`} />
    <div className="user-map__person-body">
      {popup ? <p className="user-map-popup__label">Approximate area</p> : null}
      <h3 title={`${name}, ${person.age}`}><bdi>{name}</bdi><span className="user-map__age">, {person.age}</span></h3>
      <p className="user-map__username">@{person.username}</p>
      <p className="user-map__location" title={area}>
        <Icon name="pin" size={14} /><bdi>{area}</bdi>
      </p>
      {footer}
    </div>
  </article>;
}
