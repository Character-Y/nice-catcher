import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { getAuthToken, setAuthError, setAuthToken, subscribeToAuthChange } from "./api";
import ProtectedRoute from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";

export default function App() {
  const [token, setToken] = useState<string | null>(getAuthToken());

  useEffect(() => {
    const unsubscribe = subscribeToAuthChange(setToken);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "nc_token") {
        setToken(getAuthToken());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const handleLogin = (newToken: string) => {
    setToken(newToken);
  };

  const handleSignOut = () => {
    setAuthError(null);
    setAuthToken(null);
    setToken(null);
  };

  return (
    <Routes>
      <Route
        path="/login"
        element={token ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />}
      />
      <Route
        path="/"
        element={
          <ProtectedRoute token={token}>
            <Dashboard onSignOut={handleSignOut} />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to={token ? "/" : "/login"} replace />} />
    </Routes>
  );
}
