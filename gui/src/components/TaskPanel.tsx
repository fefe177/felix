import { useState } from "react";

import { ApiError, cancelTask, startTask } from "../api/client";
import type { PendingConfirmation, RunState, SafetyMode } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";

const MODES: SafetyMode[] = ["safe", "balanced", "autonomous"];

interface Props {
  run: RunState;
  pendingConfirmation: PendingConfirmation | null;
  onConfirmationResolved: () => void;
}

/** Goal input, safety-mode/multi-agent controls and start/stop buttons. */
export function TaskPanel({ run, pendingConfirmation, onConfirmationResolved }: Props) {
  const [goal, setGoal] = useState("");
  const [mode, setMode] = useState<SafetyMode>("balanced");
  const [multiAgent, setMultiAgent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRunning = run.status === "running" || run.status === "needs_input";

  const onStart = async () => {
    if (!goal.trim()) {
      setError("Bitte ein Ziel eingeben.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await startTask(goal.trim(), mode, multiAgent);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("Es laeuft bereits ein Agentenlauf.");
      } else {
        setError(err instanceof ApiError ? err.message : "Start fehlgeschlagen.");
      }
    } finally {
      setBusy(false);
    }
  };

  const onStop = async () => {
    if (!run.taskId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await cancelTask(run.taskId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Abbruch fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card task-panel">
      <div className="task-row">
        <textarea
          className="goal-input"
          placeholder="Was soll LocalPilot tun?"
          value={goal}
          rows={2}
          disabled={isRunning}
          onChange={(event) => setGoal(event.target.value)}
        />
      </div>

      <div className="task-controls">
        <div className="mode-group" role="radiogroup" aria-label="Sicherheitsmodus">
          {MODES.map((option) => (
            <button
              key={option}
              role="radio"
              aria-checked={mode === option}
              className={`mode-button ${mode === option ? "active" : ""}`}
              disabled={isRunning}
              onClick={() => setMode(option)}
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>

        <label className="toggle">
          <input
            type="checkbox"
            checked={multiAgent}
            disabled={isRunning}
            onChange={(event) => setMultiAgent(event.target.checked)}
          />
          Multi-Agent
        </label>

        <div className="task-buttons">
          {isRunning ? (
            <button className="btn btn-danger" disabled={busy} onClick={onStop}>
              Stop
            </button>
          ) : (
            <button className="btn btn-primary" disabled={busy} onClick={onStart}>
              Start
            </button>
          )}
        </div>
      </div>

      <div className="run-status">
        <span className={`status-pill status-${run.status}`}>{run.status}</span>
        {run.role && <span className="role-pill">Rolle: {run.role}</span>}
        {run.taskId && <span className="task-id">#{run.taskId.slice(0, 8)}</span>}
        {run.summary && <span className="run-summary">{run.summary}</span>}
      </div>

      {run.status === "needs_input" && run.question && (
        <p className="info-text">Rueckfrage: {run.question}</p>
      )}
      {error && <p className="error-text">{error}</p>}

      {pendingConfirmation && (
        <ConfirmDialog pending={pendingConfirmation} onResolved={onConfirmationResolved} />
      )}
    </section>
  );
}
