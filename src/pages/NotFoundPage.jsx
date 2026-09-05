export default function NotFoundPage() {
    return (
        <main className="sp-page notfound-page">
                <a className="nf-brand" href="/" aria-label="Draftix home">
                    <img src="/images/draftix.webp" alt="Draftix" />
                </a>
                <section className="nf-hero" aria-labelledby="nf-title">
                    <div className="nf-copy-block">
                        <p className="nf-code">Error 404</p>
                        <h1 id="nf-title">Wrong door.</h1>
                        <p className="nf-copy">This route is unavailable, expired, or never existed.</p>
                        <div className="nf-actions">
                            <a className="nf-primary" href="/">Return home</a>
                            <a className="nf-secondary" href="/draft">Open Draftix</a>
                        </div>
                        <nav className="nf-suggestions" aria-label="Popular pages">
                            <a href="/team-balance">Team balancer</a>
                            <a href="/tournaments">Bracket maker</a>
                            <a href="/status">Status</a>
                        </nav>
                    </div>
                    <div className="nf-visual">
                        <img src="/images/Homepage/404-door.webp" alt="An open red-lit doorway marking a missing Draftix page" />
                    </div>
                </section>
        </main>
    );
}
