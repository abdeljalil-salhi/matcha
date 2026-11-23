import { useEffect, useState } from "react";

/** Count elapsed time from the first media connection, including reconnection gaps. */
export function useCallTimer(id: string | undefined, connected: boolean): string | null {
  const [clock, setClock] = useState<{ id?: string; started: number | null; seconds: number }>({ started: null, seconds: 0 });
  useEffect(() => {
    setClock((previous) => {
      const current = previous.id === id ? previous : { id, started: null, seconds: 0 };
      if (id && connected && current.started === null) return { id, started: Date.now(), seconds: 0 };
      return current;
    });
  }, [id, connected]);
  useEffect(() => {
    if (clock.started === null) return;
    const started = clock.started;
    const tick = () => setClock((previous) => ({ ...previous, seconds: Math.max(0, Math.floor((Date.now() - started) / 1000)) }));
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [clock.id, clock.started]);
  if (!id || clock.id !== id || clock.started === null) return null;
  return `${String(Math.floor(clock.seconds / 60)).padStart(2, "0")}:${String(clock.seconds % 60).padStart(2, "0")}`;
}
