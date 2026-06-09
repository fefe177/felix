// REST client for the LocalPilot backend, plus a re-export of the event-stream
// hook so callers can import everything API-related from one module.

import type {
  HealthResponse,
  SafetyMode,
  StrategyRecord,
  TaskBundle,
  TaskRecord,
} from "../types";
import { getBaseUrl } from "./config";

/** Error raised for non-2xx HTTP responses, carrying the status code. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Netzwerkfehler";
    throw new ApiError(0, `Backend nicht erreichbar: ${reason}`);
  }
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) {
        detail = body.detail;
      }
    } catch {
      // No JSON body; keep the status text.
    }
    throw new ApiError(response.status, detail);
  }
  return (await response.json()) as T;
}

export function startTask(
  goal: string,
  safetyMode: SafetyMode,
  multiAgent: boolean,
): Promise<{ task_id: string }> {
  return request("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ goal, safety_mode: safetyMode, multi_agent: multiAgent }),
  });
}

export function cancelTask(taskId: string): Promise<{ cancelled: boolean }> {
  return request(`/api/tasks/${encodeURIComponent(taskId)}/cancel`, { method: "POST" });
}

export function confirm(decision: boolean): Promise<{ resolved: boolean }> {
  return request("/api/confirm", { method: "POST", body: JSON.stringify({ decision }) });
}

export function getTasks(limit = 20): Promise<TaskRecord[]> {
  return request(`/api/tasks?limit=${limit}`);
}

export function getTask(taskId: string): Promise<TaskBundle> {
  return request(`/api/tasks/${encodeURIComponent(taskId)}`);
}

export function getPreferences(): Promise<Record<string, string>> {
  return request("/api/memory/preferences");
}

export function setPreference(key: string, value: string): Promise<{ ok: boolean }> {
  return request("/api/memory/preferences", {
    method: "PUT",
    body: JSON.stringify({ key, value }),
  });
}

export function getStrategies(): Promise<StrategyRecord[]> {
  return request("/api/memory/strategies");
}

export function getConfig(): Promise<Record<string, unknown>> {
  return request("/api/config");
}

export function getHealth(): Promise<HealthResponse> {
  return request("/api/health");
}

export { getBaseUrl, getWsUrl } from "./config";
export { useEventStream } from "./useEventStream";
export type { EventState } from "./useEventStream";
