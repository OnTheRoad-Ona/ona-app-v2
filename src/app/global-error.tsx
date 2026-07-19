"use client";

/**
 * Root error boundary (layout-level). Must include html/body.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#0a0a0a",
          color: "#fff",
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          textAlign: "center",
        }}
      >
        <p
          style={{ fontSize: 22, fontWeight: 900, margin: 0 }}
          aria-label="Ona"
        >
          <span style={{ color: "#FF6B35" }}>O</span>
          <span style={{ color: "#C8C9CD" }}>na</span>
        </p>
        <p
          style={{
            marginTop: 12,
            maxWidth: 280,
            fontSize: 14,
            lineHeight: 1.45,
            color: "rgba(255,255,255,0.8)",
          }}
        >
          The app failed to start on this device. Tap retry or reopen the link
          in Safari or Chrome.
        </p>
        {error?.message ? (
          <p
            style={{
              marginTop: 8,
              maxWidth: 280,
              fontSize: 11,
              color: "rgba(255,255,255,0.4)",
              wordBreak: "break-word",
            }}
          >
            {String(error.message).slice(0, 160)}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => reset()}
          style={{
            marginTop: 20,
            height: 44,
            padding: "0 24px",
            border: 0,
            borderRadius: 8,
            background: "#2c2c2e",
            color: "#fff",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
