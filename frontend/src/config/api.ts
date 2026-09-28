/**
 * Centralized API & WebSocket URL resolution for Video Cleaner.
 * Supports dynamic port assignment from Desktop Shell (Electron) and web dev fallback.
 */

declare global {
  interface Window {
    __API_PORT__?: number;
  }
}

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    // 1. Check window global
    if (window.__API_PORT__) {
      return `http://127.0.0.1:${window.__API_PORT__}`;
    }
    // 2. Check query parameter
    try {
      const params = new URLSearchParams(window.location.search);
      const port = params.get("apiPort");
      if (port && !isNaN(Number(port))) {
        return `http://127.0.0.1:${port}`;
      }
    } catch {
      // Fallback
    }
  }
  return "http://127.0.0.1:8000";
}

export function getWsBaseUrl(): string {
  const apiBase = getApiBaseUrl();
  return apiBase.replace(/^http:\/\//, "ws://");
}

export function getApiEndpoint(endpoint: string): string {
  const base = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${base}${cleanEndpoint}`;
}
