export function Features() {
  return (
    <section id="features">
      <div className="wrap">
        <div className="sec-head reveal">
          <div className="sec-label">Features</div>
          <h2>Your databases, under version control</h2>
          <p className="sec-sub">
            Everything is local, fast, and engine-agnostic — a tiny adapter teaches Branchwater a new
            database; the core never changes.
          </p>
        </div>
        <div className="features">
          <div className="card tilt reveal">
            <div className="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.3l1-1.6a1 1 0 0 1 .85-.4h4.7a1 1 0 0 1 .85.4l1 1.6h1.3A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
                <circle cx="12" cy="12.5" r="3.2" />
              </svg>
            </div>
            <h3>Snapshot everything</h3>
            <p>
              One <span className="mono">bw snapshot</span> captures every configured database as a single,
              immutable commit — content-addressed and instant to restore.
            </p>
          </div>
          <div className="card tilt reveal">
            <div className="ico br">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="6" r="2.4" />
                <circle cx="6" cy="18" r="2.4" />
                <circle cx="18" cy="8" r="2.4" />
                <path d="M6 8.4v7.2" />
                <path d="M18 10.4c0 4-4 4-6 5.2" />
              </svg>
            </div>
            <h3>Branch &amp; checkout</h3>
            <p>
              Branches and HEAD work exactly like git. Spin up <span className="mono">experiment</span>, break
              things, then <span className="mono">checkout main</span> to snap back.
            </p>
          </div>
          <div className="card tilt reveal">
            <div className="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 5 4 10l5 5" />
                <path d="M4 10h9a5 5 0 0 1 5 5" />
                <path d="m15 19 5-5-5-5" />
              </svg>
            </div>
            <h3>Cross-branch diff</h3>
            <p>
              See what changed between any two branches — added/removed tables, row-count deltas, and the
              actual added &amp; removed rows.
            </p>
          </div>
          <div className="card tilt reveal">
            <div className="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19h5l9.5-9.5a2.1 2.1 0 0 0-3-3L6 16z" />
                <path d="M13 6.5l3.5 3.5" />
              </svg>
            </div>
            <h3>Table editor + SQL console</h3>
            <p>
              A local web UI to browse and edit rows, truncate/drop tables, run ad-hoc SQL, and export to
              CSV/JSON.
            </p>
          </div>
          <div className="card tilt reveal">
            <div className="ico br">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8v5h5" />
                <path d="M4 13a8 8 0 1 1 2 5.3" />
              </svg>
            </div>
            <h3>Auto-snapshot + 1-click undo</h3>
            <p>
              Every write takes a snapshot first. Made a mistake? Undo restores the exact prior state — no
              manual dumps.
            </p>
          </div>
          <div className="card tilt reveal">
            <div className="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3 3 8l9 5 9-5z" />
                <path d="M3 13l9 5 9-5" />
                <path d="M3 18l9 5 9-5" opacity=".55" />
              </svg>
            </div>
            <h3>Engine-agnostic</h3>
            <p>
              Ships with Postgres today. The adapter interface means ZFS, btrfs, MySQL, or anything else drops
              in with zero core changes.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
