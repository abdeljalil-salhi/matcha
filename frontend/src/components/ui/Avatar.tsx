import { useState } from "react";
import { photoUrl } from "../../api";
import { initials } from "../../utils/format";

interface AvatarProps {
  photoId: number | null | undefined;
  name?: { first_name?: string; last_name?: string; username?: string };
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "card";
  className?: string;
  online?: boolean;
}

export function Avatar({ photoId, name, size = "md", className = "", online }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const showPhoto = photoId != null && !failed;

  return (
    <span className={`avatar avatar--${size} ${className}`.trim()}>
      {showPhoto ? (
        <img src={photoUrl(photoId)} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="avatar__initials" aria-hidden="true">
          {initials(name ?? { username: "?" })}
        </span>
      )}
      {online ? <span className="avatar__online" title="Online now" /> : null}
    </span>
  );
}
