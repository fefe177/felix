import { getBaseUrl } from "../api/client";

interface Props {
  screenshot: string | null;
}

/** Shows the most recent screenshot, fetched from /api/screenshots/{name}. */
export function ScreenshotPreview({ screenshot }: Props) {
  return (
    <section className="card screenshot-preview">
      <h2>Screenshot</h2>
      {screenshot ? (
        <img
          className="screenshot-img"
          src={`${getBaseUrl()}/api/screenshots/${encodeURIComponent(screenshot)}`}
          alt={`Screenshot ${screenshot}`}
        />
      ) : (
        <p className="muted">Noch kein Screenshot.</p>
      )}
    </section>
  );
}
