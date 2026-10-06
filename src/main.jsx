// src/main.jsx
import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";
import { PermissionProvider } from "./context/PermissionContext";
import ProtectedRoute from "./routes/ProtectedRoute";
import Login from "./pages/Auth/Login";
import AccessDenied from "./pages/AccountSettings/AccessDenied";
import HomePreloader from "./routes/HomePreloader";
import LoadingScreen from "./routes/LoadingScreen";
import ToastContainer from "./components/ToastContainer";
import { ConnectivityProvider } from "./context/ConnectivityContext";
import OfflineBanner from "./components/OfflineBanner";
import "./offline";

// Home is the shell for every dashboard page (charts, maps, tables). Loading it
// lazily keeps all of that out of the initial bundle the login page downloads.
const loadHome = () => import("./pages/Home/Home");
const Home = lazy(loadHome);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConnectivityProvider>
      {/* Router wraps PermissionProvider so Navigate works inside ProtectedRoute */}
      <Router>
        <ToastContainer />
        <OfflineBanner />
        <PermissionProvider>
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
                  <Suspense fallback={<LoadingScreen />}>
                    <Home />
                  </Suspense>
                </ProtectedRoute>
              }
            >
              <Route path="dashboard" element={<></>} />
              <Route path="vital-records/*" element={<></>} />
              <Route path="heatmaps" element={<></>} />
              <Route path="document-tracking" element={<></>} />
              <Route path="settings/*" element={<></>} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </PermissionProvider>
      </Router>
    </ConnectivityProvider>
  </React.StrictMode>
);