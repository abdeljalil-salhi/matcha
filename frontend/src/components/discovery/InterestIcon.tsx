import { Icon, type IconName } from "../ui/Icon";

const ICONS: Record<string, IconName> = {
  art: "palette", books: "book", reading: "book", games: "gamepad", gaming: "gamepad",
  gardening: "leaf", nature: "leaf", hiking: "leaf", cycling: "bike", biking: "bike",
  film: "film", films: "film", cinema: "film", music: "sparkles", coding: "layers",
};

export function InterestIcon({ tag }: { tag: string }) {
  return <Icon name={ICONS[tag.toLowerCase()] ?? "tag"} size={14} strokeWidth={2.4} />;
}
