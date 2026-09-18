// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { PermissionProvider } from "./components/PermissionContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login        from "./components/auth/Login";
import Home         from "./components/home";
import AccessDenied from "./components/Account Settings/AccessDenied"; // ← correct path

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* Router wraps PermissionProvider so Navigate works inside ProtectedRoute */}
    <Router>
      <PermissionProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/"              element={<Login />} />
          <Route path="/access-denied" element={<AccessDenied />} />

          {/* Protected shell — all nested pages live inside Home */}
          <Route
            path="/dashboard/*"
            element={
              <ProtectedRoute module="dashboard">
                <Home />
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