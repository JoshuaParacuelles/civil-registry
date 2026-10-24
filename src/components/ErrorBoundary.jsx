import { Component } from "react";

const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk/i;
const RELOAD_FLAG = "chunk-reload-attempted";

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[UI crash]", error, info?.componentStack);

    // A redeploy can leave an old index.html pointing at chunk files that no
    // longer exist. Reload once to fetch the new build. The flag prevents a loop.
    const isStaleChunk = CHUNK_ERROR_PATTERN.test(error?.message || "");
    if (isStaleChunk && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, "1");
      window.location.reload();
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h2>Something went wrong.</h2>
        <p style={{ color: "#6b7280" }}>{String(error?.message || error)}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}