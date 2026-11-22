import type { ReactNode } from "react";

export type IconName =
  | "compass"
  | "search"
  | "heart"
  | "heartOff"
  | "eye"
  | "message"
  | "bell"
  | "chevronLeft"
  | "chevronDown"
  | "chevronRight"
  | "menu"
  | "logout"
  | "pin"
  | "check"
  | "crosshair"
  | "star"
  | "mail"
  | "shield"
  | "camera"
  | "plus"
  | "minus"
  | "close"
  | "refresh"
  | "sliders"
  | "clock"
  | "block"
  | "flag"
  | "send"
  | "user"
  | "spark"
  | "crop"
  | "rotateLeft"
  | "rotateRight";

const PATHS: Record<IconName, ReactNode> = {
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.8 8.2-2.2 5.4-5.4 2.2 2.2-5.4 5.4-2.2Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </>
  ),
  heart: <path d="M20.8 8.6c0 4.3-8.8 10.2-8.8 10.2S3.2 12.9 3.2 8.6a4.6 4.6 0 0 1 8.8-1.8 4.6 4.6 0 0 1 8.8 1.8Z" />,
  heartOff: (
    <>
      <path d="M20.8 8.6c0 1.8-.9 3.7-2.4 5.3" />
      <path d="M12 18.8 3.2 8.6a4.6 4.6 0 0 1 8.8-1.8" />
      <path d="m4 4 16 16" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  message: <path d="M20 15.5a2.5 2.5 0 0 1-2.5 2.5H8l-4 3V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v9Z" />,
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
      <path d="M10 21h4" />
    </>
  ),
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  logout: (
    <>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M15 16l4-4-4-4" />
      <path d="M19 12H9" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  crosshair: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  close: <path d="M6 6 18 18M18 6 6 18" />,
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-.8 4.4" />
      <path d="M20 5v6h-6" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  block: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m6 6 12 12" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 5h11l-2 3.5L16 12H5" />
    </>
  ),
  send: <path d="m21 3-8.5 18-2.3-7.2L3 11.5 21 3Z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  spark: <path d="M12 3v5M12 16v5M3 12h5M16 12h5M6.4 6.4l3.5 3.5M14.1 14.1l3.5 3.5M17.6 6.4l-3.5 3.5M9.9 14.1l-3.5 3.5" />,
  crop: (
    <>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M2 6h14a2 2 0 0 1 2 2v14" />
    </>
  ),
  rotateLeft: (
    <>
      <path d="M4 11a8 8 0 1 1 .8 4.4" />
      <path d="M4 5v6h6" />
    </>
  ),
  rotateRight: (
    <>
      <path d="M20 11a8 8 0 1 0-.8 4.4" />
      <path d="M20 5v6h-6" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 18, className, strokeWidth = 1.75 }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
