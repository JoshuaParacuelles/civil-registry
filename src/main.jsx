// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";
import "./styles/darkTheme.css";
import { applyStoredDisplayPrefs } from "./utils/displayPrefs";
import { PermissionProvider } from "./context/PermissionContext";
import { OfflineProvider } from "./context/OfflineContext";
import { RefreshProvider } from "./context/RefreshContext";
import ProtectedRoute from "./routes/ProtectedRoute";
import Login from "./pages/Auth/Login";
import AccessDenied from "./pages/Auth/AccessDenied";
import HomePreloader from "./routes/HomePreloader";
import ToastContainer from "./components/ToastContainer";
import GlobalRealtime from "./components/GlobalRealtime";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./pages/Home/Home";

// Apply the saved theme, zoom and contrast before the first render so the
// app never paints in the wrong mode after a restart.
applyStoredDisplayPrefs();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* ErrorBoundary shows a readable message if a render crashes, instead of a blank page. */}
    <ErrorBoundary>
      {/* Router wraps PermissionProvider so Navigate works inside ProtectedRoute */}
      <Router>
        <ToastContainer />
        {/* One realtime listener for the whole app. Pages subscribe via useDataChanged. */}
        <GlobalRealtime />
        <PermissionProvider>
          <OfflineProvider>
            {/* Global refresh: lives above the routes so every registered page loader
                survives navigation between modules. */}
            <RefreshProvider>
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route path="/login" element={<><Login /><HomePreloader /></>} />
                <Route path="/access-denied" element={<AccessDenied />} />

                {/* Protected shell. One pathless layout route keeps Home mounted
                    while you move between pages; Home reads the URL itself to
                    decide which page to show. */}
                <Route
                  element={
                    <ProtectedRoute module="dashboard">
                      <Home />
                    </ProtectedRoute>
                  }
                >
                  <Route path="dashboard" element={<></>} />
                  <Route path="vital-records/*" element={<></>} />
                  <Route path="heatmaps" element={<></>} />
                  <Route path="document-tracking" element={<></>} />
                  <Route path="settings/*" element={<></>} />
                  <Route path="offline-sync" element={<></>} />
                </Route>

                {/* Catch-all */}
                <Route path="*" element={<Navigate to="/login" replace />} />
              </Routes>
            </RefreshProvider>
          </OfflineProvider>
        </PermissionProvider>
      </Router>
    </ErrorBoundary>
  </React.StrictMode>
);