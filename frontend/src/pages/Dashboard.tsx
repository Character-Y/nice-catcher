import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import ActionBubble from "../components/ActionBubble";
import ProjectSelector from "../components/ProjectSelector";
import Timeline from "../components/Timeline";
import TranscriptionEditor from "../components/TranscriptionEditor";
import { captureAudio, listMemos, listProjects, updateMemo } from "../api";
import type { Memo, Project } from "../api";

type RecorderState = "idle" | "recording" | "saving" | "review";

type DashboardProps = {
  onSignOut: () => void;
};

export default function Dashboard({ onSignOut }: DashboardProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState("");
  const [currentMemo, setCurrentMemo] = useState<Memo | null>(null);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectMode, setProjectMode] = useState<"inbox" | "existing" | "new">("inbox");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [meterLevel, setMeterLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const fetchMemos = useCallback(async () => {
    try {
      const data = await listMemos();
      setMemos(data.sort((a, b) => b.created_at.localeCompare(a.created_at)));
    } catch (err) {
      console.error(err);
      setError("Failed to load memos.");
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await listProjects();
      setProjects(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load projects.");
    }
  }, []);

  useEffect(() => {
    fetchMemos();
    fetchProjects();
  }, [fetchMemos, fetchProjects]);

  const resetProjectInputs = () => {
    setProjectMode("inbox");
    setSelectedProjectId("");
    setNewProjectName("");
  };

  const applyMemoToEditor = (memo: Memo) => {
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

  const stopMeter = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => null);
      audioContextRef.current = null;
    }
    setMeterLevel(0);
  };

  const startMeter = (stream: MediaStream) => {
    stopMeter();
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    audioContextRef.current = context;
    analyserRef.current = analyser;
    sourceRef.current = source;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i += 1) {
        const value = (dataArray[i] - 128) / 128;
        sum += value * value;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      setMeterLevel(rms);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const startRecording = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Audio recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      startMeter(stream);
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        stopMeter();
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
      stopMeter();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const handleSelectMemo = (memo: Memo) => {
    applyMemoToEditor(memo);
  };

  const handleDiscard = async () => {
    if (!currentMemo) {
      return;
    }
    setError(null);
    try {
      const data = await listMemos();
      const latest = data.find((memo) => memo.id === currentMemo.id);
      if (latest) {
        applyMemoToEditor(latest);
        return;
      }
    } catch (err) {
      console.error(err);
    }
    applyMemoToEditor(currentMemo);
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
        project_id:
          projectMode === "inbox" ? null : projectMode === "existing" ? selectedProjectId : undefined,
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

  const handleLogout = () => {
    onSignOut();
    setCurrentMemo(null);
    setTranscription("");
    setMemos([]);
    setProjects([]);
  };

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
          <ActionBubble
            state={state}
            onStart={startRecording}
            onStop={stopRecording}
            level={meterLevel}
          />
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
          <div className="action-row">
            <button
              type="button"
              className="secondary-button"
              onClick={handleDiscard}
              disabled={!currentMemo || state === "saving"}
            >
              <Trash2 size={18} />
              Discard edits
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleSave}
              disabled={!currentMemo || state === "saving"}
            >
              <Save size={18} />
              Save &amp; Archive
            </button>
          </div>
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
