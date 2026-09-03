import { useEffect, useRef, useState } from "react";
import AppNav from "../components/AppNav.jsx";
import PublicFooter from "../components/PublicFooter.jsx";

const mapPool = ["Ascent", "Abyss", "Bind", "Breeze", "Corrode", "Fracture", "Haven", "Icebox", "Lotus", "Pearl", "Split", "Summit", "Sunset"].map((displayName) => ({
  displayName,
  src: `/images/maps/${displayName.toLowerCase()}.png`,
}));

const heroSlides = [
  { src: "/images/Homepage/steap1-create.png", alt: "Draftix room creation screen" },
  { src: "/images/Homepage/step2-banmap.png", alt: "Draftix map veto screen" },
  { src: "/images/Homepage/step3-choosteam.png", alt: "Draftix side selection screen" },
  { src: "/images/Homepage/step4-banagent.png", alt: "Draftix agent ban screen" },
  { src: "/images/Homepage/matchfound.png", alt: "Draftix match found screen" },
  { src: "/images/Homepage/result.png", alt: "Draftix completed match result" },
];

const navigationLinks = [
  { href: "#process", label: "How it works" },
  { href: "/tournaments", label: "Tournaments" },
  { href: "/team-balance", label: "Team balancer" },
  { href: "/draft", label: "Open Draftix", className: "dr-nav-cta" },
];

const DAILY_PLAYERS = "500+";

function DailyStat() {
  return <span className="dr-daily-stat" title="Draftix averaged 500+ players daily during its first week after launch.">
    <strong>{DAILY_PLAYERS}</strong> players daily in launch week
  </span>;
}

function HeroSlideshow() {
  return <div className="dr-hero-flight">
    <div className="dr-hero-stream" aria-hidden="true">
      {heroSlides.map((slide, index) => <figure className="dr-hero-visual" key={slide.src} style={{ "--dr-slide-index": index }}>
        <img src={slide.src} alt="" fetchPriority={index === 0 ? "high" : "auto"} loading={index === 0 ? "eager" : "lazy"} />
      </figure>)}
    </div>
    <span className="sr-only">Animated preview of the Draftix workflow from room creation to final match result.</span>
  </div>;
}

function BackToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 520);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return <button className={`dr-back-to-top ${visible ? "is-visible" : ""}`} type="button" aria-label="Updraft to top" title="Updraft to top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><img src="/images/button-to-up.png" alt="" /><span>Updraft to top</span></button>;
}

function MapCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const pointerStart = useRef(null);
  const select = (index) => setActiveIndex((index + mapPool.length) % mapPool.length);
  const handleKeyDown = (event) => {
    if (event.key === "ArrowLeft") select(activeIndex - 1);
    if (event.key === "ArrowRight") select(activeIndex + 1);
  };
  const finishSwipe = (event) => {
    if (pointerStart.current === null) return;
    const distance = event.clientX - pointerStart.current;
    pointerStart.current = null;
    if (Math.abs(distance) >= 45) select(activeIndex + (distance < 0 ? 1 : -1));
  };

  return <div className="dr-map-carousel" tabIndex="0" onKeyDown={handleKeyDown} onPointerDown={(event) => { pointerStart.current = event.clientX; }} onPointerUp={finishSwipe} onPointerCancel={() => { pointerStart.current = null; }} aria-label="Valorant map carousel">
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

function TutorialModal({ onClose }) {
  const videoRef = useRef(null);
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return <div className="dr-tutorial-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Draftix tutorial video">
    <div className="dr-tutorial-modal" onClick={(event) => event.stopPropagation()}>
      <button type="button" className="dr-tutorial-close" onClick={onClose} aria-label="Close tutorial">&times;</button>
      <video ref={videoRef} src="/videos/draftix-tutorial.mp4" controls autoPlay playsInline />
    </div>
  </div>;
}

export default function LandingPage() {
  const [showTutorial, setShowTutorial] = useState(false);
  useEffect(() => {
    document.body.classList.add("dr-page");
    const nodes = document.querySelectorAll("[data-reveal], [data-flow]");
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

  return <main className="dr-site">
    <AppNav variant="landing" homeHref="#top" links={navigationLinks} />
    <section className="dr-hero" id="top">
      <div className="dr-hero-copy" data-reveal><h1><span className="sr-only">Draftix — </span>Draft together.<br /><span>Play prepared.</span></h1><p>Draftix is a free Valorant drafting and map veto platform for teams, scrims, and tournaments.</p><div className="dr-actions"><a href="/draft" className="dr-button dr-button-primary">Open a room</a><a href="#process" className="dr-button dr-button-secondary">Watch the flow</a></div><small className="dr-hero-note"><DailyStat /> No signup.</small></div>
      <HeroSlideshow />
    </section>
    <section className="dr-agents" id="agents" data-reveal>
      <figure className="dr-agents-media">
        <img src="/images/Homepage/hero-agents.png" alt="Draftix agent key art" loading="lazy" />
      </figure>
      <div className="dr-agents-intro">
        <h2>Your agents</h2>
        <strong>Every lock-in changes the draft.</strong>
        <p>Ban, pick, and counter around the agents your team actually plays. Draftix runs the full agent veto in one shared room, so your comp leaves the draft ready — not guessed.</p>
        <a href="https://playvalorant.com/en-us/agents/" target="_blank" rel="noreferrer" className="dr-button dr-agents-cta">View all agents</a>
      </div>
    </section>
    <section className="dr-operations" id="product" data-reveal>
      <header className="dr-operation-intro">
        <h2>One room.<br />Every decision.</h2>
        <p>Create the room, run the draft, share the final matchup.</p>
        <a href="/draft" className="dr-button dr-button-primary">Open a room</a>
      </header>
      <figure className="dr-banner-media">
        <img src="/images/Homepage/section-banner.png" alt="Draftix squad key art" loading="lazy" />
      </figure>
    </section>
    <section className="dr-process" id="process" data-flow>
      <header data-reveal><h2>Four calls. Match ready.</h2><p>See the full flow in under two minutes.</p><button type="button" className="dr-button dr-button-secondary dr-tutorial-btn" onClick={() => setShowTutorial(true)}>Watch tutorial</button></header>
      <div className="dr-process-track">
        <article data-reveal><img src="/images/Homepage/steap1-create.png" alt="" loading="lazy" /><div><strong>01</strong><h3>Open</h3><p>Create the room.</p></div></article>
        <article data-reveal><img src="/images/Homepage/step2-banmap.png" alt="" loading="lazy" /><div><strong>02</strong><h3>Veto</h3><p>Ban the map.</p></div></article>
        <article data-reveal><img src="/images/Homepage/step3-choosteam.png" alt="" loading="lazy" /><div><strong>03</strong><h3>Claim</h3><p>Choose your team.</p></div></article>
        <article data-reveal><img src="/images/Homepage/step4-banagent.png" alt="" loading="lazy" /><div><strong>04</strong><h3>Lock</h3><p>Ban the agent.</p></div></article>
      </div>
    </section>
    <section className="dr-pool" data-reveal><header><h2>Current map pool</h2><p>Choose the arena before the match begins.</p></header><MapCarousel /></section>
    <section className="dr-final" data-reveal><p className="dr-final-eyebrow">// Final call</p><h2>Your next draft takes seconds.</h2><p className="dr-final-sub">No account needed. Create a room, share the code, and lock in your comp.</p><a href="/draft" className="dr-button dr-button-primary">Open Draftix</a></section>
    <PublicFooter reveal />
    {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}
    <BackToTop />

  </main>;
}
