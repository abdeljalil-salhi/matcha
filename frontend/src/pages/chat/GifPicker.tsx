import { useEffect, useRef, useState } from "react";
import { api, type ChatGif } from "../../api";
import { Icon } from "../../components/ui/Icon";
import { Spinner } from "../../components/ui/Misc";

interface GifPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (gif: ChatGif) => void;
}

export function GifPicker({ open, onClose, onPick }: GifPickerProps) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<ChatGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setError(null);
    setGifs([]);
    setQuery("");
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setGifs([]);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(async () => {
      try {
        const page = await api.chat.gifs(q, 24, controller.signal);
        if (!controller.signal.aborted) setGifs(page.gifs);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Unable to load GIFs.");
        setGifs([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  if (!open) return null;

  return (
    <div className="gif-picker" role="dialog" aria-label="Search GIFs">
      <div className="gif-picker__head">
        <label className="gif-picker__search">
          <Icon name="search" size={15} />
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder="Search GIFs"
            aria-label="Search GIFs"
            onChange={(event) => {
              setQuery(event.target.value);
              setTouched(true);
            }}
          />
        </label>
        <button type="button" className="icon-button gif-picker__close" onClick={onClose} aria-label="Close GIF picker">
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="gif-picker__body">
        {loading ? <div className="gif-picker__state"><Spinner label="Loading GIFs" /></div> : null}
        {!loading && error ? <p className="gif-picker__state gif-picker__state--error">{error}</p> : null}
        {!loading && !error && !touched ? (
          <p className="gif-picker__state">Search for a reaction, mood, or moment.</p>
        ) : null}
        {!loading && !error && touched && query.trim() && gifs.length === 0 ? (
          <p className="gif-picker__state">No GIFs found for "{query.trim()}".</p>
        ) : null}
        {!loading && !error && gifs.length > 0 ? (
          <ul className="gif-picker__grid">
            {gifs.map((gif) => (
              <li key={gif.id || gif.url}>
                <button type="button" className="gif-picker__item" onClick={() => onPick(gif)}>
                  <img
                    src={gif.preview_url}
                    alt={gif.title || "GIF"}
                    loading="lazy"
                    width={gif.width ?? undefined}
                    height={gif.height ?? undefined}
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="gif-picker__footer">
        <span className="gif-picker__attribution">Powered By GIPHY</span>
      </div>
    </div>
  );
}
