import { useEffect, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { api, type PublicProfile } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { ProfileForm } from "../../components/profile/ProfileForm";
import { LocationForm } from "../../components/profile/LocationForm";
import { PhotoManager } from "../../components/profile/PhotoManager";
import { Avatar } from "../../components/ui/Avatar";
import { Icon } from "../../components/ui/Icon";
import { Stat, TagList } from "../../components/ui/Misc";
import { ageFromBirthDate, placeLabel } from "../../utils/format";

type Tab = "about" | "photos" | "location";

export function ProfilePage() {
  const { user, refresh } = useAuth();
  const [tab, setTab] = useState<Tab>("about");
  const [fame, setFame] = useState<number | null>(null);

  useEffect(() => {
    // Public profiles are hidden until setup is complete; avoid an expected 404.
    if (!user?.id || !user.complete) {
      setFame(null);
      return;
    }
    let active = true;
    void api.profile
      .view(user.id)
      .then((publicProfile: PublicProfile) => {
        if (active) setFame(publicProfile.fame);
      })
      .catch(() => {
        // The public view can be unavailable while the profile is being edited.
      });
    return () => {
      active = false;
    };
  }, [user?.id, user?.complete]);

  if (!user) return null;

  const age = ageFromBirthDate(user.birth_date);
  const primaryPhoto = user.photos.find((photo) => photo.is_primary)?.id ?? null;
  const tabs: Tab[] = ["about", "photos", "location"];

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + tabs.length) % tabs.length;
    const nextTab = tabs[next] ?? "about";
    setTab(nextTab);
    document.getElementById(`profile-tab-${nextTab}`)?.focus();
  };

  return (
    <div className="profile-page container">
      <header className="profile-hero card">
        <Avatar photoId={primaryPhoto} name={user} size="xl" />
        <div className="profile-hero__info">
          <p className="eyebrow">Your profile</p>
          <h1>{user.first_name} {user.last_name}</h1>
          <p className="text-muted">@{user.username}</p>
          <div className="profile-hero__meta">
            {age ? <span>{age} years old</span> : null}
            {user.city ? <span className="inline-with-icon"><Icon name="pin" size={14} /> {placeLabel(user)}</span> : null}
            <span>{user.complete ? "Visible to others" : "Setup incomplete"}</span>
          </div>
          {user.tags.length > 0 ? <TagList tags={user.tags} limit={8} /> : null}
        </div>
        <div className="profile-hero__stats">
          <Stat value={fame ?? "—"} label="Fame rating" />
          <Stat value={user.photos.length} label="Photos" />
          <Link to="/settings" className="btn btn--secondary btn--sm">Settings</Link>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Profile sections">
        {tabs.map((item, index) => (
          <button
            key={item}
            id={`profile-tab-${item}`}
            type="button"
            role="tab"
            aria-selected={tab === item}
            aria-controls="profile-panel"
            tabIndex={tab === item ? 0 : -1}
            className={tab === item ? "is-active" : ""}
            onClick={() => setTab(item)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
          >
            {item === "about" ? "About me" : item === "photos" ? <>Photos <span className="tabs__count">{user.photos.length}/5</span></> : "Location"}
          </button>
        ))}
      </div>

      <section className="card profile-section" id="profile-panel" role="tabpanel" aria-labelledby={`profile-tab-${tab}`}>
        {tab === "about" ? (
          <>
            <div className="panel-heading">
              <h2>Edit your details</h2>
              <p className="text-muted">Your exact birth date and email are never shown to other members.</p>
            </div>
            <ProfileForm me={user} onSaved={refresh} />
          </>
        ) : null}

        {tab === "photos" ? (
          <>
            <div className="panel-heading">
              <h2>Your photos</h2>
              <p className="text-muted">The first photo marked as profile picture appears in discovery.</p>
            </div>
            <PhotoManager photos={user.photos} onChanged={refresh} />
          </>
        ) : null}

        {tab === "location" ? (
          <>
            <div className="panel-heading panel-heading--row">
              <div>
                <h2>Your location</h2>
                <p className="text-muted">You choose whether to share a device location or type one in.</p>
              </div>
              <Link to="/map" className="link-button inline-with-icon">
                <Icon name="pin" size={15} /> Open map
              </Link>
            </div>
            <LocationForm current={user} onSaved={refresh} />
          </>
        ) : null}
      </section>
    </div>
  );
}
