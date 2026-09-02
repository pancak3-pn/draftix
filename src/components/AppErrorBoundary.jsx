import { Component } from "react";

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) console.error("Draftix render failure", error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="app-error-boundary" role="alert">
        <img src="/images/draftix.png" alt="Draftix" />
        <section>
          <span>Something went wrong</span>
          <h1>Draftix needs a refresh.</h1>
          <p>Your browser hit an unexpected problem. Refresh the page to reconnect safely.</p>
          <div>
            <button type="button" onClick={() => window.location.reload()}>Refresh page</button>
            <a href="/">Back to home</a>
          </div>
        </section>
      </main>
    );
  }
}
