export default function LoadingScreen({ waking = false }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      height: "100vh", gap: "12px", color: "#888",
    }}>
      <div style={{
        width: "32px", height: "32px",
        border: "3px solid #e5e7eb",
        borderTop: "3px solid #6366f1",
        borderRadius: "50%",
        animation: "app-loading-spin 0.8s linear infinite",
      }} />
      <p style={{ margin: 0 }}>
        {waking ? "Waking up the server, this can take up to a minute…" : "Loading..."}
      </p>
    </div>
  );
}