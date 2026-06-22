import { CopyButton } from "@/components/common/copy-button";

const STEPS = [
  { n: "1", title: "Install the CLI", cmd: "npm i -g branchwater" },
  { n: "2", title: "Point it at your databases", cmd: "bw init" },
  { n: "3", title: "Snapshot, branch, or open the UI", cmd: 'bw snapshot -m "baseline" && bw ui' },
];

export function Install() {
  return (
    <section id="install">
      <div className="wrap">
        <div className="sec-head reveal">
          <div className="sec-label">Get started</div>
          <h2>Up and running in three commands</h2>
        </div>
        <div className="steps">
          {STEPS.map((s) => (
            <div className="step reveal" key={s.n}>
              <div className="num">{s.n}</div>
              <div className="body">
                <h4>{s.title}</h4>
                <div className="codeline">
                  <span className="dollar">$</span>
                  <span className="cmd">{s.cmd}</span>
                  <CopyButton value={s.cmd} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
