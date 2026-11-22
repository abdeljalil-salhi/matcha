import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type DiscoveryProfile } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { FilterPanel } from "../../components/discovery/FilterPanel";
import { EMPTY_FILTERS, toApiFilters, type FilterValues } from "../../components/discovery/filters";
import { ProfileCard } from "../../components/discovery/ProfileCard";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { EmptyState, ErrorBanner, Spinner } from "../../components/ui/Misc";

const PAGE_SIZE = 25;

type Mode = "suggestions" | "search";

export function DiscoveryView({ mode }: { mode: Mode }) {
  const { user } = useAuth();
  const { notify } = useToast();
  const [values, setValues] = useState<FilterValues>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterValues>(EMPTY_FILTERS);
  const [profiles, setProfiles] = useState<DiscoveryProfile[]>([]);
  const [likedIds, setLikedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<{ message: string; status: number } | null>(null);
  const [busyLike, setBusyLike] = useState<number | null>(null);
  const offsetRef = useRef(0);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const debounceRef = useRef<number | null>(null);
  const appliedKey = JSON.stringify(applied);

  useEffect(
    () => () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    },
    [],
  );

  const fetchPage = useCallback(
    async (
      reset: boolean,
      filters: FilterValues,
      currentMode: Mode,
      requestId = generation.current,
    ) => {
      if (inFlight.current) return;
      inFlight.current = true;
      const offset = reset ? 0 : offsetRef.current;
      setLoading(true);
      setError(null);
      try {
        const query = toApiFilters(filters, PAGE_SIZE, offset);
        const result =
          currentMode === "suggestions"
            ? await api.discovery.suggestions(query)
            : await api.discovery.search(query);
        if (requestId !== generation.current) return;
        setProfiles((current) => (reset ? result.profiles : [...current, ...result.profiles]));
        offsetRef.current = offset + result.profiles.length;
        setHasMore(result.profiles.length === PAGE_SIZE);
      } catch (cause) {
        if (requestId !== generation.current) return;
        setError({
          message: cause instanceof Error ? cause.message : "Unable to load profiles.",
          status: cause instanceof ApiError ? cause.status : 0,
        });
      } finally {
        if (requestId === generation.current) {
          inFlight.current = false;
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    generation.current += 1;
    inFlight.current = false;
    offsetRef.current = 0;
    setProfiles([]);
    setLikedIds([]);
    setHasMore(false);
    void fetchPage(true, applied, mode, generation.current);
    // appliedKey is the stable serialized form of `applied`.
  }, [appliedKey, mode, user?.id, fetchPage]);

  const changeValues = (next: FilterValues) => {
    setValues(next);
    if (mode === "suggestions") {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => setApplied(next), 350);
    }
  };

  const reset = () => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    setValues(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
  };

  const like = async (profile: DiscoveryProfile) => {
    if (likedIds.includes(profile.id)) return;
    setBusyLike(profile.id);
    try {
      const result = await api.relationships.like(profile.id);
      setLikedIds((current) => [...current, profile.id]);
      notify(
        result.connected
          ? `You and ${profile.first_name || profile.username} are connected. Say hello!`
          : `You liked ${profile.first_name || profile.username}.`,
        "success",
      );
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) {
        setProfiles((current) => current.filter((entry) => entry.id !== profile.id));
      }
      notify(cause instanceof Error ? cause.message : "Unable to like that profile.", "error");
    } finally {
      setBusyLike(null);
    }
  };

  const canLike = Boolean(user?.photos.some((photo) => photo.is_primary));
  const isSuggestions = mode === "suggestions";

  return (
    <div className="discovery-page container">
      <header className="page-heading page-heading--row">
        <div>
          <p className="eyebrow">{isSuggestions ? "For you" : "Advanced search"}</p>
          <h1>{isSuggestions ? "People worth meeting" : "Find exactly who you're looking for"}</h1>
          <p className="lead">
            {isSuggestions
              ? "Ranked by proximity, shared interests, and fame — closest connections first."
              : "Combine as many criteria as you like, then fine-tune the results."}
          </p>
        </div>
        {!canLike ? (
          <div className="hint-box hint-box--compact">
            Add a profile photo before you can like people.{" "}
            <Link to="/profile/me">Do it now →</Link>
          </div>
        ) : null}
      </header>

      <div className="discovery-layout">
        <FilterPanel
          values={values}
          onChange={changeValues}
          onApply={isSuggestions ? undefined : () => setApplied(values)}
          onReset={reset}
          busy={loading && !isSuggestions}
          mode={mode}
        />

        <section className="discovery-results">
          <div className="results-head">
            <strong>{isSuggestions ? "Suggested profiles" : "Search results"}</strong>
            <span className="text-muted text-small" role="status" aria-live="polite" aria-atomic="true">
              {loading && profiles.length === 0 ? "Looking…" : `${profiles.length} shown`}
            </span>
          </div>

          {error ? (
            <ErrorBanner
              message={error.message}
              onRetry={() => void fetchPage(true, applied, mode)}
            />
          ) : null}

          {error?.status === 409 ? (
            <div className="notice notice--info">
              {!user?.city
                ? <>Discovery needs a location. <Link to="/profile/me">Add yours →</Link></>
                : <>Finish your profile first. <Link to="/onboarding">Complete setup →</Link></>}
            </div>
          ) : null}

          {loading && profiles.length === 0 && !error ? (
            <div className="profile-grid" aria-hidden="true">
              {Array.from({ length: 6 }, (_, index) => (
                <div className="skeleton-card" key={index}>
                  <div className="skeleton-card__photo" />
                  <div className="skeleton-card__line" />
                  <div className="skeleton-card__line skeleton-card__line--short" />
                </div>
              ))}
              <span className="sr-only"><Spinner label="Loading profiles" /></span>
            </div>
          ) : null}

          {!loading && profiles.length === 0 && !error ? (
            <EmptyState
              icon={<Icon name="compass" size={26} />}
              title={isSuggestions ? "No suggestions yet" : "No matches found"}
              description={
                isSuggestions
                  ? "Try widening your filters or adding an interest to your profile."
                  : "Try a wider age range, a different location, or fewer tags."
              }
              action={<Button variant="secondary" onClick={reset}>Clear filters</Button>}
            />
          ) : null}

          {profiles.length > 0 ? (
            <div className="profile-grid">
              {profiles.map((profile) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  canLike={canLike && !likedIds.includes(profile.id)}
                  onLike={(entry) => void like(entry)}
                  busy={busyLike === profile.id}
                />
              ))}
            </div>
          ) : null}

          {!hasMore && profiles.length > 0 ? (
            <p className="results-end">You've seen everyone nearby. Try adjusting your filters to find more people.</p>
          ) : null}

          {hasMore ? (
            <div className="results-more">
              <Button
                variant="secondary"
                loading={loading}
                onClick={() => void fetchPage(false, applied, mode)}
              >
                Load more profiles
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
