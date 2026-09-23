/**
 * Centralized API Client for AI Quiz Generator
 * Handles base URL, auth tokens, headers, and uniform error handling.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
    ? `http://${window.location.hostname}:8000`
    : "http://localhost:8000");

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function getUserRole(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("role");
}

export function getUserName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("name") || "";
}

export function clearAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("name");
}

export interface ApiOptions extends RequestInit {
  auth?: boolean;
}

export async function apiFetch<T = any>(
  endpoint: string,
  options: ApiOptions = {}
): Promise<{ ok: boolean; status: number; data: T; error?: string }> {
  const { auth = true, headers = {}, ...rest } = options;
  const url = `${API_BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const requestHeaders: Record<string, string> = { ...(headers as Record<string, string>) };

  // Auto attach json content type if body is stringified json and not FormData
  if (rest.body && typeof rest.body === "string" && !requestHeaders["Content-Type"]) {
    requestHeaders["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = getAuthToken();
    if (token) {
      requestHeaders["Authorization"] = `Bearer ${token}`;
    }
  }

  try {
    const response = await fetch(url, {
      ...rest,
      headers: requestHeaders,
    });

    let data: any = null;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      // Auto clear stale token and redirect if session has expired
      if (response.status === 401 && auth && typeof window !== "undefined") {
        clearAuth();
        if (window.location.pathname !== "/") {
          window.location.href = "/";
        }
      }

      return {
        ok: false,
        status: response.status,
        data,
        error: data?.detail || data?.message || "Request failed",
      };
    }

    return { ok: true, status: response.status, data };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      data: null as any,
      error: err?.message || "Network error. Please check your backend connection.",
    };
  }
}

export async function switchUserRole(newRole: "student" | "teacher"): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch("/auth/switch-role", {
    method: "POST",
    body: JSON.stringify({ new_role: newRole }),
  });
  if (res.ok) {
    if (typeof window !== "undefined") {
      localStorage.setItem("role", newRole);
    }
    return { ok: true };
  }
  return { ok: false, error: res.error };
}
