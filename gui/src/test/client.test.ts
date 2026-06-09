import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  confirm,
  getTasks,
  setPreference,
  startTask,
} from "../api/client";

const BASE = "http://127.0.0.1:8765";

function mockJsonOnce(body: unknown, ok = true, status = 200): void {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("api client", () => {
  it("startTask POSTs the goal, mode and multi_agent flag", async () => {
    mockJsonOnce({ task_id: "abc" });
    const result = await startTask("Tu etwas", "balanced", true);
    expect(result.task_id).toBe("abc");

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`${BASE}/api/tasks`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      goal: "Tu etwas",
      safety_mode: "balanced",
      multi_agent: true,
    });
  });

  it("getTasks builds the limit query", async () => {
    mockJsonOnce([]);
    await getTasks(5);
    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`${BASE}/api/tasks?limit=5`);
  });

  it("setPreference uses PUT with key/value", async () => {
    mockJsonOnce({ ok: true });
    await setPreference("theme", "dark");
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`${BASE}/api/memory/preferences`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ key: "theme", value: "dark" });
  });

  it("confirm posts the decision", async () => {
    mockJsonOnce({ resolved: true });
    const result = await confirm(false);
    expect(result.resolved).toBe(true);
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ decision: false });
  });

  it("throws ApiError with the status on a 409", async () => {
    mockJsonOnce({ detail: "Es laeuft bereits ein Agentenlauf." }, false, 409);
    await expect(startTask("x", "safe", false)).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
    });
  });

  it("wraps network failures as ApiError with status 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connection refused")),
    );
    await expect(getTasks()).rejects.toBeInstanceOf(ApiError);
  });
});
