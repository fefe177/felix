import { useCallback, useEffect, useState } from "react";

import {
  ApiError,
  getPreferences,
  getStrategies,
  getTask,
  getTasks,
  setPreference,
} from "../api/client";
import type { StrategyRecord, TaskBundle, TaskRecord } from "../types";

type Tab = "tasks" | "journal" | "preferences" | "strategies";

const TABS: { id: Tab; label: string }[] = [
  { id: "tasks", label: "Tasks" },
  { id: "journal", label: "Gelerntes" },
  { id: "preferences", label: "Praeferenzen" },
  { id: "strategies", label: "Strategien" },
];

/** A parsed `journal:<timestamp>` preference entry. */
interface JournalEntry {
  key: string;
  ts: string;
  goal: string;
  status: string;
  lesson: string;
  hint: string | null;
}

/** Parse the `[ts] goal | status | lesson | hint: ...` format written by reflect(). */
function parseJournalEntry(key: string, value: string): JournalEntry {
  const tsMatch = /^\[([^\]]+)]\s*/.exec(value);
  const ts = tsMatch ? tsMatch[1] : key.replace("journal:", "");
  const rest = tsMatch ? value.slice(tsMatch[0].length) : value;
  const parts = rest.split(" | ");
  const hintPart = parts.find((p) => p.startsWith("hint: "));
  return {
    key,
    ts,
    goal: parts[0] ?? "",
    status: parts[1] ?? "",
    lesson: (hintPart ? parts.slice(2, -1) : parts.slice(2)).join(" | "),
    hint: hintPart ? hintPart.slice("hint: ".length) : null,
  };
}

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : "Unbekannter Fehler";
}

/** Tabbed view over recent tasks (with step drilldown), preferences and strategies. */
export function MemoryView() {
  const [tab, setTab] = useState<Tab>("tasks");

  return (
    <section className="card memory-view">
      <div className="tab-bar">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            className={`tab ${tab === entry.id ? "active" : ""}`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {tab === "tasks" && <TasksTab />}
      {tab === "journal" && <JournalTab />}
      {tab === "preferences" && <PreferencesTab />}
      {tab === "strategies" && <StrategiesTab />}
    </section>
  );
}

function TasksTab() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [selected, setSelected] = useState<TaskBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTasks(await getTasks(50));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openTask = async (id: string) => {
    setError(null);
    try {
      setSelected(await getTask(id));
    } catch (err) {
      setError(messageOf(err));
    }
  };

  if (selected) {
    return (
      <div className="task-detail">
        <button className="btn btn-ghost" onClick={() => setSelected(null)}>
          ← Zurueck
        </button>
        <h3>{selected.task.goal}</h3>
        <p className="muted">
          Status: {selected.task.status} · Modus: {selected.task.safety_mode}
        </p>
        {selected.task.result && <p className="info-text">Ergebnis: {selected.task.result}</p>}
        {selected.task.error && <p className="error-text">Fehler: {selected.task.error}</p>}
        <ol className="step-list">
          {selected.steps.map((step) => (
            <li key={step.id} className={`step-item ${step.ok === false ? "fail" : ""}`}>
              <span className="step-idx">{step.idx}</span>
              <span className="step-tool">{step.tool ?? "—"}</span>
              <code className="step-args">{JSON.stringify(step.arguments)}</code>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div>
      <div className="row-between">
        <h3>Letzte Tasks</h3>
        <button className="btn btn-ghost" onClick={() => void load()}>
          Aktualisieren
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      {loading ? (
        <p className="muted">Lade …</p>
      ) : tasks.length === 0 ? (
        <p className="muted">Keine Tasks.</p>
      ) : (
        <ul className="record-list">
          {tasks.map((task) => (
            <li key={task.id}>
              <button className="record-row" onClick={() => void openTask(task.id)}>
                <span className={`status-pill status-${task.status}`}>{task.status}</span>
                <span className="record-goal">{task.goal}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What the autonomous daemon has learned: journal entries, newest first. */
function JournalTab() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const prefs = await getPreferences();
      const parsed = Object.entries(prefs)
        .filter(([key]) => key.startsWith("journal:"))
        .map(([key, value]) => parseJournalEntry(key, value))
        .sort((a, b) => b.key.localeCompare(a.key));
      setEntries(parsed);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="row-between">
        <h3>Was der Daemon gelernt hat</h3>
        <button className="btn btn-ghost" onClick={() => void load()}>
          Aktualisieren
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      {loading ? (
        <p className="muted">Lade …</p>
      ) : entries.length === 0 ? (
        <p className="muted">
          Noch keine Lektionen. Starte den autonomen Daemon im Autonomy-Tab.
        </p>
      ) : (
        <ul className="journal-list">
          {entries.map((entry) => (
            <li key={entry.key} className="journal-entry">
              <div className="journal-head">
                <span className={`status-pill status-${entry.status}`}>{entry.status}</span>
                <span className="journal-ts">{new Date(entry.ts).toLocaleString()}</span>
              </div>
              <p className="journal-goal">{entry.goal}</p>
              {entry.lesson && <p className="journal-lesson">Lektion: {entry.lesson}</p>}
              {entry.hint && <p className="journal-hint">Tipp fuer naechstes Mal: {entry.hint}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PreferencesTab() {
  const [prefs, setPrefs] = useState<Record<string, string>>({});
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const all = await getPreferences();
      const withoutJournal = Object.fromEntries(
        Object.entries(all).filter(([k]) => !k.startsWith("journal:")),
      );
      setPrefs(withoutJournal);
    } catch (err) {
      setError(messageOf(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!key.trim()) {
      return;
    }
    setError(null);
    try {
      await setPreference(key.trim(), value);
      setKey("");
      setValue("");
      await load();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <div>
      <h3>Praeferenzen</h3>
      {error && <p className="error-text">{error}</p>}
      <ul className="record-list">
        {Object.entries(prefs).map(([prefKey, prefValue]) => (
          <li key={prefKey} className="pref-row">
            <span className="pref-key">{prefKey}</span>
            <span className="pref-value">{prefValue}</span>
          </li>
        ))}
        {Object.keys(prefs).length === 0 && <li className="muted">Keine Praeferenzen.</li>}
      </ul>
      <div className="pref-form">
        <input
          className="text-input"
          placeholder="Schluessel"
          value={key}
          onChange={(event) => setKey(event.target.value)}
        />
        <input
          className="text-input"
          placeholder="Wert"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button className="btn btn-primary" onClick={() => void save()}>
          Setzen
        </button>
      </div>
    </div>
  );
}

function StrategiesTab() {
  const [strategies, setStrategies] = useState<StrategyRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setStrategies(await getStrategies());
      } catch (err) {
        setError(messageOf(err));
      }
    })();
  }, []);

  return (
    <div>
      <h3>Strategien</h3>
      {error && <p className="error-text">{error}</p>}
      {strategies.length === 0 ? (
        <p className="muted">Keine Strategien.</p>
      ) : (
        <table className="strategy-table">
          <thead>
            <tr>
              <th>Muster</th>
              <th>Erfolg</th>
              <th>Fehler</th>
              <th>Rate</th>
            </tr>
          </thead>
          <tbody>
            {strategies.map((strategy) => (
              <tr key={strategy.id}>
                <td>{strategy.pattern}</td>
                <td>{strategy.success_count}</td>
                <td>{strategy.fail_count}</td>
                <td>{(strategy.success_rate * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
