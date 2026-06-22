export function How() {
  return (
    <section id="how">
      <div className="wrap">
        <div className="sec-head reveal">
          <div className="sec-label">How it works</div>
          <h2>The git workflow you already know</h2>
          <p className="sec-sub">Snapshot, branch, experiment, checkout. For your data.</p>
        </div>
        <div className="term reveal" id="term">
          <div className="term-bar">
            <span className="lights">
              <i />
              <i />
              <i />
            </span>
            <span className="ttl">zsh — ~/app</span>
          </div>
          <div className="term-body" id="termbody">
            <span className="tline">
              <span className="dim"># capture the current state of every configured DB</span>
            </span>
            <span className="tline">
              <span className="p">$</span> bw snapshot <span className="dim">-m</span> &quot;before risky migration&quot;
            </span>
            <span className="tline">
              <span className="g">✓</span> snapshot <span className="hl">snap_be6833c9</span> · 2 engines · 1.2s
            </span>
            <span className="tline"> </span>
            <span className="tline">
              <span className="dim"># branch off and run something destructive</span>
            </span>
            <span className="tline">
              <span className="p">$</span> bw branch <span className="br">experiment</span> <span className="dim">&amp;&amp;</span> bw checkout <span className="br">experiment</span>
            </span>
            <span className="tline">
              <span className="g">✓</span> HEAD → <span className="br">experiment</span>
            </span>
            <span className="tline">
              <span className="p">$</span> psql -f scary-migration.sql
            </span>
            <span className="tline"> </span>
            <span className="tline">
              <span className="dim"># compare, then jump back to safety</span>
            </span>
            <span className="tline">
              <span className="p">$</span> bw diff main <span className="br">experiment</span>
            </span>
            <span className="tline">
              {"  "}public.users{"   "}<span className="g">+2 rows</span>{"   "}public.orders <span className="g">~ schema changed</span>
            </span>
            <span className="tline">
              <span className="p">$</span> bw checkout main
            </span>
            <span className="tline">
              <span className="g">✓</span> restored · every DB back to <span className="hl">snap_be6833c9</span>
              <span className="tcaret" />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
