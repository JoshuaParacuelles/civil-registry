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

// Home is the shell for every dashboard page (charts, maps, tables). Loading it
// lazily keeps all of that out of the initial bundle the login page downloads.
const loadHome = () => import("./pages/Home/Home");
const Home = lazy(loadHome);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* Router wraps PermissionProvider so Navigate works inside ProtectedRoute */}
    <Router>
      <PermissionProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<><Login /><HomePreloader /></>} />
          <Route path="/access-denied" element={<AccessDenied />} />

          {/* Protected shell — all nested pages live inside Home */}
          <Route
            path="/dashboard/*"
            element={
              <ProtectedRoute module="dashboard">
                <Suspense fallback={<LoadingScreen />}>
                  <Home />
                </Suspense>
              </ProtectedRoute>
            }
          />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PermissionProvider>
    </Router>
  </React.StrictMode>
);