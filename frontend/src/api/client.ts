const BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api").replace(/\/$/, "");

export const UNAUTHORIZED_EVENT = "matcha:unauthorized";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type QueryValue = string | number | boolean | undefined | null | string[];

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: object;
  signal?: AbortSignal;
  /** FormData: the browser sets the multipart boundary header itself. */
  form?: FormData;
  /** Suppress the global unauthorized event (used by login/verify flows). */
  silentAuth?: boolean;
}

function buildQuery(query?: object): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(query)) {
    const value = rawValue as QueryValue;
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
    } else {
      params.set(key, String(value));
    }
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function errorMessage(payload: unknown, status: number): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    (payload as { error?: unknown }).error &&
    typeof (payload as { error: { message?: unknown } }).error.message === "string"
  ) {
    return (payload as { error: { message: string } }).error.message;
  }
  if (status === 401) return "Your session has ended. Please sign in again.";
  if (status === 503) return "The service is temporarily busy. Try again in a moment.";
  return "Something went wrong. Please try again.";
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return text;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, signal, form, silentAuth = false } = options;
  const url = `${BASE_URL}${path}${buildQuery(query)}`;

  const headers = new Headers();
  // All mutations require a browser Origin; fetch sets it automatically for same-site XHR.
  if (body !== undefined) headers.set("Content-Type", "application/json");

  const send = (): Promise<Response> =>
    fetch(url, {
      method,
      headers,
      credentials: "include",
      signal,
      body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
    });

  let response = await send();

  // Idempotent reads get one automatic retry when the database pool is saturated.
  if (response.status === 503 && method === "GET" && !signal?.aborted) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 1200));
    response = await send();
  }

  const payload = await parseBody(response);

  if (!response.ok) {
    if (response.status === 401 && !silentAuth) {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(response.status, errorMessage(payload, response.status));
  }

  return payload as T;
}

export const apiUrl = (path: string): string => `${BASE_URL}${path}`;
