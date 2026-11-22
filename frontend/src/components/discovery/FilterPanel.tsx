import { useEffect, useState } from "react";
import { api, type SortDirection, type SortKey } from "../../api";
import { Button } from "../ui/Button";
import { EMPTY_FILTERS, type FilterValues } from "./filters";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "age", label: "Age" },
  { value: "location", label: "Distance" },
  { value: "fame", label: "Fame rating" },
  { value: "common_tags", label: "Shared interests" },
];

interface FilterPanelProps {
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  onApply?: () => void;
  onReset: () => void;
  busy?: boolean;
  mode: "suggestions" | "search";
}

export function FilterPanel({ values, onChange, onApply, onReset, busy, mode }: FilterPanelProps) {
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [showTags, setShowTags] = useState(false);

  useEffect(() => {
    let active = true;
    void api.profile
      .tags("")
      .then((result) => {
        if (active) setAvailableTags(result.tags);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const set = <K extends keyof FilterValues>(key: K, value: FilterValues[K]) => {
    onChange({ ...values, [key]: value });
  };

  const toggleTag = (tag: string) => {
    set(
      "tags",
      values.tags.includes(tag) ? values.tags.filter((entry) => entry !== tag) : [...values.tags, tag],
    );
  };

  const activeCount =
    (values.location ? 1 : 0) +
    [values.min_age, values.max_age, values.min_fame, values.max_fame, values.max_distance_km, values.min_common_tags]
      .filter(Boolean).length +
    values.tags.length +
    (values.sort !== "recommended" || values.direction ? 1 : 0);

  return (
    <aside className="filter-panel card">
      <div className="filter-panel__head">
        <h3>{mode === "search" ? "Search criteria" : "Refine suggestions"}</h3>
        {activeCount > 0 ? (
          <button type="button" className="link-button" onClick={onReset}>Reset all</button>
        ) : null}
      </div>

      <div className="filter-panel__body">
        <label className="filter-field">
          <span>Location</span>
          <input
            className="input"
            value={values.location}
            onChange={(event) => set("location", event.target.value)}
            placeholder="Paris, Lyon…"
          />
        </label>

        <div className="filter-group">
          <span className="filter-group__label">Age range</span>
          <div className="filter-row">
            <input className="input" type="number" min={18} max={120} placeholder="18" value={values.min_age} onChange={(event) => set("min_age", event.target.value)} aria-label="Minimum age" />
            <span className="filter-row__dash">–</span>
            <input className="input" type="number" min={18} max={120} placeholder="120" value={values.max_age} onChange={(event) => set("max_age", event.target.value)} aria-label="Maximum age" />
          </div>
        </div>

        <div className="filter-group">
          <span className="filter-group__label">Fame rating</span>
          <div className="filter-row">
            <input className="input" type="number" min={0} max={100} placeholder="0" value={values.min_fame} onChange={(event) => set("min_fame", event.target.value)} aria-label="Minimum fame" />
            <span className="filter-row__dash">–</span>
            <input className="input" type="number" min={0} max={100} placeholder="100" value={values.max_fame} onChange={(event) => set("max_fame", event.target.value)} aria-label="Maximum fame" />
          </div>
        </div>

        <label className="filter-field">
          <span>Maximum distance (km)</span>
          <input className="input" type="number" min={0} max={20040} placeholder="Anywhere" value={values.max_distance_km} onChange={(event) => set("max_distance_km", event.target.value)} />
        </label>

        <label className="filter-field">
          <span>Minimum shared interests</span>
          <input className="input" type="number" min={0} max={15} placeholder="0" value={values.min_common_tags} onChange={(event) => set("min_common_tags", event.target.value)} />
        </label>

        <div className="filter-group">
          <span className="filter-group__label">Interest tags</span>
          <div className="filter-tags">
            {availableTags.slice(0, showTags ? availableTags.length : 8).map((tag) => (
              <button
                key={tag}
                type="button"
                className={`tag-chip tag-chip--button${values.tags.includes(tag) ? " tag-chip--active" : ""}`}
                onClick={() => toggleTag(tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
          {availableTags.length > 8 ? (
            <button type="button" className="link-button" onClick={() => setShowTags((current) => !current)}>
              {showTags ? "Show fewer" : `Show all ${availableTags.length} tags`}
            </button>
          ) : null}
        </div>

        <div className="filter-group">
          <span className="filter-group__label">Sort by</span>
          <select className="input" value={values.sort} onChange={(event) => onChange({ ...values, sort: event.target.value as SortKey })}>
            {SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {values.sort !== "recommended" ? (
            <select
              className="input"
              value={values.direction}
              onChange={(event) => set("direction", event.target.value as SortDirection | "")}
              aria-label="Sort direction"
            >
              <option value="">Default direction</option>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          ) : null}
        </div>
      </div>

      {onApply ? (
        <div className="filter-panel__foot">
          <Button type="button" full loading={busy} onClick={onApply}>Search profiles</Button>
        </div>
      ) : null}
    </aside>
  );
}

export { EMPTY_FILTERS };
