import type { ConnectionStatus } from "../api/useEventStream";

interface Props {
  status: ConnectionStatus;
}

/** A small banner shown while the event stream is not connected. */
export function ConnectionBanner({ status }: Props) {
  if (status === "open") {
    return null;
  }
  const message =
    status === "connecting"
      ? "Verbinde mit dem Backend ..."
      : "Backend nicht erreichbar - es wird erneut verbunden. Laeuft 'localpilot serve'?";
  return (
    <div className={`banner banner-${status}`} role="status">
      {message}
    </div>
  );
}
