import { GITHUB_URL, INSTALL_CMD } from "@/lib/constants";
import { CopyButton } from "@/components/common/copy-button";

export function Cta() {
  return (
    <section>
      <div className="wrap">
        <div className="cta reveal">
          <div className="sec-label">Open source</div>
          <h2>Bring git to your local databases</h2>
          <p className="sec-sub">Free and MIT-licensed. Install from npm or star it on GitHub.</p>
          <div className="hero-cta">
            <a className="btn accent" data-magnetic href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              ★ Star on GitHub
            </a>
            <span className="install">
              <span className="dollar">$</span> <span className="cmd">{INSTALL_CMD}</span>{" "}
              <CopyButton value={INSTALL_CMD} />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
