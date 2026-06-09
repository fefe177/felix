import { useState } from "react";

import { ApiError, confirm as confirmApi } from "../api/client";
import type { PendingConfirmation } from "../types";

interface Props {
  pending: PendingConfirmation;
  onResolved: () => void;
}

/** Modal asking the user to approve or reject a pending safety confirmation. */
export function ConfirmDialog({ pending, onResolved }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await confirmApi(decision);
      onResolved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unbekannter Fehler");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <h3>Bestaetigung erforderlich</h3>
        <p className="modal-prompt">{pending.prompt}</p>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions">
          <button className="btn btn-danger" disabled={busy} onClick={() => decide(false)}>
            Ablehnen
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => decide(true)}>
            Bestaetigen
          </button>
        </div>
      </div>
    </div>
  );
}
