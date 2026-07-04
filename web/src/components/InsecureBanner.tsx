// Shown when the site is loaded over plain HTTP. Camera + GPS are disabled by the browser
// in a non-secure context, so we explain it rather than letting features silently fail.
export function InsecureBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="insecure">
      <span className="insecure__icon">🔒</span>
      <div className="insecure__text">
        <strong>Open over HTTPS for camera &amp; GPS.</strong> This page is on plain HTTP, so the
        browser blocks the live guide and precise location. The map still works.
      </div>
      <button className="insecure__x" onClick={onDismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  )
}
