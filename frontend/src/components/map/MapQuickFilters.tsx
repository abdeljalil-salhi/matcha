import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../ui/Icon";

export interface MapFilterValues {
  minAge: number;
  maxAge: number;
  distance: string;
  interest: string;
  fame: number;
}

type QuickFilter = "interests" | "age" | "distance";

interface Props {
  filters: MapFilterValues;
  onChange: (filters: MapFilterValues) => void;
  tags: string[];
  hasSavedArea: boolean;
  onMoreFilters: () => void;
}

export function MapQuickFilters({ filters, onChange, tags, hasSavedArea, onMoreFilters }: Props) {
  const [open, setOpen] = useState<QuickFilter | null>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const id = useId();

  const close = () => {
    setOpen(null);
    trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("select, input, button")?.focus();
    const outside = (event: PointerEvent) => {
      if (!toolbar.current?.contains(event.target as Node)) setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(null);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return <div className="map-explorer__toolbar" aria-label="Map filters" ref={toolbar}
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(null);
    }}>
    {(["interests", "age", "distance"] as const).map((kind) => {
      const label = { interests: "Interests", age: "Age", distance: "Distance" }[kind];
      const active = kind === "interests" ? Boolean(filters.interest)
        : kind === "age" ? filters.minAge !== 18 || filters.maxAge !== 120 : Boolean(filters.distance);
      return <div className="map-quick-filter" key={kind}>
        <button type="button" className={active ? "is-active" : undefined}
          aria-haspopup="dialog" aria-expanded={open === kind} aria-controls={open === kind ? `${id}-${kind}` : undefined}
          onClick={(event) => {
            trigger.current = event.currentTarget;
            setOpen((current) => current === kind ? null : kind);
          }}>
          <Icon name={kind === "interests" ? "tag" : kind === "age" ? "user" : "pin"} size={17} />
          {label}<Icon name="chevronDown" size={13} />
        </button>
        {open === kind ? <div className="map-filter-dropdown" role="dialog" aria-label={`Filter by ${kind}`} id={`${id}-${kind}`} ref={panel}>
          {kind === "interests" ? <label>Interests
            <select className="input" value={filters.interest} onChange={(event) => onChange({ ...filters, interest: event.target.value })}>
              <option value="">Any interest</option>
              {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          </label> : null}
          {kind === "age" ? <>
            <label>Minimum age<input className="input" type="number" min={18} max={120} value={filters.minAge}
              onChange={(event) => {
                const minAge = Math.max(18, Math.min(120, Number(event.target.value)));
                onChange({ ...filters, minAge, maxAge: Math.max(minAge, filters.maxAge) });
              }} /></label>
            <label>Maximum age<input className="input" type="number" min={18} max={120} value={filters.maxAge}
              onChange={(event) => {
                const maxAge = Math.max(18, Math.min(120, Number(event.target.value)));
                onChange({ ...filters, maxAge, minAge: Math.min(maxAge, filters.minAge) });
              }} /></label>
          </> : null}
          {kind === "distance" ? <>
            <label>Distance from your saved area
              <select className="input" value={filters.distance} disabled={!hasSavedArea}
                onChange={(event) => onChange({ ...filters, distance: event.target.value })}>
                <option value="">Anywhere</option>
                {[5, 10, 25, 50, 100, 250].map((distance) => <option key={distance} value={distance}>{distance} km</option>)}
              </select>
            </label>
            {!hasSavedArea ? <p>Choose a matching area to filter by distance.</p> : null}
          </> : null}
          <button type="button" className="map-filter-dropdown__done" onClick={close}>Done</button>
        </div> : null}
      </div>;
    })}
    <button type="button" onClick={() => { setOpen(null); onMoreFilters(); }}>
      <Icon name="sliders" size={17} /> More filters<Icon name="chevronDown" size={13} />
    </button>
  </div>;
}
