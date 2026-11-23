import type { Message } from "../../api";

const GROUP_WINDOW_MS = 3 * 60 * 1000;

export function groupMessages(messages: Message[]): Message[][] {
  const groups: Message[][] = [];
  for (const message of messages) {
    const group = groups.at(-1);
    const previous = group?.at(-1);
    const time = new Date(message.created_at);
    const previousTime = previous ? new Date(previous.created_at) : null;
    const gap = previousTime ? time.getTime() - previousTime.getTime() : Infinity;
    if (group && previous?.sender_id === message.sender_id && previousTime
      && time.toDateString() === previousTime.toDateString() && gap >= 0 && gap < GROUP_WINDOW_MS) {
      group.push(message);
    } else {
      groups.push([message]);
    }
  }
  return groups;
}
