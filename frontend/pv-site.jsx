/* global React, ReactDOM, PV */
const { useState, useEffect, useRef } = React;
const { MatchMark, MatchTile, Lineage, Wordmark, NavLogo, useCountUp, Reveal } = PV;

const HERO_IMG = "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=2400&auto=format&fit=crop";
const REPO = "https://github.com/IamHarrie-Labs/provenance-vara";
const PROG = "0xb165fca0d82ebd1f01bd64482c762f50d06a0ebc22002707f9ea505a19cc3663";
const X_URL = "https://x.com/Prov_Escrow";

/* ============================== NAV ============================== */
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav className={"nav" + (scrolled ? " scrolled" : "")}>
      <div className="wrap nav-inner">
        <a href="#top"><NavLogo /></a>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#verify">Verification</a>
          <a href="#sdk">SDK</a>
          <a href="#stats">Stats</a>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a className="btn btn-ghost" href={X_URL} target="_blank" rel="noreferrer" style={{ padding: "11px 18px", fontSize: 14 }}>
            <XGlyph /> @Prov_Escrow
          </a>
          <a className="btn btn-ghost" href={REPO} target="_blank" rel="noreferrer" style={{ padding: "11px 18px", fontSize: 14 }}>
            <GitHubGlyph /> GitHub
          </a>
        </div>
      </div>
    </nav>
  );
}

function GitHubGlyph({ c = "currentColor", s = 16 }) {
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" fill={c} aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/>
    </svg>
  );
}

function XGlyph({ c = "currentColor", s = 15 }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={c} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
    </svg>
  );
}

/* ============================== HERO ============================== */
function Hero() {
  return (
    <header className="hero" id="top">
      <div className="hero-img" style={{ backgroundImage: "url(" + HERO_IMG + ")" }}></div>
      <div className="hero-tint"></div>
      <div className="hero-grain"></div>
      <div className="wrap" style={{ position: "relative", paddingTop: 90, paddingBottom: 40 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 40 }}>
          <div style={{ maxWidth: 720 }}>
            <Reveal>
              <div className="eyebrow" style={{ marginBottom: 26 }}>Vara Network · Settlement Layer</div>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="display" style={{ fontSize: "clamp(40px, 6.4vw, 82px)" }}>
                Trustless settlement<br />for autonomous agents.
              </h1>
            </Reveal>
            <Reveal delay={170}>
              <p style={{ fontSize: "clamp(17px,1.5vw,21px)", lineHeight: 1.55, color: "rgba(245,244,240,0.74)", maxWidth: 580, margin: "28px 0 0" }}>
                When one agent pays another to do work, who decides it was actually done? Provenance removes the human. The blockchain is the judge — settlement is a byte comparison, not a person's opinion.
              </p>
            </Reveal>
            <Reveal delay={250}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 38 }}>
                <a className="btn btn-primary" href="#how">Read how it works →</a>
                <a className="btn btn-ghost" href={REPO} target="_blank" rel="noreferrer"><GitHubGlyph /> GitHub</a>
                <a className="btn btn-ghost" href={X_URL} target="_blank" rel="noreferrer"><XGlyph /> @Prov_Escrow</a>
              </div>
            </Reveal>
            <Reveal delay={330}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 44, flexWrap: "wrap" }}>
                <span className="chip"><span style={{ width: 7, height: 7, borderRadius: 99, background: "var(--accent)", boxShadow: "0 0 10px var(--accent)" }}></span> Live on Vara mainnet</span>
                <span className="mono hide-sm" style={{ fontSize: 12.5, color: "rgba(245,244,240,0.4)" }}>{PROG.slice(0, 18)}…{PROG.slice(-6)}</span>
              </div>
            </Reveal>
          </div>
          <Reveal delay={300} className="hide-sm">
            <ProofCard />
          </Reveal>
        </div>
      </div>
    </header>
  );
}

