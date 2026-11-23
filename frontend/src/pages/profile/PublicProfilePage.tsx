import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type PublicProfile } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { Button } from "../../components/ui/Button";
import { EmptyState, Presence, Spinner } from "../../components/ui/Misc";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { InterestIcon } from "../../components/discovery/InterestIcon";
import { Photo } from "../../components/ui/Photo";
import { fullName, genderLabel, placeLabel, relativeTime } from "../../utils/format";

type Dialog = "unlike" | "block" | "report" | null;

export function PublicProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const userId = Number(id);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [activePhoto, setActivePhoto] = useState<number | null>(null);

  useEffect(() => {
    if (!Number.isInteger(userId) || userId <= 0 || !user) return;
    let active = true;
    setLoading(true);
    setError(null);
    setProfile(null);
    void api.profile
      .view(userId)
      .then((result) => {
        if (!active) return;
        setProfile(result);
        setActivePhoto(result.photo_id);
        if (userId !== user.id) void api.profile.recordVisit(userId).catch(() => undefined);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError({
          message: cause instanceof Error ? cause.message : "This profile isn't available.",
          status: cause instanceof ApiError ? cause.status : 0,
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, user?.id]);

  if (!user) return null;
  if (userId === user.id) return <Navigate to="/profile/me" replace />;

  const canLike = user.photos.some((photo) => photo.is_primary);
  const photos = profile?.photos ?? [];

  const like = async () => {
    if (!profile) return;
    setBusy("like");
    try {
      const result = await api.relationships.like(profile.id);
      setProfile({ ...profile, likes_them: true, connected: result.connected });
      notify(
        result.connected
          ? `You're connected with ${profile.first_name}! You can chat now.`
          : `You liked ${profile.first_name}.`,
        "success",
      );
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Unable to like this profile.", "error");
    } finally {
      setBusy(null);
    }
  };

  const unlike = async () => {
    if (!profile) return;
    setBusy("unlike");
    try {
      await api.relationships.unlike(profile.id);
      setProfile({ ...profile, likes_them: false, connected: false });
      setDialog(null);
      notify("Like removed. You won't get notifications from them.", "info");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Unable to remove the like.", "error");
    } finally {
      setBusy(null);
    }
  };

  const block = async () => {
    if (!profile) return;
    setBusy("block");
    try {
      await api.relationships.block(profile.id);
      setDialog(null);
      notify("User blocked. They won't appear in search or chat.", "success");
      navigate("/discover", { replace: true });
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Unable to block this user.", "error");
    } finally {
      setBusy(null);
    }
  };

  const report = async () => {
    if (!profile) return;
    setBusy("report");
    try {
      await api.relationships.report(profile.id);
      setDialog(null);
      notify("Thanks. This account has been reported for review.", "success");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Unable to report this account.", "error");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="full-page-loader"><Spinner label="Loading profile" /></div>;
  }

  if (error || !profile) {
    return (
      <div className="container error-page">
        <EmptyState
          icon={<Icon name="user" size={26} />}
          title="Profile unavailable"
          description={error?.message ?? "This profile can't be shown right now."}
          action={<Link to="/discover" className="btn btn--primary btn--md">Back to discovery</Link>}
        />
      </div>
    );
  }

  const displayPhoto = activePhoto ?? profile.photo_id;
  const sharedTags = profile.tags.filter((tag) => user.tags.includes(tag));
  const lifestyle = [...new Set(profile.tags.map((tag) => {
    if (["art", "books", "reading", "film", "films", "cinema", "music"].includes(tag)) return "Culture";
    if (["games", "gaming"].includes(tag)) return "Games";
    if (["gardening", "nature", "hiking"].includes(tag)) return "Nature";
    if (["cycling", "biking", "climbing", "fitness", "running"].includes(tag)) return "Active";
    return null;
  }).filter(Boolean))];
  const changePhoto = (direction: number) => {
    const index = photos.findIndex((photo) => photo.id === displayPhoto);
    const next = photos[(Math.max(index, 0) + direction + photos.length) % photos.length];
    if (next) setActivePhoto(next.id);
  };

  return (
    <div className="public-profile container">
      <nav className="breadcrumbs">
        <Link to="/discover">Discover</Link>
        <span>/</span>
        <Link to="/discover">People</Link>
        <span>/</span>
        <span>{fullName(profile)}</span>
      </nav>

      <div className="public-profile__layout">
        <section className="profile-gallery" aria-label="Profile photos">
          <Button className={`profile-gallery__like${profile.likes_them ? " is-liked" : ""}`} variant="secondary" size="sm"
            aria-label={profile.likes_them ? "Remove like" : `Like ${profile.first_name}`}
            aria-pressed={profile.likes_them}
            onClick={() => profile.likes_them ? setDialog("unlike") : void like()}
            disabled={!profile.likes_them && !canLike} loading={busy === "like"}
            icon={<Icon name="heart" size={27} />} />
          <Photo
            className="profile-gallery__main"
            photoId={displayPhoto}
            alt={`${fullName(profile)}'s profile`}
            eager
          />
          {photos.length > 1 ? (
            <>
            <button className="profile-gallery__previous" type="button" aria-label="Previous photo" onClick={() => changePhoto(-1)}><Icon name="chevronLeft" size={20} /></button>
            <button className="profile-gallery__next" type="button" aria-label="Next photo" onClick={() => changePhoto(1)}><Icon name="chevronRight" size={20} /></button>
            <div className="profile-gallery__dots">
              {photos.map((photo, index) => (
                <button
                  key={photo.id}
                  type="button"
                  className={displayPhoto === photo.id ? "is-active" : ""}
                  onClick={() => setActivePhoto(photo.id)}
                  aria-label={`View photo ${index + 1}`}
                  aria-pressed={displayPhoto === photo.id}
                >
                  <span />
                </button>
              ))}
            </div>
            </>
          ) : null}
        </section>

        <section className="profile-details card">
          <div className="profile-details__head">
            <div>
              <h1>{fullName(profile)}, {profile.age}</h1>
              <p className="text-muted">@{profile.username}</p>
            </div>
            <div className="profile-details__fame">
              <strong><Icon name="star" size={14} /> {profile.fame}</strong>
              <span>fame</span>
            </div>
          </div>

          <div className="profile-details__badges">
            <Presence online={profile.online} lastSeen={profile.last_seen} />
            {profile.likes_you ? <span className="status-badge status-badge--like"><Icon name="heart" size={13} /> Likes you</span> : null}
            {profile.connected ? <span className="status-badge status-badge--match"><Icon name="star" size={13} /> Connected</span> : null}
          </div>

          <div className="profile-details__facts">
            <div><Icon name="user" size={26} /><div className="stat"><span>Identity</span><strong>{genderLabel(profile.gender)}</strong></div></div>
            <div><Icon name="heart" size={26} /><div className="stat"><span>Interested in</span><strong>{profile.seeks?.length ? profile.seeks.map(genderLabel).join(", ") : "Everyone"}</strong></div></div>
            <div><Icon name="pin" size={26} /><div className="stat"><span>Area</span><strong>{placeLabel(profile)}</strong></div></div>
          </div>

          <div className="profile-details__section">
            <h3>About {profile.first_name}</h3>
            <p className="profile-bio">{profile.bio || "This member hasn't written a bio yet."}</p>
          </div>

          <div className="profile-details__section">
            <h3>Interests</h3>
            <ul className="profile-details__interests">
              {profile.tags.map((tag) => <li key={tag}><InterestIcon tag={tag} /> #{tag}</li>)}
            </ul>
          </div>

          <div className="profile-details__highlights">
            <div className="profile-details__common">
              <Icon name="userPlus" size={30} />
              <div><h3>Common ground</h3><p>{sharedTags.length} shared {sharedTags.length === 1 ? "interest" : "interests"}</p></div>
              <ul aria-label="Shared interests">{sharedTags.slice(0, 4).map((tag) => <li key={tag} title={tag}><InterestIcon tag={tag} /><span className="sr-only">{tag}</span></li>)}</ul>
            </div>
            {lifestyle.length ? <div><Icon name="sparkles" size={30} /><div><h3>Lifestyle highlights</h3><p>{lifestyle.join(" · ")}</p></div></div> : null}
          </div>
          <div className="profile-details__footer">
            <div className="profile-details__actions">
              {profile.likes_them ? (
                <Button className="is-liked" variant="secondary" size="lg" aria-pressed={true} onClick={() => setDialog("unlike")} icon={<Icon name="heart" size={24} />}>
                  Liked
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  icon={<Icon name="heart" size={24} />}
                  onClick={() => void like()}
                  loading={busy === "like"}
                  disabled={!canLike}
                  title={!canLike ? "Add a profile photo before liking" : undefined}
                >
                  Like {profile.first_name}
                </Button>
              )}
              {profile.connected ? (
                <Link to={`/chat/${profile.id}`} className="btn btn--secondary btn--lg"><Icon name="message" size={24} /> Send message</Link>
              ) : <Button variant="secondary" size="lg" disabled title="Connect through mutual likes to send a message" icon={<Icon name="message" size={24} />}>Send message</Button>}
            </div>

            <div className="profile-details__moderation">
              <button type="button" className="link-button" onClick={() => setDialog("report")}>Report as fake</button>
              <button type="button" className="link-button link-button--danger" onClick={() => setDialog("block")}>Block user</button>
            </div>

          </div>
          {!canLike && !profile.likes_them ? (
            <p className="text-small text-muted">
              You need a profile photo before you can like someone. <Link to="/profile/me">Add one here.</Link>
            </p>
          ) : null}

          {profile.last_seen && !profile.online ? (
            <p className="text-small text-muted profile-details__seen">
              Last active {relativeTime(profile.last_seen)}.
            </p>
          ) : null}
        </section>
      </div>

      <Modal
        open={dialog === "unlike"}
        onClose={() => setDialog(null)}
        title="Remove your like?"
        description={profile.connected ? "This will also end your connection and close the chat." : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="danger" loading={busy === "unlike"} onClick={() => void unlike()}>Unlike</Button>
          </>
        }
      >
        <p className="text-muted">They won't be notified of future activity from you.</p>
      </Modal>

      <Modal
        open={dialog === "block"}
        onClose={() => setDialog(null)}
        title={`Block ${profile.username}?`}
        description="This hides both profiles from each other and closes your chat."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="danger" loading={busy === "block"} onClick={() => void block()}>Block user</Button>
          </>
        }
      >
        <p className="text-muted">You can undo this later from Account settings.</p>
      </Modal>

      <Modal
        open={dialog === "report"}
        onClose={() => setDialog(null)}
        title="Report as a fake account?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="secondary" loading={busy === "report"} onClick={() => void report()}>Submit report</Button>
          </>
        }
      >
        <p className="text-muted">Our team will review this profile. The member won't be told who reported them.</p>
      </Modal>
    </div>
  );
}
