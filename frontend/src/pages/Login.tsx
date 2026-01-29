import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setAuthToken } from "../api";

type LoginProps = {
  onLogin: (token: string) => void;
};

export default function Login({ onLogin }: LoginProps) {
  const navigate = useNavigate();
  const [authError, setAuthError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    setAuthError(null);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!supabaseUrl || !supabaseAnonKey) {
      setAuthError("Missing Supabase client config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error_description || "Login failed.");
      }
      const payload = await response.json();
      setAuthToken(payload.access_token);
      onLogin(payload.access_token);
      setEmail("");
      setPassword("");
      navigate("/", { replace: true });
    } catch (loginErr) {
      console.error(loginErr);
      setAuthError("Login failed. Check your credentials.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="app auth-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">Nice Catcher</p>
          <h1>Welcome back</h1>
          <p className="subtitle">Sign in to access your private workspace.</p>
        </div>
      </header>
      <main className="panel auth-panel">
        <h2 className="panel-title">Login</h2>
        <label className="field">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label className="field">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </label>
        {authError && <div className="error-card">{authError}</div>}
        <button
          type="button"
          className="primary-button"
          onClick={handleLogin}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </main>
    </div>
  );
}
