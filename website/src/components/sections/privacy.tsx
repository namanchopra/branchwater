export function Privacy() {
  return (
    <section id="privacy">
      <div className="wrap">
        <div className="sec-head reveal">
          <div className="sec-label">Safe by design</div>
          <h2>Local-first, write-safe, yours</h2>
        </div>
        <div className="compare priv" style={{ maxWidth: 820 }}>
          <div className="card reveal">
            <div className="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4.5" y="10" width="15" height="10" rx="2.3" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
            </div>
            <div>
              <h3>100% local</h3>
              <p>
                Runs entirely on your machine. The web UI binds <span className="mono">127.0.0.1</span> only
                and rejects non-loopback hosts. No network calls, ever.
              </p>
            </div>
          </div>
          <div className="card reveal">
            <div className="ico br">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l7 3v5c0 4.6-3 8.2-7 10-4-1.8-7-5.4-7-10V6z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <div>
              <h3>Every write is reversible</h3>
              <p>
                Edits, truncates, drops and SQL all auto-snapshot first and are confirm- &amp; token-gated.
                One click undoes any of them.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
