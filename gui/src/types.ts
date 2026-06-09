// Shared types for the LocalPilot GUI.

export type SafetyMode = "safe" | "balanced" | "autonomous";

/** A raw event received over /ws/events. */
export interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

/** A plan step as emitted in `agent_plan` / `orchestrator_plan` events. */
export interface PlanStep {
  idx: number;
  description: string;
  done: boolean;
  notes: string;
}

/** A tool invocation shown in the ToolCalls list. */
export interface ToolCallEntry {
  id: number;
  tool: string;
  args: unknown;
  ok: boolean | null;
  durationMs?: number;
  ts: number;
}

/** A single log line streamed from the backend. */
export interface LogLine {
  id: number;
  level: string;
  logger: string;
  message: string;
  ts: number;
}

/** A confirmation the safety gate is waiting on. */
export interface PendingConfirmation {
  prompt: string;
}

export type RunStatus = "idle" | "running" | "completed" | "failed" | "needs_input";

/** High-level state of the current/last run. */
export interface RunState {
  status: RunStatus;
  taskId?: string;
  goal?: string;
  summary?: string;
  role?: string;
  question?: string;
}

// --- REST DTOs (mirror the backend models) ---

export interface TaskRecord {
  id: string;
  created_at: string;
  status: string;
  goal: string;
  safety_mode: string;
  result: string | null;
  error: string | null;
}

export interface StepRecord {
  id: string;
  task_id: string;
  idx: number;
  thought: string | null;
  tool: string | null;
  arguments: Record<string, unknown>;
  result: unknown;
  ok: boolean | null;
  created_at: string;
}

export interface TaskBundle {
  task: TaskRecord;
  steps: StepRecord[];
}

export interface StrategyRecord {
  id: string;
  pattern: string;
  description: string | null;
  success_count: number;
  fail_count: number;
  last_used_at: string | null;
  success_rate: number;
}

export interface HealthResponse {
  status: string;
  active_run: boolean;
  task_id: string | null;
}
