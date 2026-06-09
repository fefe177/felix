// Backend URL resolution, shared by the REST client and the event-stream hook.
//
// Priority: the URL injected by the Electron preload, then a Vite env var, then
// the local default. This keeps the GUI working both inside Electron and in a
// plain browser during development.

const DEFAULT_BASE_URL = "http://127.0.0.1:8765";

interface InjectedApi {
  backendUrl?: string;
}

function injectedBackendUrl(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const injected = (window as unknown as { localpilot?: InjectedApi }).localpilot;
  return injected?.backendUrl;
}

function envBackendUrl(): string | undefined {
  try {
    return import.meta.env?.VITE_BACKEND_URL as string | undefined;
  } catch {
    return undefined;
  }
}

/** Return the backend base URL (no trailing slash). */
export function getBaseUrl(): string {
  return injectedBackendUrl() ?? envBackendUrl() ?? DEFAULT_BASE_URL;
}

/** Return the WebSocket URL for the event stream. */
export function getWsUrl(): string {
  return `${getBaseUrl().replace(/^http/, "ws")}/ws/events`;
}
