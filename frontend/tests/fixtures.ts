import type { Conversation, Me, Message } from "../src/api/types";

export const user: Me = {
  id: 1, username: "alice", email: "alice@example.test",
  first_name: "Alice", last_name: "Example", birth_date: "1995-01-01",
  gender: "woman", seeks: null, bio: "A profile", city: "Paris", area: "Montmartre",
  country_code: "FR", location_source: "manual", location_set_at: null,
  is_demo: false, complete: true, tags: ["art"], photos: [],
};

export const conversation: Conversation = {
  id: 2, username: "bob", first_name: "Bob", last_name: "Example",
  photo_id: null, latest_message_id: null, latest_message_at: null,
};

export const message: Message = {
  id: 1, sender_id: 2, recipient_id: 1, body: "The first incoming message",
  client_id: "00000000-0000-4000-8000-000000000001", created_at: "2026-11-22T12:00:00Z",
};
