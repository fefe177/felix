import type { PlanStep } from "../types";

interface Props {
  plan: PlanStep[];
  completedSteps: number;
}

/** Shows the current plan with completed / open steps. */
export function PlanView({ plan, completedSteps }: Props) {
  return (
    <section className="card plan-view">
      <h2>Plan</h2>
      {plan.length === 0 ? (
        <p className="muted">Noch kein Plan.</p>
      ) : (
        <ol className="plan-list">
          {plan.map((step) => {
            const done = step.done || step.idx < completedSteps;
            return (
              <li key={step.idx} className={`plan-step ${done ? "done" : ""}`}>
                <span className="plan-marker">{done ? "✓" : step.idx + 1}</span>
                <span className="plan-text">{step.description}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
