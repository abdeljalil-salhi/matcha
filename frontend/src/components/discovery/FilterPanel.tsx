import { useEffect, useState } from "react";
import { api, type SortDirection, type SortKey } from "../../api";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { EMPTY_FILTERS, type FilterValues } from "./filters";

export const SORTS: { value: SortKey; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "location", label: "Distance" },
  { value: "newest", label: "New here" },
  { value: "age", label: "Age" },
  { value: "fame", label: "Fame rating" },
  { value: "common_tags", label: "Shared interests" },
];

function RangeField({ label, min, max, low, high, onChange }: {
  label: string; min: number; max: number; low: string; high: string;
  onChange: (low: string, high: string) => void;
}) {
  const start = low === "" ? min : Number(low);
  const end = high === "" ? max : Number(high);
  return <div className="filter-range">
    <div className="filter-range__track">
      <span style={{ left: `${(start - min) / (max - min) * 100}%`, right: `${(max - end) / (max - min) * 100}%` }} />
      <input type="range" min={min} max={max} value={start} aria-label={`Minimum ${label}`} onChange={(event) => onChange(String(Math.min(Number(event.target.value), end)), high)} />
      <input type="range" min={min} max={max} value={end} aria-label={`Maximum ${label}`} onChange={(event) => onChange(low, String(Math.max(Number(event.target.value), start)))} />
    </div>
    <output aria-label={`${label} range`}>{start} – {end}</output>
  </div>;
}

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
  const [tagQuery, setTagQuery] = useState("");
  useEffect(() => {
    let active = true;
    void api.profile.tags("").then((result) => { if (active) setAvailableTags(result.tags); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const set = <K extends keyof FilterValues>(key: K, value: FilterValues[K]) => onChange({ ...values, [key]: value });
  const active = JSON.stringify(values) !== JSON.stringify(EMPTY_FILTERS);
  const matchingTags = availableTags.filter((tag) => tag.toLowerCase().includes(tagQuery.toLowerCase()));
  const visibleTags = tagQuery || showTags ? matchingTags : matchingTags.slice(0, 5);

  return <aside className="filter-panel card" aria-label="Profile filters">
    <div className="filter-panel__head">
      <Icon name="sliders" size={17} />
      <h3>{mode === "search" ? "Search criteria" : "Refine your results"}</h3>
      {active ? <button type="button" className="link-button" onClick={() => { setTagQuery(""); onReset(); }}>Reset</button> : null}
    </div>
    <div className="filter-panel__body">
      <label className="filter-field">
        <span><Icon name="pin" size={16} /> Location</span>
        <input className="input" value={values.location} onChange={(event) => set("location", event.target.value)} placeholder="Paris, Lyon…" />
      </label>
      <div className="filter-group">
        <span className="filter-group__label"><Icon name="user" size={16} /> Age range</span>
        <RangeField label="age" min={18} max={120} low={values.min_age} high={values.max_age} onChange={(low, high) => onChange({ ...values, min_age: low, max_age: high })} />
      </div>
      <div className="filter-group">
        <span className="filter-group__label"><Icon name="star" size={16} /> Fame rating</span>
        <RangeField label="fame" min={0} max={100} low={values.min_fame} high={values.max_fame} onChange={(low, high) => onChange({ ...values, min_fame: low, max_fame: high })} />
      </div>
      <label className="filter-field">
        <span><Icon name="pin" size={16} /> Maximum distance (km)</span>
        <input className="input" type="number" min={0} max={20040} placeholder="Anywhere" value={values.max_distance_km} onChange={(event) => set("max_distance_km", event.target.value)} />
      </label>
      <label className="filter-field">
        <span><Icon name="layers" size={16} /> Shared interests</span>
        <span className="filter-search"><Icon name="search" size={14} /><input className="input" placeholder="Add interests…" aria-label="Find interest tags" value={tagQuery} onChange={(event) => setTagQuery(event.target.value)} /></span>
      </label>
      <div className="filter-group">
        <span className="filter-group__label"><Icon name="tag" size={16} /> Tags</span>
        <div className="filter-tags">
          {visibleTags.map((tag) => <button type="button" key={tag} className={`tag-chip tag-chip--button${values.tags.includes(tag) ? " tag-chip--active" : ""}`} aria-pressed={values.tags.includes(tag)} onClick={() => set("tags", values.tags.includes(tag) ? values.tags.filter((entry) => entry !== tag) : [...values.tags, tag])}>#{tag}</button>)}
          {!tagQuery && matchingTags.length > 5 ? <button type="button" className="tag-chip tag-chip--button" onClick={() => setShowTags((current) => !current)} aria-expanded={showTags}>{showTags ? "Fewer" : `+${matchingTags.length - 5}`}</button> : null}
        </div>
        {tagQuery && !matchingTags.length ? <p className="text-small text-muted">No matching interests.</p> : null}
      </div>
      <label className="filter-field">
        <span><Icon name="sort" size={16} /> Sort by</span>
        <select className="input" value={values.sort} onChange={(event) => onChange({ ...values, sort: event.target.value as SortKey, direction: "" })}>{SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      </label>
      {values.sort !== "recommended" ? <label className="filter-field"><span>Sort direction</span><select className="input" value={values.direction} onChange={(event) => set("direction", event.target.value as SortDirection | "")}><option value="">Default direction</option><option value="asc">Ascending</option><option value="desc">Descending</option></select></label> : null}
    </div>
    {onApply ? <div className="filter-panel__foot"><Button full loading={busy} onClick={onApply}>Search profiles</Button></div> : null}
  </aside>;
}
export { EMPTY_FILTERS };