function ProofCard() {
  return (
    <div className="glass" style={{ width: 360, padding: 26 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <span className="mono" style={{ fontSize: 12, color: "var(--muted)", letterSpacing: "0.12em" }}>SETTLE()</span>
        <Lineage scale={0.9} />
      </div>
      <ByteRow label="expected_reply" val="0x7f3a…c901" />
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0", paddingLeft: 2 }}>
        <MatchMark size={30} />
        <span style={{ fontWeight: 700, fontSize: 17, color: "var(--accent)" }}>matches</span>
      </div>
      <ByteRow label="on_chain_reply" val="0x7f3a…c901" />
      <div style={{ borderTop: "1px solid var(--hairline)", marginTop: 22, paddingTop: 18, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="mono" style={{ fontSize: 12.5, color: "var(--muted)" }}>5.0 VARA released</span>
        <span style={{ background: "var(--accent)", color: "var(--ink)", fontWeight: 700, fontSize: 13, padding: "6px 14px", borderRadius: 999 }}>→ Settled</span>
      </div>
    </div>
  );
}

function ByteRow({ label, val }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
      <span className="mono" style={{ fontSize: 12.5, color: "var(--muted)" }}>{label}</span>
      <span className="mono" style={{ fontSize: 15, fontWeight: 700, color: "var(--paper)", letterSpacing: "0.03em" }}>{val}</span>
    </div>
  );
}

/* ========================= PROBLEM STRIP ========================= */
function Problem() {
  return (
    <section className="sec-paper sec-pad">
      <div className="wrap">
        <Reveal>
          <div className="sec-label" style={{ marginBottom: 30 }}>The problem</div>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="display" style={{ fontSize: "clamp(34px,4.6vw,60px)", maxWidth: 980 }}>
            Trust doesn't scale.<br /><span style={{ color: "var(--accent-deep)" }}>Verification does.</span>
          </h2>
        </Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 40, marginTop: 64 }}>
          {[
            ["Payment ≠ fulfillment", "On the agent network, agents get paid for services — but who confirms the work was done? Today, a human approves it."],
            ["Humans don't autoscale", "Manual approval can't keep up with autonomous agents transacting without supervision. The bottleneck is the reviewer."],
            ["Proof, not opinion", "Provenance replaces subjective approval with deterministic on-chain verification. No administrator. No multisig. No human in the loop."],
          ].map((c, i) => (
            <Reveal key={i} delay={i * 90}>
              <div style={{ borderTop: "2px solid var(--ink)", paddingTop: 22 }}>
                <h3 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>{c[0]}</h3>
                <p style={{ fontSize: 16, lineHeight: 1.6, color: "#4a4842", marginTop: 12 }}>{c[1]}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ========================= HOW IT WORKS ========================= */
const STEPS = [
  ["Create", "A depositor defines a settlement: a worker, an amount in VARA, a deadline, and a verification spec describing exactly what on-chain state proves the work is done."],
  ["Deposit", "The depositor funds the settlement by attaching the VARA amount. The funds are now locked in the contract — neither party can touch them."],
  ["Claim", "Once the work is complete, the worker calls ClaimCompletion. This signals the settlement is ready to be verified by anyone."],
  ["Settle", "Anyone calls Settle. The contract queries the target program, reads the reply bytes, and compares them to the spec. Match → worker paid. Deadline passed & no match → depositor refunded."],
];

function HowItWorks() {
  const [active, setActive] = useState(3);
  useEffect(() => {
    const id = setInterval(() => setActive((a) => (a + 1) % STEPS.length), 2600);
    return () => clearInterval(id);
  }, []);
  return (
    <section className="sec-pad" id="how">
      <div className="wrap">
        <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 70, alignItems: "start" }}>
          <div style={{ position: "sticky", top: 120 }}>
            <Reveal><div className="sec-label" style={{ marginBottom: 26 }}>How it works</div></Reveal>
            <Reveal delay={70}>
              <h2 className="display" style={{ fontSize: "clamp(32px,4vw,52px)" }}>Four steps,<br />zero referees.</h2>
            </Reveal>
            <Reveal delay={140}>
              <p style={{ fontSize: 17, lineHeight: 1.6, color: "rgba(245,244,240,0.66)", marginTop: 24, maxWidth: 420 }}>
                A settlement moves through a deterministic lifecycle. The final outcome — Settled, Refunded, or StillPending — is decided entirely by on-chain state.
              </p>
            </Reveal>
            <Reveal delay={210}>
              <div style={{ display: "flex", gap: 10, marginTop: 36, flexWrap: "wrap" }}>
                <span className="chip" style={{ color: "var(--accent)", borderColor: "rgba(120,220,170,0.3)" }}>Settled</span>
                <span className="chip">Refunded</span>
                <span className="chip">StillPending</span>
              </div>
            </Reveal>
          </div>
          <div>
            {STEPS.map((s, i) => (
              <Reveal key={i} delay={i * 60}>
                <div
                  className={"step" + (active === i ? " active" : "")}
                  onMouseEnter={() => setActive(i)}
                  style={{ borderColor: active === i ? "rgba(120,220,170,0.4)" : "var(--hairline)" }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
                    <span className="step-no">{String(i + 1).padStart(2, "0")}</span>
                    <div style={{ flex: 1 }}>
                      <h3 className="step-title" style={{ fontSize: 30, color: active === i && i === 3 ? "var(--accent)" : "var(--paper)" }}>{s[0]}</h3>
                      <div style={{
                        maxHeight: active === i ? 140 : 0, opacity: active === i ? 1 : 0,
                        overflow: "hidden", transition: "max-height .4s ease, opacity .4s ease, margin .4s ease",
                        marginTop: active === i ? 12 : 0,
                      }}>
                        <p style={{ fontSize: 16, lineHeight: 1.6, color: "rgba(245,244,240,0.66)", margin: 0, maxWidth: 540 }}>{s[1]}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
            <div style={{ borderTop: "1px solid var(--hairline)" }}></div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ====================== VERIFICATION MECHANISM ====================== */
function Verify() {
  const specs = [
    ["target_program", "The hex address of any Sails program on Vara.", PROG.slice(0, 24) + "…"],
    ["payload_bytes", "The encoded query: a 16-byte route prefix + SCALE-encoded args.", "0x9f2c… + SCALE(args)"],
    ["expected_reply", "The exact bytes that program must return for the work to count as done.", "0x7f3a…c901"],
  ];
  return (
    <section className="sec-paper sec-pad" id="verify">
      <div className="wrap">
        <div style={{ maxWidth: 760 }}>
          <Reveal><div className="sec-label" style={{ marginBottom: 26 }}>The verification mechanism</div></Reveal>
          <Reveal delay={70}>
            <h2 className="display" style={{ fontSize: "clamp(32px,4.4vw,56px)" }}>
              The proof is a<br /><span style={{ color: "var(--accent-deep)" }}>byte comparison.</span>
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <p style={{ fontSize: 18, lineHeight: 1.6, color: "#4a4842", marginTop: 24 }}>
              At the core is the <span className="mono" style={{ fontSize: 16 }}>SailsCallSpec</span>. It can verify any queryable state on any Sails program on Vara — not a fixed set of integrations. If a program exposes a readable method, it can be a proof target.
            </p>
          </Reveal>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 20, marginTop: 60 }}>
          {specs.map((s, i) => (
            <Reveal key={i} delay={i * 90}>
              <div className="int-card" style={{ height: "100%" }}>
                <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-deep)" }}>{s[0]}</div>
                <p style={{ fontSize: 15.5, lineHeight: 1.55, color: "#4a4842", margin: "12px 0 18px" }}>{s[1]}</p>
                <div className="mono" style={{ fontSize: 13, color: "#86847c", background: "var(--paper-2)", padding: "10px 12px", borderRadius: 8, wordBreak: "break-all" }}>{s[2]}</div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <div style={{ marginTop: 32, background: "var(--ink)", borderRadius: 20, padding: "clamp(28px,4vw,52px)", color: "var(--paper)" }}>
            <div className="mono" style={{ fontSize: 12, letterSpacing: "0.18em", color: "var(--muted)", marginBottom: 28 }}>ON SETTLE()</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "clamp(16px,3vw,40px)", alignItems: "center" }}>
              <div>
                <div className="mono" style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>expected_reply</div>
                <div className="mono" style={{ fontSize: "clamp(18px,2.4vw,26px)", fontWeight: 700, letterSpacing: "0.03em" }}>0x7f3a…c901</div>
              </div>
              <div style={{ display: "grid", placeItems: "center", gap: 8 }}>
                <MatchMark size={48} />
                <span className="mono" style={{ fontSize: 12, color: "var(--accent)" }}>==</span>
              </div>
              <div>
                <div className="mono" style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>on_chain_reply</div>
                <div className="mono" style={{ fontSize: "clamp(18px,2.4vw,26px)", fontWeight: 700, letterSpacing: "0.03em" }}>0x7f3a…c901</div>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginTop: 36, paddingTop: 28, borderTop: "1px solid var(--hairline)" }}>
              <span style={{ background: "var(--accent)", color: "var(--ink)", fontWeight: 700, fontSize: 15, padding: "9px 18px", borderRadius: 999 }}>→ Settled</span>
              <span style={{ color: "rgba(245,244,240,0.6)", fontSize: 15 }}>Worker receives the VARA instantly. No deadline? No match? <span style={{ color: "var(--paper)" }}>StillPending — anyone can retry.</span></span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ============================== SDK ============================== */
function SDK() {
  return (
    <section className="sec-pad" id="sdk">
      <div className="wrap">
        <div style={{ display: "grid", gridTemplateColumns: "0.85fr 1.15fr", gap: 56, alignItems: "center" }}>
          <div>
            <Reveal><div className="sec-label" style={{ marginBottom: 26 }}>TypeScript SDK</div></Reveal>
            <Reveal delay={70}>
              <h2 className="display" style={{ fontSize: "clamp(32px,4vw,50px)" }}>Integrate in<br />a few lines.</h2>
            </Reveal>
            <Reveal delay={140}>
              <p style={{ fontSize: 17, lineHeight: 1.6, color: "rgba(245,244,240,0.66)", marginTop: 24, maxWidth: 420 }}>
                The <span className="mono" style={{ fontSize: 15 }}>ProvenanceSpec</span> helper builds the correct call spec automatically — no knowledge of the underlying SCALE encoding required.
              </p>
            </Reveal>
            <Reveal delay={210}>
              <p style={{ fontSize: 15.5, lineHeight: 1.6, color: "rgba(245,244,240,0.5)", marginTop: 20, maxWidth: 420 }}>
                For custom verifiers, <span className="mono" style={{ fontSize: 14 }}>fromDryRun</span> accepts raw encoded payloads straight from <span className="mono" style={{ fontSize: 14 }}>vara-wallet --dry-run</span>.
              </p>
            </Reveal>
          </div>
          <Reveal delay={120}>
            <CodeBlock />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function CodeBlock() {
  return (
    <div className="code" style={{ padding: "24px 26px" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <span style={{ width: 11, height: 11, borderRadius: 99, background: "#2a2f33" }}></span>
        <span style={{ width: 11, height: 11, borderRadius: 99, background: "#2a2f33" }}></span>
        <span style={{ width: 11, height: 11, borderRadius: 99, background: "#2a2f33" }}></span>
        <span className="mono" style={{ marginLeft: "auto", fontSize: 11.5, color: "#5d6b63" }}>settle.ts</span>
      </div>
<pre style={{ margin: 0, whiteSpace: "pre" }}>
<span className="c-key">import</span> <span className="c-mut">{"{"}</span> Provenance, ProvenanceSpec, VARA <span className="c-mut">{"}"}</span> <span className="c-key">from</span> <span className="c-str">"@provenance/vara-sdk"</span><span className="c-mut">;</span>{"\n\n"}
<span className="c-key">const</span> provenance <span className="c-mut">=</span> <span className="c-key">await</span> <span className="c-fn">Provenance</span>(account)<span className="c-mut">;</span>{"\n\n"}
<span className="c-key">const</span> settlement <span className="c-mut">=</span> <span className="c-key">await</span> provenance.<span className="c-fn">create</span>(<span className="c-mut">{"{"}</span>{"\n"}
{"  "}worker<span className="c-mut">:</span> workerAgentId,{"\n"}
{"  "}amount<span className="c-mut">:</span> <span className="c-num">5n</span> <span className="c-mut">*</span> VARA,{"\n"}
{"  "}proof<span className="c-mut">:</span> ProvenanceSpec.<span className="c-fn">getNextId</span>(PROGRAM_ID, <span className="c-num">42n</span>),{"\n"}
<span className="c-mut">{"}"}</span>)<span className="c-mut">;</span>{"\n\n"}
<span className="c-key">await</span> settlement.<span className="c-fn">deposit</span>()<span className="c-mut">;</span>{"\n"}
<span className="c-com">// worker does the work, then claimCompletion()</span>{"\n"}
<span className="c-key">const</span> outcome <span className="c-mut">=</span> <span className="c-key">await</span> settlement.<span className="c-fn">settle</span>()<span className="c-mut">;</span>{"\n"}
<span className="c-com">// "Settled" | "Refunded" | "StillPending"</span>
</pre>
    </div>
  );
}

/* ============================== STATS ============================== */
function StatNum({ target, suffix, label }) {
  const [ref, val] = useCountUp(target);
  return (
    <div ref={ref}>
      <div className="display" style={{ fontSize: "clamp(46px,7vw,86px)" }}>{val}<span style={{ color: "var(--accent)" }}>{suffix}</span></div>
      <div className="mono" style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 10, letterSpacing: "0.04em" }}>{label}</div>
    </div>
  );
}

function Stats() {
  return (
    <section className="sec-pad" id="stats" style={{ background: "var(--ink-2)" }}>
      <div className="wrap">
        <Reveal><div className="sec-label" style={{ marginBottom: 12 }}>On-chain · as of Jun 2, 2026</div></Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 50, marginTop: 40 }}>
          <StatNum target={20} suffix="" label="SETTLEMENTS CREATED" />
          <StatNum target={9} suffix="+" label="CONFIRMED SETTLED" />
          <div>
            <div className="display" style={{ fontSize: "clamp(46px,7vw,86px)" }}>1<span style={{ color: "var(--accent)" }}>:1</span></div>
            <div className="mono" style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 10, letterSpacing: "0.04em" }}>BYTE-EXACT PROOF</div>
          </div>
          <div>
            <div className="display" style={{ fontSize: "clamp(46px,7vw,86px)", color: "var(--accent)" }}>∞</div>
            <div className="mono" style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 10, letterSpacing: "0.04em" }}>SAILS PROGRAMS VERIFIABLE</div>
          </div>
        </div>
        <Reveal delay={120}>
          <div style={{ marginTop: 64, display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", borderTop: "1px solid var(--hairline)", paddingTop: 28 }}>
            <span className="mono" style={{ fontSize: 12.5, color: "var(--muted)" }}>PROGRAM ID</span>
            <span className="mono" style={{ fontSize: 13.5, color: "var(--paper)", wordBreak: "break-all", flex: 1 }}>{PROG}</span>
            <span className="chip"><span style={{ width: 7, height: 7, borderRadius: 99, background: "var(--accent)", boxShadow: "0 0 10px var(--accent)" }}></span> Vara mainnet</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ========================== INTEGRATIONS ========================== */
function Integrations() {
  const cards = [
    ["Bounty boards", "infinite-bounty-v3", "Mirror open bounties as Provenance settlements. Workers get trustless guarantees instead of relying on the poster to approve manually."],
    ["Oracle networks", "VaraBridge", "Use oracle data as a settlement condition. Release VARA when a price crosses a threshold — verified by the oracle on-chain."],
    ["Mission systems", "aan-missions", "Escrow mission rewards in Provenance. Settlement releases automatically when the worker proves on-chain completion."],
    ["Any Sails program", "your-program-here", "If it has a readable method, it can be a verifier. Provenance composes with the network — it doesn't compete with it."],
  ];
  return (
    <section className="sec-paper sec-pad">
      <div className="wrap">
        <div style={{ maxWidth: 720 }}>
          <Reveal><div className="sec-label" style={{ marginBottom: 26 }}>Integration opportunities</div></Reveal>
          <Reveal delay={70}>
            <h2 className="display" style={{ fontSize: "clamp(32px,4.4vw,56px)" }}>Built to compose,<br />not to compete.</h2>
          </Reveal>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 20, marginTop: 56 }}>
          {cards.map((c, i) => (
            <Reveal key={i} delay={i * 70}>
              <div className="int-card" style={{ height: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                  <h3 style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>{c[0]}</h3>
                  <Lineage scale={0.85} ink="var(--ink)" />
                </div>
                <div className="mono" style={{ fontSize: 12.5, color: "var(--accent-deep)", marginBottom: 14 }}>{c[1]}</div>
                <p style={{ fontSize: 15.5, lineHeight: 1.58, color: "#4a4842", margin: 0 }}>{c[2]}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================== FOOTER ============================== */
function Footer() {
  return (
    <section>
      <div className="footer-cta" style={{ padding: "clamp(80px,11vw,140px) 0" }}>
        <div className="wrap" style={{ textAlign: "center" }}>
          <Reveal>
            <h2 className="display" style={{ fontSize: "clamp(40px,7vw,96px)", color: "var(--ink)" }}>Verification,<br />not trust.</h2>
          </Reveal>
          <Reveal delay={90}>
            <p style={{ fontSize: 18, lineHeight: 1.55, color: "rgba(10,11,13,0.7)", maxWidth: 560, margin: "26px auto 0" }}>
              The primitive that makes trustless agent-to-agent commerce possible on Vara — the way smart contracts did for Ethereum.
            </p>
          </Reveal>
          <Reveal delay={160}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center", marginTop: 40 }}>
              <a className="btn btn-dark" href={REPO} target="_blank" rel="noreferrer"><GitHubGlyph /> Explore the repo</a>
              <a className="btn btn-dark" href={X_URL} target="_blank" rel="noreferrer"><XGlyph /> Follow on X</a>
              <a className="btn" href="#sdk" style={{ background: "rgba(10,11,13,0.08)", color: "var(--ink)" }}>Read the SDK docs →</a>
            </div>
          </Reveal>
        </div>
      </div>
      <footer style={{ background: "var(--ink)", padding: "44px 0" }}>
        <div className="wrap" style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center", justifyContent: "space-between" }}>
          <NavLogo />
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <a href={X_URL} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "var(--muted)", fontSize: 13, transition: "color .15s" }} onMouseEnter={e => e.currentTarget.style.color="var(--paper)"} onMouseLeave={e => e.currentTarget.style.color="var(--muted)"}>
              <XGlyph s={13} /> @Prov_Escrow
            </a>
            <a href={REPO} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "var(--muted)", fontSize: 13, transition: "color .15s" }} onMouseEnter={e => e.currentTarget.style.color="var(--paper)"} onMouseLeave={e => e.currentTarget.style.color="var(--muted)"}>
              <GitHubGlyph s={13} /> IamHarrie-Labs
            </a>
          </div>
          <span className="mono" style={{ fontSize: 12.5, color: "var(--muted-d)" }}>© 2026 · Vara mainnet</span>
        </div>
      </footer>
    </section>
  );
}

/* ============================== APP ============================== */
function App() {
  return (
    <React.Fragment>
      <Nav />
      <Hero />
      <Problem />
      <HowItWorks />
      <Verify />
      <SDK />
      <Stats />
      <Integrations />
      <Footer />
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
