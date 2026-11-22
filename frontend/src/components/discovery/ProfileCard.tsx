import { Link } from "react-router-dom";
import { type DiscoveryProfile } from "../../api";
import { Avatar } from "../ui/Avatar";
import { distanceLabel, fullName, placeLabel } from "../../utils/format";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

interface ProfileCardProps {
  profile: DiscoveryProfile;
  canLike: boolean;
  onLike: (profile: DiscoveryProfile) => void;
  busy?: boolean;
}

export function ProfileCard({ profile, canLike, onLike, busy = false }: ProfileCardProps) {
  return (
    <article className="profile-card card">
      <Link to={`/profile/${profile.id}`} className="profile-card__photo" aria-label={`View ${fullName(profile)}'s profile`}>
        <Avatar photoId={profile.photo_id} name={profile} size="card" />
      </Link>
      <div className="profile-card__body">
        <div className="profile-card__top">
          <div>
            <h3>{fullName(profile)}, {profile.age}</h3>
            <p className="text-small text-muted">@{profile.username}</p>
          </div>
          <span className="fame-badge" title="Fame rating">
            <Icon name="star" size={13} /> {profile.fame}
          </span>
        </div>

        <p className="profile-card__place text-small">
          <Icon name="pin" size={14} /> {placeLabel(profile)}
        </p>
        <p className="profile-card__distance text-small text-muted">{distanceLabel(profile.distance_km)}</p>

        <ul className="profile-card__tags">
          {profile.tags.slice(0, 4).map((tag) => (
            <li key={tag} className={profile.common_tags > 0 ? "is-common" : ""}>#{tag}</li>
          ))}
          {profile.tags.length > 4 ? <li>+{profile.tags.length - 4}</li> : null}
        </ul>
        {profile.common_tags > 0 ? (
          <p className="profile-card__common">{profile.common_tags} interest{profile.common_tags === 1 ? "" : "s"} in common</p>
        ) : null}

        <div className="profile-card__actions">
          <Link to={`/profile/${profile.id}`} className="btn btn--secondary btn--sm">View profile</Link>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onLike(profile)}
            disabled={!canLike || busy}
            loading={busy}
            title={canLike ? "Like this profile" : "Add a profile photo before liking"}
            icon={<Icon name="heart" size={15} />}
          >
            Like
          </Button>
        </div>
      </div>
    </article>
  );
}
