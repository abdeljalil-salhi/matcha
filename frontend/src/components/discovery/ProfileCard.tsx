import { Link } from "react-router-dom";
import { type DiscoveryProfile } from "../../api";
import { Avatar } from "../ui/Avatar";
import { distanceLabel, fullName, placeLabel } from "../../utils/format";
import { Button } from "../ui/Button";
import { InterestIcon } from "./InterestIcon";
import { Icon } from "../ui/Icon";

interface ProfileCardProps {
  profile: DiscoveryProfile;
  canLike: boolean;
  onLike: (profile: DiscoveryProfile) => void;
  busy?: boolean;
  viewerTags?: string[];
  liked?: boolean;
}

export function ProfileCard({ profile, canLike, onLike, busy = false, viewerTags = [], liked = false }: ProfileCardProps) {
  return (
    <article className="profile-card card">
      <Link to={`/profile/${profile.id}`} className="profile-card__photo" aria-label={`View ${fullName(profile)}'s profile`}>
        <Avatar photoId={profile.photo_id} name={profile} size="card" />
        <span className="fame-badge" title="Fame rating"><Icon name="star" size={13} /> {profile.fame}</span>
      </Link>
      <div className="profile-card__body">
        <div className="profile-card__top">
          <div>
            <h3>{fullName(profile)}, {profile.age}</h3>
            <p className="text-small text-muted">@{profile.username}</p>
          </div>
        </div>

        <div className="profile-card__location">
          <Icon name="pin" size={14} />
          <span>{placeLabel(profile)}</span>
          <span className="profile-card__distance">{distanceLabel(profile.distance_km)}</span>
        </div>

        <ul className="profile-card__tags">
          {profile.tags.slice(0, 4).map((tag) => (
            <li key={tag} className={viewerTags.includes(tag) ? "is-common" : ""}><InterestIcon tag={tag} /><span>{tag.charAt(0).toUpperCase() + tag.slice(1)}</span></li>
          ))}
          {profile.tags.length > 4 ? <li className="profile-card__more" title={profile.tags.slice(4).join(", ")}>+{profile.tags.length - 4} more</li> : null}
        </ul>
        {profile.common_tags > 0 ? (
          <p className="sr-only">{profile.common_tags} interest{profile.common_tags === 1 ? "" : "s"} in common</p>
        ) : null}

        <div className="profile-card__actions">
          <Link to={`/profile/${profile.id}`} className="btn btn--secondary btn--sm">View profile</Link>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onLike(profile)}
            disabled={!canLike || busy}
            loading={busy}
            title={liked ? "You liked this profile" : canLike ? "Like this profile" : "Add a profile photo before liking"}
            icon={<Icon name="heart" size={15} />}
          >
            {liked ? "Liked" : "Like"}
          </Button>
        </div>
      </div>
    </article>
  );
}
