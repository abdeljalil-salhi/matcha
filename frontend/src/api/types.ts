export type Gender = "woman" | "man" | "nonbinary" | "other";
export type LocationSource = "manual" | "gps";
export type NotificationKind = "like" | "visit" | "message" | "match" | "unlike";
export type SortKey = "recommended" | "age" | "location" | "fame" | "common_tags" | "newest";
export type SortDirection = "asc" | "desc";

export interface PhotoRef {
  id: number;
  is_primary: boolean;
}

export interface Me {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  gender: Gender | null;
  seeks: Gender[] | null;
  bio: string | null;
  city: string | null;
  area: string | null;
  country_code: string | null;
  location_source: LocationSource | null;
  location_set_at: string | null;
  is_demo: boolean;
  complete: boolean;
  tags: string[];
  photos: PhotoRef[];
}

export interface ProfilePatch {
  first_name?: string;
  last_name?: string;
  birth_date?: string | null;
  gender?: Gender | null;
  seeks?: Gender[] | null;
  bio?: string | null;
  tags?: string[];
}

export interface ResolvedLocation {
  city: string;
  area: string | null;
  country_code: string;
  location_source: LocationSource;
}

export interface PublicProfile {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  age: number;
  gender: Gender;
  seeks: Gender[] | null;
  bio: string | null;
  city: string | null;
  area: string | null;
  country_code: string | null;
  fame: number;
  photo_id: number | null;
  tags: string[];
  is_demo: boolean;
  last_seen: string | null;
  online: boolean;
  photos: PhotoRef[];
  likes_them: boolean;
  likes_you: boolean;
  connected: boolean;
}

export interface DiscoveryProfile {
  likes_them?: boolean;
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  age: number;
  gender: Gender;
  city: string | null;
  area: string | null;
  country_code: string | null;
  fame: number;
  photo_id: number | null;
  tags: string[];
  is_demo: boolean;
  distance_km: number | null;
  common_tags: number;
}

export interface DiscoveryFilters {
  min_age?: number;
  max_age?: number;
  min_fame?: number;
  max_fame?: number;
  max_distance_km?: number;
  min_common_tags?: number;
  location?: string;
  tag?: string[];
  sort?: SortKey;
  direction?: SortDirection;
  limit?: number;
  offset?: number;
}

export interface PersonSummary {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  photo_id: number | null;
  created_at?: string;
  last_viewed_at?: string;
  connected?: boolean;
}

export interface BlockedUser {
  id: number;
  username: string;
}

export interface Conversation {
  online: boolean;
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  photo_id: number | null;
  latest_message_id: number | null;
  latest_message_at: string | null;
}

export type MessageKind = "text" | "gif";

export interface Message {
  id: number;
  sender_id: number;
  recipient_id: number;
  kind: MessageKind;
  body: string;
  media_url: string | null;
  media_alt: string | null;
  client_id: string;
  created_at: string;
}

export interface ChatGif {
  id: string;
  title: string;
  url: string;
  preview_url: string;
  width: number | null;
  height: number | null;
}

export interface Notification {
  unread_count: number;
  id: number;
  actor_id: number;
  actor_username: string;
  kind: NotificationKind;
  message_id: number | null;
  created_at: string;
  read_at: string | null;
}

export interface NotificationPage {
  unread: {
    total: number;
    messages: number;
  };
  notifications: Notification[];
}

export interface PageParams {
  limit?: number;
  offset?: number;
}

export interface MessagePageParams {
  before?: number;
  after?: number;
  limit?: number;
}

export interface StatusResponse {
  status: string;
}

export interface CityLocationSuggestion {
  city: string;
  country_code: string;
  confirmation_token: string;
}
