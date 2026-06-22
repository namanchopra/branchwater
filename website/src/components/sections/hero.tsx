import { INSTALL_CMD } from "@/lib/constants";
import { CopyButton } from "@/components/common/copy-button";

export function Hero() {
  return (
    <section className="hero wrap">
      <span className="eyebrow reveal">
        <span className="dot" /> Engine-agnostic · Local-first
      </span>
      <h1 className="reveal">
        git for your <span className="hl">local databases</span>
      </h1>
      <p className="sub reveal">
        Snapshot every database on your machine as one logical branch. Experiment fearlessly, diff what
        changed, and roll back to any commit — the version-control workflow you already know, for the data
        you develop against.
      </p>
      <div className="hero-cta reveal">
        <span className="install">
          <span className="dollar">$</span> <span className="cmd">{INSTALL_CMD}</span>{" "}
          <CopyButton value={INSTALL_CMD} />
        </span>
        <a className="btn" href="#how">
          See how it works →
        </a>
      </div>

      <div className="stage reveal">
        <div className="mock" id="mock">
          <div className="mock-bar">
            <span className="lights">
              <i />
              <i />
              <i />
            </span>
            <span className="ttl">bw ui — 127.0.0.1</span>
          </div>
          <div className="mock-body">
            <div className="mock-side">
              <div className="glabel">Branches</div>
              <div className="brow head">
                <span className="d" /> main <span className="tag">HEAD</span>
              </div>
              <div className="brow">
                <span className="d" /> experiment
              </div>
              <div className="brow">
                <span className="d" /> seed-v2
              </div>
              <div className="glabel" style={{ marginTop: 12 }}>
                Engines
              </div>
              <div className="brow">
                <span className="d" style={{ background: "var(--accent)", borderColor: "var(--accent)" }} /> bw_demo
              </div>
            </div>
            <div className="mock-main">
              <div className="mock-tabs">
                <span>Snapshots</span>
                <span className="on">Tables</span>
                <span>SQL</span>
                <span>Diff</span>
              </div>
              <table className="mtable">
                <thead>
                  <tr>
                    <th>id</th>
                    <th>email</th>
                    <th>created_at</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="k">1</td>
                    <td>alice@example.com</td>
                    <td>2026-06-19 20:09</td>
                    <td className="mrowact">Delete</td>
                  </tr>
                  <tr>
                    <td className="k">2</td>
                    <td>bob@example.com</td>
                    <td>2026-06-19 20:09</td>
                    <td className="mrowact">Delete</td>
                  </tr>
                  <tr>
                    <td className="k">3</td>
                    <td>carol@example.com</td>
                    <td>2026-06-20 11:42</td>
                    <td className="mrowact">Delete</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="trust reveal">
        <div className="stat">
          <div className="n" data-count="100" data-suffix="%">
            0%
          </div>
          <div className="l">local-first — no network</div>
        </div>
        <div className="stat">
          <div className="n" data-count="1" data-suffix=" cmd">
            0
          </div>
          <div className="l">snapshots every DB at once</div>
        </div>
        <div className="stat">
          <div className="n">∞</div>
          <div className="l">branches &amp; rollbacks</div>
        </div>
        <div className="stat">
          <div className="n">MIT</div>
          <div className="l">open source</div>
        </div>
      </div>
    </section>
  );
}
