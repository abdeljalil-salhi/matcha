import { expect, test } from "vitest";
import { groupMessages } from "../src/pages/chat/groupMessages";
import { message } from "./fixtures";

function entry(id: number, sender: number, minute: number) {
  return { ...message, id, sender_id: sender, created_at: new Date(2026, 10, 23, 12, minute).toISOString() };
}

test("consecutive messages group until the sender or three-minute window changes", () => {
  const messages = [entry(1, 2, 0), entry(2, 2, 1), entry(3, 1, 1), entry(4, 1, 2), entry(5, 1, 5)];
  expect(groupMessages(messages).map((group) => group.map((item) => item.id)))
    .toEqual([[1, 2], [3, 4], [5]]);
  expect(groupMessages([])).toEqual([]);
});

test("midnight starts a new group within the time window", () => {
  const before = { ...message, created_at: new Date(2026, 10, 23, 23, 59).toISOString() };
  const after = { ...message, id: 2, created_at: new Date(2026, 10, 24, 0, 0).toISOString() };
  expect(groupMessages([before, after])).toEqual([[before], [after]]);
});


test("date revisions remain separate from adjacent messages by the same sender", () => {
  const messages = [entry(1, 2, 0), { ...entry(2, 2, 0), plan_id: 4 },
    { ...entry(3, 2, 0), plan_id: 4 }, entry(4, 2, 0), entry(5, 2, 1)];
  expect(groupMessages(messages).map((group) => group.map((item) => item.id)))
    .toEqual([[1], [2], [3], [4, 5]]);
});
