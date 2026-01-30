import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuthError, setAuthError, setAuthToken, subscribeToAuthError } from "../api";

type LoginProps = {
  onLogin: (token: string) => void;
};

export default function Login({ onLogin }: LoginProps) {
  const navigate = useNavigate();
  const [authError, setAuthErrorState] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const existing = getAuthError();
    if (existing) {
      setAuthErrorState(existing);
      setAuthError(null);
    }
    const unsubscribe = subscribeToAuthError((message) => {
      if (message) {
        setAuthErrorState(message);
        setAuthError(null);
      }
    });
    return unsubscribe;
  }, []);

  const handleLogin = async () => {
    setAuthErrorState(null);
    setAuthSuccess(null);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!supabaseUrl || !supabaseAnonKey) {
      setAuthErrorState(
        "Missing Supabase client config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
      );
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
        let description =
          payload?.error_description || payload?.message || payload?.error || "Login failed.";
        if (response.status === 400 || response.status === 401) {
          if (
            description === "Login failed." ||
            description.toLowerCase().includes("invalid") ||
            description.toLowerCase().includes("credentials")
          ) {
            description = "invalid_login_credentials";
          }
        }
        throw new Error(description);
      }
      const payload = await response.json();
      setAuthError(null);
      setAuthToken(payload.access_token);
      onLogin(payload.access_token);
      setEmail("");
      setPassword("");
      navigate("/", { replace: true });
    } catch (loginErr) {
      console.error(loginErr);
      const message =
        loginErr instanceof Error && loginErr.message
          ? loginErr.message
          : "Login failed. Check your credentials.";
      if (
        message === "invalid_login_credentials" ||
        message.toLowerCase().includes("invalid login credentials") ||
        message.toLowerCase().includes("invalid credentials")
      ) {
        setAuthErrorState("Invalid email or password.");
      } else if (message.toLowerCase().includes("email not confirmed")) {
        setAuthErrorState("Email not confirmed. Please check your inbox.");
      } else {
        setAuthErrorState(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUp = async () => {
    setAuthErrorState(null);
    setAuthSuccess(null);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!supabaseUrl || !supabaseAnonKey) {
      setAuthErrorState(
        "Missing Supabase client config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
      );
      return;
    }
    if (!email || !password) {
      setAuthErrorState("Email and password are required.");
      return;
    }
    if (password.length < 6) {
      setAuthErrorState("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setAuthErrorState("Passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const description =
          payload?.error_description || payload?.message || payload?.error || "Sign up failed.";
        throw new Error(description);
      }
      const payload = await response.json();
      const accessToken = payload?.access_token ?? payload?.session?.access_token ?? null;
      if (accessToken) {
        setAuthError(null);
        setAuthToken(accessToken);
        onLogin(accessToken);
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        navigate("/", { replace: true });
        return;
      }
      setAuthSuccess("Check your email to confirm your account, then sign in.");
      setPassword("");
      setConfirmPassword("");
      setMode("login");
    } catch (signupErr) {
      console.error(signupErr);
      const message =
        signupErr instanceof Error && signupErr.message
          ? signupErr.message
          : "Sign up failed. Please check your email and try again.";
      if (message.toLowerCase().includes("already registered")) {
        setAuthErrorState("Email already registered. Try signing in instead.");
      } else if (message.toLowerCase().includes("invalid email")) {
        setAuthErrorState("Email format is invalid.");
      } else if (message.toLowerCase().includes("password")) {
        setAuthErrorState("Password does not meet requirements.");
      } else {
        setAuthErrorState(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (mode === "signup") {
      handleSignUp();
    } else {
      handleLogin();
    }
  };

  return (
    <div className="app auth-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">Nice Catcher</p>
          <h1>{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
          <p className="subtitle">
            {mode === "signup"
              ? "Sign up to start capturing ideas."
              : "Sign in to access your private workspace."}
          </p>
        </div>
      </header>
      <main className="panel auth-panel">
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === "login" ? "active" : ""}`}
            onClick={() => {
              setMode("login");
              setAuthErrorState(null);
              setAuthSuccess(null);
            }}
          >
            Login
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === "signup" ? "active" : ""}`}
            onClick={() => {
              setMode("signup");
              setAuthErrorState(null);
              setAuthSuccess(null);
            }}
          >
            Sign up
          </button>
        </div>
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
        {mode === "signup" && (
          <label className="field">
            Confirm Password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="••••••••"
            />
          </label>
        )}
        {authError && <div className="error-card">{authError}</div>}
        {authSuccess && <div className="success-card">{authSuccess}</div>}
        <button
          type="button"
          className="primary-button"
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting
            ? mode === "signup"
              ? "Creating account..."
              : "Signing in..."
            : mode === "signup"
              ? "Create account"
              : "Sign in"}
        </button>
      </main>
    </div>
  );
}
