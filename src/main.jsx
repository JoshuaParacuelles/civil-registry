// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";
import { PermissionProvider } from "./context/PermissionContext";
import ProtectedRoute from "./routes/ProtectedRoute";
import Login from "./pages/Auth/Login";
import Home from "./pages/Home/Home";
import AccessDenied from "./pages/AccountSettings/AccessDenied";

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