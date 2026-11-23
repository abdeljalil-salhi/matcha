import { useEffect, useState } from "react";
import { api } from "../../api";
import type { MapBounds, MapProfile } from "../../api/types/userMap";

const MAX_VISIBLE_PROFILES = 1000;
const VIEWPORT_DEBOUNCE_MS = 250;
const MAP_REFRESH_MS = 15000;

/** Fetch bounded pages for the latest viewport; discard cancelled/obsolete requests. */
export function useMapProfiles(bounds: MapBounds | null) {
  const [profiles, setProfiles] = useState<MapProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) setRevision((value) => value + 1);
    }, MAP_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!bounds) return;
    const controller = new AbortController();
    // Keep current markers during fetches so popup auto-pan does not close them.
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      void (async () => {
        const found: MapProfile[] = [];
        let after = 0;
        let more = false;
        try {
          do {
            const page = await api.userMap.profiles(bounds, after, controller.signal);
            if (controller.signal.aborted) return;
            found.push(...page.profiles);
            more = page.has_more;
            if (!more || page.next_after === null || page.next_after <= after) break;
            after = page.next_after;
          } while (found.length < MAX_VISIBLE_PROFILES);
          setProfiles([...new Map(found.map((profile) => [profile.id, profile])).values()]);
          setLimited(more);
        } catch (cause) {
          if (!controller.signal.aborted) {
            setProfiles([]);
            setError(cause instanceof Error ? cause.message : "Unable to load people on the map.");
          }
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      })();
    }, VIEWPORT_DEBOUNCE_MS);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [bounds, revision]);
  return { profiles, loading, error, limited, retry: () => setRevision((value) => value + 1) };
}
