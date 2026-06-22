export function Compare() {
  return (
    <section id="compare">
      <div className="wrap">
        <div className="sec-head reveal">
          <div className="sec-label">Why Branchwater</div>
          <h2>Stop hand-rolling pg_dump scripts</h2>
        </div>
        <div className="compare">
          <div className="card reveal">
            <h3>
              <span className="tag them">The old way</span> Manual dumps
            </h3>
            <ul>
              <li>
                One <span className="mono">pg_dump</span> per database, by hand
              </li>
              <li>
                Timestamped <span className="mono">.sql</span> files you have to name and track
              </li>
              <li>No notion of a branch across multiple DBs</li>
              <li>Restore is a manual, error-prone ritual</li>
              <li>No diff, no UI, no undo</li>
            </ul>
          </div>
          <div className="card reveal" style={{ borderColor: "var(--accent-dim)" }}>
            <h3>
              <span className="tag us">Branchwater</span> One workflow
            </h3>
            <ul>
              <li>
                One command snapshots <em>all</em> your DBs together
              </li>
              <li>Immutable commits + movable branches + HEAD</li>
              <li>
                <span className="mono">checkout</span> restores every engine atomically
              </li>
              <li>Cross-branch diff, web table editor, 1-click undo</li>
              <li>100% local, engine-agnostic, MIT-licensed</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
