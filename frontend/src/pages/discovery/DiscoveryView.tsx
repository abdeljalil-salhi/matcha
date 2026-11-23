import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type SortKey, type DiscoveryProfile } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { FilterPanel, SORTS } from "../../components/discovery/FilterPanel";
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
  const [quickView, setQuickView] = useState("recommended");
  const [filtersOpen, setFiltersOpen] = useState(false);
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
    setQuickView(next.sort);
    setValues(next);
    if (mode === "suggestions") {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => setApplied(next), 350);
    }
  };

  const reset = () => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    setQuickView("recommended");
    setValues(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
  };

  const like = async (profile: DiscoveryProfile) => {
    if (profile.likes_them || likedIds.includes(profile.id)) return;
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

  const applyQuick = (patch: Partial<FilterValues>, view?: string) => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const next = { ...values, ...patch };
    if (view) setQuickView(view);
    setValues(next);
    setApplied(next);
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
              ? "Discover like-minded people nearby, and make meaningful connections."
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

      {isSuggestions ? <nav className="discovery-tabs" aria-label="Discovery views">
        {([
          ["recommended", "For you", "sparkles"], ["location", "Nearby", "pin"],
          ["newest", "New here", "userPlus"], ["common_tags", "Best matches", "heart"],
        ] as const).map(([sort, label, icon]) => <button type="button" key={sort} className={quickView === sort ? "is-active" : ""} aria-pressed={quickView === sort} onClick={() => applyQuick({ sort, direction: "" }, sort)}><Icon name={icon} size={19} /><span>{label}</span></button>)}
      </nav> : null}
      <button type="button" className="discovery-filter-toggle btn btn--secondary btn--sm" aria-expanded={filtersOpen} aria-controls="discovery-filters" onClick={() => setFiltersOpen((current) => !current)}><Icon name="sliders" size={16} /> Refine results</button>

      <div className={`discovery-layout${filtersOpen ? " discovery-layout--filters-open" : ""}`}>
        <div id="discovery-filters" className="discovery-filters">
        <FilterPanel
          values={values}
          onChange={changeValues}
          onApply={isSuggestions ? undefined : () => setApplied(values)}
          onReset={reset}
          busy={loading && !isSuggestions}
          mode={mode}
        />
        </div>

        <section className="discovery-results">
          <div className="results-head">
            <div className="discovery-toolbar" aria-label="Quick profile filters">
              <label className="discovery-toolbar__pill"><Icon name="pin" size={15} /><span className="sr-only">Maximum distance</span><select aria-label="Quick maximum distance" value={values.max_distance_km} onChange={(event) => applyQuick({ max_distance_km: event.target.value })}><option value="">Anywhere</option>{[25, 50, 100, 250, 500, 1000].map((km) => <option key={km} value={km}>Within {km} km</option>)}{values.max_distance_km && ![25, 50, 100, 250, 500, 1000].includes(Number(values.max_distance_km)) ? <option value={values.max_distance_km}>Within {values.max_distance_km} km</option> : null}</select></label>
              <label className="discovery-toolbar__pill"><Icon name="layers" size={15} /><select aria-label="Quick shared interests" value={values.min_common_tags} onChange={(event) => applyQuick({ min_common_tags: event.target.value })}><option value="">Shared interests</option><option value="0">Any shared interests</option>{Array.from({ length: 15 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}+ in common</option>)}</select></label>
              <label className="discovery-toolbar__pill"><Icon name="star" size={15} /><select aria-label="Quick minimum fame" value={values.min_fame} onChange={(event) => applyQuick({ min_fame: event.target.value, max_fame: "" })}><option value="">Fame</option>{[0, 20, 40, 60, 80].map((fame) => <option key={fame} value={fame}>{fame}+ fame</option>)}{values.min_fame && ![0, 20, 40, 60, 80].includes(Number(values.min_fame)) ? <option value={values.min_fame}>{values.min_fame}+ fame</option> : null}</select></label>
              <label className="discovery-toolbar__pill discovery-toolbar__sort"><Icon name="sort" size={15} /><span>Sort:</span><select aria-label="Sort profiles" value={values.sort} onChange={(event) => applyQuick({ sort: event.target.value as SortKey, direction: "" }, event.target.value)}>{SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            </div>
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
                  viewerTags={user?.tags ?? []}
                  liked={Boolean(profile.likes_them) || likedIds.includes(profile.id)}
                  canLike={canLike && !profile.likes_them && !likedIds.includes(profile.id)}
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
