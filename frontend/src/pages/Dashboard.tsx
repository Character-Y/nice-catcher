import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Save, Trash2, Upload } from "lucide-react";
import ActionBubble from "../components/ActionBubble";
import ProjectSelector from "../components/ProjectSelector";
import Timeline from "../components/Timeline";
import TranscriptionEditor from "../components/TranscriptionEditor";
import {
  addMemoLocation,
  captureAudio,
  deleteMemo,
  listMemos,
  listProjects,
  updateMemo,
  uploadMemoMedia,
} from "../api";
import type { Attachment, Memo, Project } from "../api";

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
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isAddingLocation, setIsAddingLocation] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const releaseStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const getOrCreateStream = async () => {
    const stream = streamRef.current;
    if (stream && stream.active) {
      return stream;
    }
    const nextStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = nextStream;
    return nextStream;
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

  const updateCurrentMemoFromList = (memoId: string, list: Memo[]) => {
    const latest = list.find((memo) => memo.id === memoId);
    if (latest) {
      applyMemoToEditor(latest);
    }
  };

  const getAttachments = (memo: Memo | null): Attachment[] => {
    if (!memo?.attachments) {
      return [];
    }
    return memo.attachments.filter((item) => item && typeof item === "object") as Attachment[];
  };

  const stopAudioPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setCurrentPlayingId(null);
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
      const stream = await getOrCreateStream();
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
        mediaRecorderRef.current = null;
        releaseStream();
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

  const handleDelete = async (memo: Memo) => {
    if (!window.confirm("Are you sure? This cannot be undone.")) {
      return;
    }
    setError(null);
    setMemos((prev) => prev.filter((item) => item.id !== memo.id));
    if (currentPlayingId === memo.id) {
      stopAudioPlayback();
    }
    if (currentMemo?.id === memo.id) {
      setCurrentMemo(null);
      setTranscription("");
      setState("idle");
    }
    try {
      await deleteMemo(memo.id);
    } catch (err) {
      console.error(err);
      setError("Failed to delete memo. Refreshing list.");
      await fetchMemos();
    }
  };

  const handleAddPhotoClick = () => {
    if (!currentMemo) {
      setError("Select a memo before adding attachments.");
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!currentMemo || files.length === 0) {
      return;
    }
    setError(null);
    setIsUploadingMedia(true);
    try {
      await uploadMemoMedia(currentMemo.id, files);
      const data = await listMemos();
      setMemos(data.sort((a, b) => b.created_at.localeCompare(a.created_at)));
      updateCurrentMemoFromList(currentMemo.id, data);
    } catch (err) {
      console.error(err);
      setError("Failed to upload media. Refreshing list.");
      await fetchMemos();
    } finally {
      setIsUploadingMedia(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleAddLocation = () => {
    if (!currentMemo) {
      setError("Select a memo before adding attachments.");
      return;
    }
    if (!navigator.geolocation) {
      setError("Geolocation is not supported in this browser.");
      return;
    }
    setError(null);
    setIsAddingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await addMemoLocation(currentMemo.id, {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          const data = await listMemos();
          setMemos(data.sort((a, b) => b.created_at.localeCompare(a.created_at)));
          updateCurrentMemoFromList(currentMemo.id, data);
        } catch (err) {
          console.error(err);
          setError("Failed to tag location. Refreshing list.");
          await fetchMemos();
        } finally {
          setIsAddingLocation(false);
        }
      },
      () => {
        setIsAddingLocation(false);
        setError("Could not get location.");
      }
    );
  };

  const renderEditorAttachments = (memo: Memo | null) => {
    if (!memo) {
      return null;
    }
    const attachments = getAttachments(memo);
    const images = attachments.filter((item) => item.type === "image") as Array<{
      type: "image";
      url: string;
    }>;
    const locations = attachments.filter((item) => item.type === "location") as Array<{
      type: "location";
      lat: number;
      lng: number;
    }>;
    if (images.length === 0 && locations.length === 0) {
      return null;
    }
    return (
      <div className="attachment-list">
        {images.length > 0 && (
          <div className="attachment-grid">
            {images.map((item, index) => (
              <img
                key={`${item.url}-${index}`}
                src={item.url}
                alt="Attachment"
                className="attachment-image"
                loading="lazy"
              />
            ))}
          </div>
        )}
        {locations.length > 0 && (
          <div className="attachment-chips">
            {locations.map((item, index) => (
              <span key={`${item.lat}-${item.lng}-${index}`} className="location-chip">
                <MapPin size={14} />
                Location: {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  const handleAudioPlay = (memoId: string, element: HTMLAudioElement) => {
    if (currentPlayingId && currentPlayingId !== memoId && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    audioRef.current = element;
    setCurrentPlayingId(memoId);
  };

  const handleAudioStop = (memoId: string) => {
    if (currentPlayingId === memoId) {
      stopAudioPlayback();
    }
  };

  const handleLogout = () => {
    onSignOut();
    setCurrentMemo(null);
    setTranscription("");
    setMemos([]);
    setProjects([]);
    stopMeter();
    releaseStream();
    stopAudioPlayback();
  };

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        stopMeter();
        releaseStream();
      }
    };
    const handlePageHide = () => {
      stopMeter();
      releaseStream();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      stopMeter();
      releaseStream();
    };
  }, []);

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
          <div className="panel">
            <h2 className="panel-title">Add Attachment</h2>
            <div className="attachment-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={handleAddPhotoClick}
                disabled={!currentMemo || isUploadingMedia || state === "saving"}
              >
                <Upload size={18} />
                {isUploadingMedia ? "Uploading..." : "Add Photo"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={handleAddLocation}
                disabled={!currentMemo || isAddingLocation || state === "saving"}
              >
                <MapPin size={18} />
                {isAddingLocation ? "Tagging..." : "Tag Location"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={handleFilesSelected}
              />
            </div>
            {renderEditorAttachments(currentMemo)}
          </div>
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
              className="danger-button"
              onClick={() => currentMemo && handleDelete(currentMemo)}
              disabled={!currentMemo || state === "saving"}
            >
              <Trash2 size={18} />
              Delete memo
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
            onDelete={handleDelete}
            onAudioPlay={handleAudioPlay}
            onAudioStop={handleAudioStop}
            projectNameById={Object.fromEntries(projects.map((p) => [p.id, p.name]))}
          />
        </section>
      </main>
    </div>
  );
}
