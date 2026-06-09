// React hook subscribing to /ws/events and reducing the raw events into typed,
// component-friendly state (run status, plan, tool calls, logs, screenshot and a
// pending safety confirmation). The socket reconnects automatically.

import { useEffect, useReducer } from "react";

import type {
  AgentEvent,
  LogLine,
  PendingConfirmation,
  PlanStep,
  RunState,
  ToolCallEntry,
} from "../types";
import { getWsUrl } from "./config";

export type ConnectionStatus = "connecting" | "open" | "closed";

export interface EventState {
  connection: ConnectionStatus;
  run: RunState;
  plan: PlanStep[];
  completedSteps: number;
  logs: LogLine[];
  toolCalls: ToolCallEntry[];
  screenshot: string | null;
  pendingConfirmation: PendingConfirmation | null;
  lastEventAt: number | null;
}

const MAX_LOGS = 500;
const MAX_TOOL_CALLS = 200;

const initialState: EventState = {
  connection: "connecting",
  run: { status: "idle" },
  plan: [],
  completedSteps: 0,
  logs: [],
  toolCalls: [],
  screenshot: null,
  pendingConfirmation: null,
  lastEventAt: null,
};

interface PendingToolMeta {
  tool: string;
  durationMs: number;
}

type Action =
  | { kind: "connection"; status: ConnectionStatus }
  | { kind: "event"; event: AgentEvent; pendingMeta: { current: PendingToolMeta | null } }
  | { kind: "clearConfirmation" }
  | { kind: "reset" };

function basename(value: string): string {
  const parts = value.split(/[\\/]/);
  return parts[parts.length - 1] || value;
}

let nextId = 1;

function reduceEvent(
  state: EventState,
  event: AgentEvent,
  pendingMeta: { current: PendingToolMeta | null },
): EventState {
  const now = Date.now();
  const base = { ...state, lastEventAt: now };

  switch (event.type) {
    case "agent_start":
    case "orchestrator_start":
      return {
        ...base,
        run: { status: "running", taskId: String(event.task_id ?? ""), goal: String(event.goal ?? "") },
        plan: [],
        completedSteps: 0,
        toolCalls: [],
        screenshot: null,
        pendingConfirmation: null,
      };

    case "agent_plan":
    case "orchestrator_plan":
      return { ...base, plan: (event.plan as PlanStep[] | undefined) ?? [], completedSteps: 0 };

    case "role_switch":
      return { ...base, run: { ...state.run, role: event.role ? String(event.role) : state.run.role } };

    case "tool_call":
      pendingMeta.current = {
        tool: String(event.tool_name ?? ""),
        durationMs: Number(event.duration_ms ?? 0),
      };
      return base;

    case "agent_act": {
      const tool = String(event.tool ?? "");
      const meta = pendingMeta.current;
      const entry: ToolCallEntry = {
        id: nextId++,
        tool,
        args: event.arguments,
        ok: typeof event.ok === "boolean" ? event.ok : null,
        durationMs: meta && meta.tool === tool ? meta.durationMs : undefined,
        ts: now,
      };
      pendingMeta.current = null;
      return { ...base, toolCalls: [...state.toolCalls, entry].slice(-MAX_TOOL_CALLS) };
    }

    case "agent_verify": {
      if (event.success === true) {
        return { ...base, completedSteps: Math.min(state.completedSteps + 1, state.plan.length) };
      }
      return base;
    }

    case "screenshot":
      return { ...base, screenshot: event.path ? basename(String(event.path)) : state.screenshot };

    case "confirmation_request":
      return { ...base, pendingConfirmation: { prompt: String(event.prompt ?? "") } };

    case "agent_finish":
    case "run_finished":
      return {
        ...base,
        run: { ...state.run, status: "completed", summary: event.summary ? String(event.summary) : state.run.summary },
        completedSteps: state.plan.length,
        pendingConfirmation: null,
      };

    case "agent_failed":
    case "run_error":
      return {
        ...base,
        run: {
          ...state.run,
          status: "failed",
          summary: String(event.summary ?? event.error ?? "Fehlgeschlagen"),
        },
        pendingConfirmation: null,
      };

    case "agent_ask_user":
      return {
        ...base,
        run: { ...state.run, status: "needs_input", question: String(event.question ?? "") },
      };

    case "log":
      return {
        ...base,
        logs: [
          ...state.logs,
          {
            id: nextId++,
            level: String(event.level ?? "INFO"),
            logger: String(event.logger ?? ""),
            message: String(event.message ?? ""),
            ts: now,
          },
        ].slice(-MAX_LOGS),
      };

    default:
      return base;
  }
}

function reducer(state: EventState, action: Action): EventState {
  switch (action.kind) {
    case "connection":
      return { ...state, connection: action.status };
    case "event":
      return reduceEvent(state, action.event, action.pendingMeta);
    case "clearConfirmation":
      return { ...state, pendingConfirmation: null };
    case "reset":
      return { ...initialState, connection: state.connection };
    default:
      return state;
  }
}

export interface EventStream extends EventState {
  resetConfirmation: () => void;
  clearRun: () => void;
}

/** Subscribe to the backend event stream and return the reduced state. */
export function useEventStream(): EventStream {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const pendingMeta = { current: null as PendingToolMeta | null };

    const connect = () => {
      dispatch({ kind: "connection", status: "connecting" });
      socket = new WebSocket(getWsUrl());
      socket.onopen = () => dispatch({ kind: "connection", status: "open" });
      socket.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data as string) as AgentEvent;
          dispatch({ kind: "event", event, pendingMeta });
        } catch {
          // Ignore malformed frames.
        }
      };
      socket.onclose = () => {
        dispatch({ kind: "connection", status: "closed" });
        if (!closed) {
          retryTimer = setTimeout(connect, 1500);
        }
      };
      socket.onerror = () => socket?.close();
    };

    connect();

    return () => {
      closed = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      socket?.close();
    };
  }, []);

  return {
    ...state,
    resetConfirmation: () => dispatch({ kind: "clearConfirmation" }),
    clearRun: () => dispatch({ kind: "reset" }),
  };
}
