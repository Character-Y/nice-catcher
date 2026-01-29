import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Save } from "lucide-react";
import ActionBubble from "./components/ActionBubble";
import ProjectSelector from "./components/ProjectSelector";
import Timeline from "./components/Timeline";
import TranscriptionEditor from "./components/TranscriptionEditor";
import {
  captureAudio,
  getAuthToken,
  listMemos,
  listProjects,
  setAuthToken,
  updateMemo,
} from "./api";
import type { Memo, Project } from "./api";

type RecorderState = "idle" | "recording" | "saving" | "review";

export default function App() {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(getAuthToken());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [transcription, setTranscription] = useState("");
  const [currentMemo, setCurrentMemo] = useState<Memo | null>(null);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectMode, setProjectMode] = useState<"inbox" | "existing" | "new">("inbox");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const fetchMemos = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      const data = await listMemos();
      setMemos(data.sort((a, b) => b.created_at.localeCompare(a.created_at)));
    } catch (err) {
      console.error(err);
      setAuthError("Session expired. Please log in again.");
      setAuthToken(null);
      setToken(null);
    }
  }, [token]);

  const fetchProjects = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      const data = await listProjects();
      setProjects(data);
    } catch (err) {
      console.error(err);
      setAuthError("Session expired. Please log in again.");
      setAuthToken(null);
      setToken(null);
    }
  }, [token]);

  useEffect(() => {
    fetchMemos();
    fetchProjects();
  }, [fetchMemos, fetchProjects]);

  const resetProjectInputs = () => {
    setProjectMode("inbox");
    setSelectedProjectId("");
    setNewProjectName("");
  };

  const startRecording = async () => {
    setError(null);
    if (!token) {
      setAuthError("Please log in to start recording.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Audio recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        setState("saving");
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const file = new File([blob], `memo-${Date.now()}.webm`, {
          type: blob.type || "audio/webm",
        });
        try {
          const response = await captureAudio(file);
          const memo = response.memo ?? null;
          setCurrentMemo(memo);
          setTranscription(memo?.content?.toString() || "");
          setState("review");
          resetProjectInputs();
          await fetchMemos();
        } catch (uploadErr) {
          console.error(uploadErr);
          setError("Failed to upload audio. Please try again.");
          setState("idle");
        }
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setState("recording");
    } catch (err) {
      console.error(err);
      setError("Microphone permission denied or unavailable.");
      setState("idle");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const handleSelectMemo = (memo: Memo) => {
    setCurrentMemo(memo);
    setTranscription(memo.content?.toString() || "");
    setState("review");
    if (memo.project_id) {
      setProjectMode("existing");
      setSelectedProjectId(memo.project_id);
      setNewProjectName("");
    } else {
      resetProjectInputs();
    }
  };

  const handleSave = async () => {
    if (!currentMemo) {
      return;
    }
    if (projectMode === "existing" && !selectedProjectId) {
      setError("Please choose an existing project.");
      return;
    }
    setState("saving");
    setError(null);
    try {
      const payload = {
        content: transcription,
        status: "done" as const,
        project_id: projectMode === "inbox" ? null : projectMode === "existing" ? selectedProjectId : undefined,
        new_project_name: projectMode === "new" ? newProjectName : undefined,
      };
      const updated = await updateMemo(currentMemo.id, payload);
      setCurrentMemo(updated);
      setState("review");
      await fetchMemos();
      await fetchProjects();
    } catch (err) {
      console.error(err);
      setError("Failed to save memo updates.");
      setState("review");
    }
  };

  const handleLogin = async () => {
    setAuthError(null);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!supabaseUrl || !supabaseAnonKey) {
      setAuthError("Missing Supabase client config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }
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
      setToken(payload.access_token);
      setEmail("");
      setPassword("");
    } catch (loginErr) {
      console.error(loginErr);
      setAuthError("Login failed. Check your credentials.");
    }
  };

  const handleLogout = () => {
    setAuthToken(null);
    setToken(null);
    setCurrentMemo(null);
    setTranscription("");
    setMemos([]);
    setProjects([]);
  };

  if (!token) {
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
          <button type="button" className="primary-button" onClick={handleLogin}>
            Sign in
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Nice Catcher</p>
          <h1>Capture ideas fast.</h1>
          <p className="subtitle">Record, transcribe, review, and archive in seconds.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="ghost-button" onClick={handleLogout}>
            Sign out
          </button>
          <div className="status-pill">
            <span className={`dot ${state}`} />
            {state === "recording"
              ? "Recording"
              : state === "saving"
                ? "Saving"
                : state === "review"
                  ? "Review"
                  : "Idle"}
          </div>
        </div>
      </header>

      <main className="app-grid">
        <section className="left-column">
          <ActionBubble state={state} onStart={startRecording} onStop={stopRecording} />
          {error && <div className="error-card">{error}</div>}
          {state === "saving" && (
            <div className="loading-card">
              <Loader2 className="spin" size={18} />
              <span>Uploading and transcribing...</span>
            </div>
          )}
          <TranscriptionEditor
            value={transcription}
            onChange={setTranscription}
            disabled={state === "saving"}
          />
          <ProjectSelector
            mode={projectMode}
            projects={projects}
            selectedProjectId={selectedProjectId}
            newProjectName={newProjectName}
            onModeChange={setProjectMode}
            onProjectChange={setSelectedProjectId}
            onNameChange={setNewProjectName}
            disabled={state === "saving"}
          />
          <button
            type="button"
            className="primary-button"
            onClick={handleSave}
            disabled={!currentMemo || state === "saving"}
          >
            <Save size={18} />
            Save &amp; Archive
          </button>
          {currentMemo && (
            <div className="memo-meta">
              <span>Memo ID: {currentMemo.id}</span>
              <span>Status: {currentMemo.status}</span>
            </div>
          )}
        </section>

        <section className="right-column">
          <Timeline
            memos={memos}
            onSelect={handleSelectMemo}
            projectNameById={Object.fromEntries(projects.map((p) => [p.id, p.name]))}
          />
        </section>
      </main>
    </div>
  );
}
