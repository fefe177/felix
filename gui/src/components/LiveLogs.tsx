import { useEffect, useRef } from "react";

import type { LogLine } from "../types";

interface Props {
  logs: LogLine[];
}

/** Live, auto-scrolling view of log lines from the event stream. */
export function LiveLogs({ logs }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [logs]);

  return (
    <section className="card live-logs">
      <h2>Live-Logs</h2>
      <div className="log-scroll">
        {logs.length === 0 ? (
          <p className="muted">Noch keine Logzeilen.</p>
        ) : (
          logs.map((line) => (
            <div key={line.id} className={`log-line level-${line.level.toLowerCase()}`}>
              <span className="log-level">{line.level}</span>
              <span className="log-message">{line.message}</span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </section>
  );
}
