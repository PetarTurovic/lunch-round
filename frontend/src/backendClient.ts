const API_BASE = "/api";

export interface ApiRequestOptions extends RequestInit {
  token?: string;
  participantToken?: string;
}

interface ApiErrorPayload {
  error?: { message?: string };
}

export async function apiRequest<T>(path: string, requestOptions: ApiRequestOptions = {}): Promise<T> {
  const { token, participantToken, ...options } = requestOptions;
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");

  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (participantToken) headers.set("X-Participant-Token", participantToken);

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    const message = payload && typeof payload === "object"
      ? (payload as ApiErrorPayload).error?.message
      : undefined;
    throw new Error(message || `Request failed (${response.status}).`);
  }

  return payload as T;
}

export function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}
