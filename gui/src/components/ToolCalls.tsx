import type { ToolCallEntry } from "../types";

interface Props {
  toolCalls: ToolCallEntry[];
}

function compactArgs(args: unknown): string {
  if (args === undefined || args === null) {
    return "";
  }
  const text = JSON.stringify(args);
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

/** Chronological list of tool calls (tool, compact args, ok/error, duration). */
export function ToolCalls({ toolCalls }: Props) {
  return (
    <section className="card tool-calls">
      <h2>Tool-Aufrufe</h2>
      {toolCalls.length === 0 ? (
        <p className="muted">Noch keine Tool-Aufrufe.</p>
      ) : (
        <ul className="tool-list">
          {toolCalls
            .slice()
            .reverse()
            .map((call) => (
              <li key={call.id} className="tool-item">
                <div className="tool-head">
                  <span className={`tool-status ${call.ok ? "ok" : "fail"}`}>
                    {call.ok ? "OK" : "ERR"}
                  </span>
                  <span className="tool-name">{call.tool}</span>
                  {call.durationMs !== undefined && (
                    <span className="tool-duration">{call.durationMs} ms</span>
                  )}
                </div>
                {compactArgs(call.args) && <code className="tool-args">{compactArgs(call.args)}</code>}
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
