import { useState } from "react";
import { photoUrl } from "../../api";

interface PhotoProps {
  photoId: number | null | undefined;
  alt: string;
  className?: string;
  eager?: boolean;
}

export function Photo({ photoId, alt, className = "", eager = false }: PhotoProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (photoId == null || failed) {
    return (
      <div className={`photo-fallback ${className}`.trim()} role="img" aria-label={alt}>
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="23" r="11" />
          <path d="M11 58c1-12 10-19 21-19s20 7 21 19" />
        </svg>
      </div>
    );
  }

  return (
    <div className={`photo ${loaded ? "photo--loaded" : ""} ${className}`.trim()}>
      <img
        src={photoUrl(photoId)}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
