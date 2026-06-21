// Autonomy panel for the autonomous daemon (Phase 11).
// Shows daemon status, a Start/Stop toggle, live mission/goal feed, and a
// prominent PANIC STOP button.

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, getDaemonStatus, startDaemon, stopDaemon } from "../api/client";
import type { AgentEvent } from "../types";

interface DaemonFeedEntry {
  id: number;
  ts: number;
  type: string;
  mission?: string;
  goal?: string;
  status?: string;
  error?: string;
}

let _feedId = 1;

interface Props {
  /** Raw events from the WebSocket stream (passed down from App). */
  events: AgentEvent[];
}

/** Daemon control panel: Start/Stop, live feed, PANIC STOP. */
export function AutonomyPanel({ events }: Props) {
  const [active, setActive] = useState(false);
  const [missionRoot, setMissionRoot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feed, setFeed] = useState<DaemonFeedEntry[]>([]);
  const feedRef = useRef<HTMLOListElement>(null);

  // Poll daemon status on mount.
  useEffect(() => {
    let cancelled = false;
    getDaemonStatus()
      .then((s) => {
        if (!cancelled) {
          setActive(s.active);
          setMissionRoot(s.mission_root);
        }
      })
      .catch(() => {
        /* server not running – ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Reduce daemon events into the feed.
  useEffect(() => {
    const last = events[events.length - 1];
    if (!last) return;
    const t = last.type;
    if (
      t !== "daemon_start" &&
      t !== "daemon_stop" &&
      t !== "daemon_pick" &&
      t !== "daemon_task_done" &&
      t !== "daemon_task_error" &&
      t !== "daemon_backoff"
    )
      return;

    const entry: DaemonFeedEntry = {
      id: _feedId++,
      ts: Date.now(),
      type: t,
      mission: last.mission ? String(last.mission) : undefined,
      goal: last.goal ? String(last.goal) : undefined,
      status: last.status ? String(last.status) : undefined,
      error: last.error ? String(last.error) : undefined,
    };
    setFeed((prev) => [...prev.slice(-99), entry]);

    if (t === "daemon_start") setActive(true);
    if (t === "daemon_stop") setActive(false);
  }, [events]);

  // Auto-scroll feed to bottom.
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [feed]);

  const onToggle = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (active) {
        await stopDaemon();
        setActive(false);
      } else {
        await startDaemon();
        setActive(true);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Aktion fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }, [active]);

  const onPanicStop = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await stopDaemon();
      setActive(false);
      setFeed((prev) => [
        ...prev,
        { id: _feedId++, ts: Date.now(), type: "daemon_stop", status: "PANIC STOP" },
      ]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "PANIC STOP fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <section className="card autonomy-panel">
      <div className="autonomy-header">
        <h2 className="autonomy-title">Autonomer Daemon</h2>
        <span className={`status-pill status-${active ? "running" : "idle"}`}>
          {active ? "Aktiv" : "Inaktiv"}
        </span>
      </div>

      {missionRoot && (
        <p className="autonomy-root">Arbeitsordner: {missionRoot}</p>
      )}

      <div className="autonomy-controls">
        <button
          className={`btn ${active ? "btn-danger" : "btn-primary"} autonomy-toggle`}
          disabled={busy}
          onClick={onToggle}
        >
          {active ? "Daemon stoppen" : "Daemon starten"}
        </button>

        <button
          className="btn btn-panic"
          disabled={busy || !active}
          onClick={onPanicStop}
          title="Daemon sofort stoppen"
        >
          ⛔ PANIC STOP
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="autonomy-feed-container">
        <p className="autonomy-feed-label">Live-Feed</p>
        <ol className="autonomy-feed" ref={feedRef}>
          {feed.length === 0 ? (
            <li className="feed-empty">Noch keine Ereignisse.</li>
          ) : (
            feed.map((entry) => (
              <li key={entry.id} className={`feed-entry feed-${entry.type}`}>
                <span className="feed-time">{new Date(entry.ts).toLocaleTimeString()}</span>
                <span className="feed-type">{entry.type}</span>
                {entry.mission && <span className="feed-mission">{entry.mission}</span>}
                {entry.goal && <span className="feed-goal">{entry.goal}</span>}
                {entry.status && <span className="feed-status">{entry.status}</span>}
                {entry.error && <span className="feed-error">{entry.error}</span>}
              </li>
            ))
          )}
        </ol>
      </div>
    </section>
  );
}
