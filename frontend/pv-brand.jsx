/* global React */
/* Provenance brand atoms — shared across the site (exported to window.PV) */
const { useState, useEffect, useRef } = React;

function MatchMark({ size = 40, color = "var(--accent)", gap }) {
  return (
    <span className="matchmark" style={{ width: size, height: size * 0.62, gap: gap }} aria-hidden="true">
      <i style={{ background: color }}></i>
      <i style={{ background: color }}></i>
    </span>
  );
}

function MatchTile({ size = 84, bg = "var(--ink)", mark = "var(--accent)", radius = "24%" }) {
  return (
    <span className="tile" style={{ width: size, height: size, background: bg, borderRadius: radius }}>
      <MatchMark size={size * 0.5} color={mark} />
    </span>
  );
}

// node -> node -> settled(accent)
function Lineage({ scale = 1, ink = "var(--paper)" }) {
  const d = 14 * scale;
  const seg = 16 * scale;
  return (
    <span className="lineage" aria-hidden="true">
      <span className="node" style={{ width: d, height: d, background: ink }}></span>
      <span className="seg" style={{ width: seg, height: 2 * scale, background: ink }}></span>
      <span className="node" style={{ width: d, height: d, background: "transparent", border: (2.5 * scale) + "px solid " + ink }}></span>
      <span className="seg" style={{ width: seg, height: 2 * scale, background: ink }}></span>
      <span className="node" style={{ width: d * 1.14, height: d * 1.14, background: "var(--accent)" }}></span>
    </span>
  );
}

function Wordmark({ size = 30, color = "var(--paper)", weight = 700 }) {
  return <span className="wm" style={{ fontSize: size, color: color, fontWeight: weight }}>Provenance</span>;
}

function NavLogo({ color = "var(--paper)" }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 13 }}>
      <Lineage scale={1.05} ink={color} />
      <Wordmark size={23} color={color} />
    </span>
  );
}

/* ---------- hooks ---------- */

// reveal-on-scroll — resilient: IntersectionObserver does NOT fire while the
// document is hidden (preview/capture/background tabs), so we also (a) reveal
// immediately if already in view on mount, (b) reveal on visibilitychange, and
// (c) keep a safety-net timeout so content can never get stuck at opacity:0.
function useReveal(options) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let done = false;
    const reveal = () => { if (!done) { done = true; setShown(true); } };

    const inView = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      return r.top < vh * 0.92 && r.bottom > 0;
    };
    if (inView()) reveal();

    const io = new IntersectionObserver(
      (entries) => { entries.forEach((e) => { if (e.isIntersecting) reveal(); }); },
      Object.assign({ threshold: 0.18, rootMargin: "0px 0px -8% 0px" }, options || {})
    );
    io.observe(el);

    const onVis = () => { if (!document.hidden && inView()) reveal(); };
    document.addEventListener("visibilitychange", onVis);
    // safety net: never leave content invisible
    const t = setTimeout(() => { if (inView()) reveal(); }, 900);

    return () => { io.disconnect(); document.removeEventListener("visibilitychange", onVis); clearTimeout(t); };
  }, []);
  return [ref, shown];
}

// count-up when visible
function useCountUp(target, duration) {
  const [val, setVal] = useState(0);
  const [ref, shown] = useReveal({ threshold: 0.4 });
  useEffect(() => {
    if (!shown) return;
    let raf, start;
    const dur = duration || 1400;
    const step = (t) => {
      if (!start) start = t;
      const p = Math.min((t - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [shown, target]);
  return [ref, val];
}

function Reveal({ children, delay = 0, y = 22, style, className }) {
  const [ref, shown] = useReveal();
  return (
    <div
      ref={ref}
      className={className}
      style={Object.assign(
        {
          opacity: shown ? 1 : 0,
          transform: shown ? "none" : "translateY(" + y + "px)",
          transition: "opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1)",
          transitionDelay: delay + "ms",
        },
        style || {}
      )}
    >
      {children}
    </div>
  );
}

window.PV = { MatchMark, MatchTile, Lineage, Wordmark, NavLogo, useReveal, useCountUp, Reveal };
