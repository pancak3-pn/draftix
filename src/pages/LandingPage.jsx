import { useEffect, useState } from "react";

const mapPool = ["Ascent", "Abyss", "Bind", "Breeze", "Fracture", "Haven", "Icebox", "Lotus", "Pearl", "Split", "Sunset"].map((displayName) => ({
  displayName,
  src: `/images/maps/${displayName.toLowerCase()}.png`,
}));

function Brand() {
  return <span className="dr-brand"><img src="/images/draftix.png" alt="" /><strong>DRAFT<span>IX</span></strong></span>;
}

function Navigation() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return <nav className="dr-nav" aria-label="Primary navigation"><a href="#top" onClick={close} aria-label="Draftix home"><Brand /></a><button className="dr-menu" type="button" aria-expanded={open} aria-controls="dr-nav-links" onClick={() => setOpen((value) => !value)}><span /><span /><span /><b className="sr-only">Toggle navigation</b></button><div id="dr-nav-links" className={`dr-nav-links ${open ? "is-open" : ""}`}><a href="#product" onClick={close}>Product</a><a href="#process" onClick={close}>How it works</a><a href="/team-balance.html" onClick={close}>Team balancer</a><a href="/app" className="dr-nav-cta" onClick={close}>Open Draftix</a></div></nav>;
}

function MapCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);

  const select = (index) => {
    setActiveIndex((index + mapPool.length) % mapPool.length);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowLeft") select(activeIndex - 1);
    if (event.key === "ArrowRight") select(activeIndex + 1);
  };

  return <div className="dr-map-carousel" tabIndex="0" onKeyDown={handleKeyDown} aria-label="Valorant map carousel">
    <div className="dr-map-stage">
      {mapPool.map((map, index) => {
        const offset = (index - activeIndex + mapPool.length) % mapPool.length;
        const position = offset === 0 ? "active" : offset === 1 ? "next" : offset === mapPool.length - 1 ? "previous" : "hidden";
        return <button className={`dr-map-slide is-${position}`} key={map.displayName} type="button" onClick={() => select(index)} aria-label={`Show ${map.displayName}`} aria-hidden={position === "hidden"} tabIndex={position === "hidden" ? -1 : 0}>
          {position !== "hidden" && <img src={map.src} alt="" loading={position === "active" ? "eager" : "lazy"} />}
          <span>{map.displayName}</span>
        </button>;
      })}
    </div>
    <div className="dr-map-controls">
      <button type="button" onClick={() => select(activeIndex - 1)}>Previous</button>
      <p><strong>{String(activeIndex + 1).padStart(2, "0")}</strong><span> / {String(mapPool.length).padStart(2, "0")}</span></p>
      <button type="button" onClick={() => select(activeIndex + 1)}>Next</button>
    </div>
  </div>;
}

export default function LandingPage() {
  useEffect(() => {
    document.body.classList.add("dr-page");
    const nodes = document.querySelectorAll("[data-reveal]");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      nodes.forEach((node) => node.classList.add("is-visible"));
      return () => document.body.classList.remove("dr-page");
    }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    }), { threshold: 0.18, rootMargin: "0px 0px -8%" });
    nodes.forEach((node) => observer.observe(node));
    return () => { observer.disconnect(); document.body.classList.remove("dr-page"); };
  }, []);

  return <main className="dr-site"><Navigation /><section className="dr-hero" id="top"><div className="dr-hero-copy" data-reveal><h1>Settle the draft.<br /><span>Start ready.</span></h1><p>One shared room for map vetoes, agent bans, and the decisions that shape the match.</p><div className="dr-actions"><a href="/app" className="dr-button dr-button-primary">Start a draft</a><a href="#process" className="dr-button dr-button-secondary">See the flow</a></div></div><figure className="dr-hero-visual" data-reveal><img src="/images/draftix-tactical-hero.png" alt="Abstract tactical arena map with red and blue draft markers" fetchPriority="high" /></figure></section><section className="dr-operations" id="product" data-reveal><div className="dr-operation-intro"><h2>Everything happens in one room.</h2><p>The host sets the format. Captains make the calls. Everyone sees the same state.</p></div><div className="dr-operation-list"><article><h3>Create the lobby</h3><p>Share a short code. No account or install is required.</p></article><article><h3>Run the veto</h3><p>Server-controlled turns and timers keep every decision fair.</p></article><article><h3>Lock the match</h3><p>Pick the opening side, finish agent bans, and export the result.</p></article></div></section><section className="dr-process" id="process"><header data-reveal><h2>From room code to ready.</h2></header><div className="dr-process-track"><article data-reveal><h3>Open</h3><p>Create a room and send the code to both teams.</p></article><article data-reveal><h3>Claim</h3><p>Captains take their seats and confirm team names.</p></article><article data-reveal><h3>Veto</h3><p>Ban maps, choose a side, then finish agent bans.</p></article><article data-reveal><h3>Play</h3><p>Save the final draft and move into the match.</p></article></div></section><section className="dr-pool" data-reveal><header><h2>Current map pool</h2><p>Explore every arena available in Draftix.</p></header><MapCarousel /></section><section className="dr-final" data-reveal><h2>Your next draft takes seconds.</h2><a href="/app" className="dr-button dr-button-primary">Open Draftix</a></section><footer className="dr-footer"><Brand /><p>Real-time drafting for Valorant teams.</p><nav aria-label="Footer navigation"><a href="/status.html">Status</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></nav><small>© {new Date().getFullYear()} DRAFTIX</small></footer></main>;
}
