import type { MapBounds, MapSettings, MapProfilePage } from "./types/userMap";
import { apiUrl, request } from "./client";
import type {
  BlockedUser,
  Conversation,
  DiscoveryFilters,
  DiscoveryProfile,
  Me,
  Message,
  MessagePageParams,
  NotificationPage,
  PageParams,
  PersonSummary,
  ProfilePatch,
  PublicProfile,
  ResolvedLocation,
  StatusResponse,
} from "./types";

export const api = {
  userMap: {
    settings: () => request<MapSettings>("/me/map"),
    share: (visible: boolean) => request<MapSettings>("/me/map", {
      method: "PUT", body: visible ? { map_visible: true, consent: true } : { map_visible: false },
    }),
    profiles: (bounds: MapBounds, after: number, signal?: AbortSignal) =>
      request<MapProfilePage>("/map/profiles", { query: { ...bounds, after, limit: 100 }, signal }),
  },
  system: {
    health: () => request<StatusResponse>("/health"),
  },

  auth: {
    register: (input: {
      username: string;
      email: string;
      first_name: string;
      last_name: string;
      password: string;
    }) =>
      request<StatusResponse>("/auth/register", {
        method: "POST",
        body: input,
        silentAuth: true,
      }),

    resendVerification: (email: string) =>
      request<StatusResponse>("/auth/resend-verification", {
        method: "POST",
        body: { email },
        silentAuth: true,
      }),

    verify: (token: string) =>
      request<void>("/auth/verify", { method: "POST", body: { token }, silentAuth: true }),

    login: (username: string, password: string) =>
      request<{ id: number; username: string }>("/auth/login", {
        method: "POST",
        body: { username, password },
        silentAuth: true,
      }),

    logout: () => request<void>("/auth/logout", { method: "POST" }),

    forgotPassword: (email: string) =>
      request<StatusResponse>("/auth/forgot-password", {
        method: "POST",
        body: { email },
        silentAuth: true,
      }),

    resetPassword: (token: string, password: string) =>
      request<void>("/auth/reset-password", {
        method: "POST",
        body: { token, password },
        silentAuth: true,
      }),

    changeEmail: (email: string, password: string) =>
      request<StatusResponse>("/me/email-change", {
        method: "POST",
        body: { email, password },
      }),

    confirmEmail: (token: string) =>
      request<void>("/auth/confirm-email", {
        method: "POST",
        body: { token },
        silentAuth: true,
      }),
  },

  profile: {
    me: (signal?: AbortSignal) => request<Me>("/me", { signal }),
    update: (patch: ProfilePatch) => request<void>("/me", { method: "PATCH", body: patch }),
    tags: (q: string, signal?: AbortSignal) =>
      request<{ tags: string[] }>("/tags", { query: { q }, signal }),

    setLocation: (
      location:
        | { source: "manual"; query: string }
        | { source: "manual"; confirmation_token: string }
        | { source: "gps"; latitude: number; longitude: number; consent: true },
    ) => request<ResolvedLocation>("/me/location", { method: "PUT", body: location }),

    clearLocation: () => request<void>("/me/location", { method: "DELETE" }),

    uploadPhoto: (file: File) => {
      const form = new FormData();
      form.append("photo", file);
      return request<{ id: number; is_primary: boolean }>("/me/photos", {
        method: "POST",
        form,
      });
    },

    setPrimaryPhoto: (photoId: number) =>
      request<void>(`/me/photos/${photoId}/primary`, { method: "PUT" }),

    deletePhoto: (photoId: number) =>
      request<void>(`/me/photos/${photoId}`, { method: "DELETE" }),

    view: (userId: number, signal?: AbortSignal) =>
      request<PublicProfile>(`/profiles/${userId}`, { signal }),

    recordVisit: (userId: number) =>
      request<void>(`/profiles/${userId}/visits`, { method: "POST" }),
  },

  discovery: {
    suggestions: (filters: DiscoveryFilters, signal?: AbortSignal) =>
      request<{ profiles: DiscoveryProfile[] }>("/discovery/suggestions", {
        query: filters,
        signal,
      }),
    search: (filters: DiscoveryFilters, signal?: AbortSignal) =>
      request<{ profiles: DiscoveryProfile[] }>("/discovery/search", {
        query: filters,
        signal,
      }),
  },

  relationships: {
    like: (userId: number) =>
      request<{ connected: boolean }>(`/profiles/${userId}/like`, { method: "PUT" }),
    unlike: (userId: number) =>
      request<void>(`/profiles/${userId}/like`, { method: "DELETE" }),
    report: (userId: number) =>
      request<void>(`/profiles/${userId}/report`, { method: "PUT" }),
    block: (userId: number) => request<void>(`/profiles/${userId}/block`, { method: "PUT" }),
    unblock: (userId: number) => request<void>(`/profiles/${userId}/block`, { method: "DELETE" }),
    blocks: (params?: PageParams) =>
      request<{ blocks: BlockedUser[] }>("/me/blocks", { query: params }),
    visitors: (params?: PageParams) =>
      request<{ visitors: PersonSummary[] }>("/me/visitors", { query: params }),
    likes: (params?: PageParams) =>
      request<{ likes: PersonSummary[] }>("/me/likes", { query: params }),
  },

  chat: {
    conversations: (params?: PageParams) =>
      request<{ conversations: Conversation[] }>("/chat", { query: params }),
    messages: (userId: number, params?: MessagePageParams) =>
      request<{ messages: Message[] }>(`/chat/${userId}/messages`, { query: params }),
    send: (userId: number, body: string, clientId: string) =>
      request<Message>(`/chat/${userId}/messages`, {
        method: "POST",
        body: { body, client_id: clientId },
      }),
  },

  notifications: {
    list: (params?: { before?: number; limit?: number }, signal?: AbortSignal) =>
      request<NotificationPage>("/notifications", { query: params, signal }),
    markRead: (notificationId: number) =>
      request<void>(`/notifications/${notificationId}/read`, { method: "PUT" }),
    markThrough: (through: number) =>
      request<void>("/notifications/read", { method: "PUT", body: { through } }),
    presence: () => request<void>("/presence", { method: "POST" }),
  },
};

export const photoUrl = (photoId: number): string => apiUrl(`/photos/${photoId}`);
export { ApiError, UNAUTHORIZED_EVENT } from "./client";
export type * from "./types";
