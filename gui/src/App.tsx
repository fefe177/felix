import { useState } from "react";

import { useEventStream } from "./api/client";
import { AutonomyPanel } from "./components/AutonomyPanel";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { LiveLogs } from "./components/LiveLogs";
import { MemoryView } from "./components/MemoryView";
import { PlanView } from "./components/PlanView";
import { ScreenshotPreview } from "./components/ScreenshotPreview";
import { TaskPanel } from "./components/TaskPanel";
import { ToolCalls } from "./components/ToolCalls";

type View = "dashboard" | "autonomy" | "memory";

/** Root dashboard: a sidebar plus the dashboard, autonomy or memory view. */
export function App() {
  const stream = useEventStream();
  const [view, setView] = useState<View>("dashboard");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-dot" />
          LocalPilot
        </div>
        <nav className="nav">
          <button
            className={`nav-item ${view === "dashboard" ? "active" : ""}`}
            onClick={() => setView("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={`nav-item ${view === "autonomy" ? "active" : ""}`}
            onClick={() => setView("autonomy")}
          >
            Autonomy
          </button>
          <button
            className={`nav-item ${view === "memory" ? "active" : ""}`}
            onClick={() => setView("memory")}
          >
            Memory
          </button>
        </nav>
        <div className="sidebar-footer">
          <span className={`conn-dot conn-${stream.connection}`} />
          {stream.connection === "open" ? "Verbunden" : "Getrennt"}
        </div>
      </aside>

      <main className="main">
        <ConnectionBanner status={stream.connection} />

        {view === "dashboard" ? (
          <>
            <TaskPanel
              run={stream.run}
              pendingConfirmation={stream.pendingConfirmation}
              onConfirmationResolved={stream.resetConfirmation}
            />
            <div className="grid">
              <PlanView plan={stream.plan} completedSteps={stream.completedSteps} />
              <ToolCalls toolCalls={stream.toolCalls} />
              <LiveLogs logs={stream.logs} />
              <ScreenshotPreview screenshot={stream.screenshot} />
            </div>
          </>
        ) : view === "autonomy" ? (
          <AutonomyPanel events={stream.events} />
        ) : (
          <MemoryView />
        )}
      </main>
    </div>
  );
}
