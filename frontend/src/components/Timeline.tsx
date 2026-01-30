import { Trash2 } from "lucide-react";
import type { Memo } from "../api";

type TimelineProps = {
  memos: Memo[];
  onSelect: (memo: Memo) => void;
  onDelete: (memo: Memo) => void;
  onAudioPlay: (memoId: string, element: HTMLAudioElement) => void;
  onAudioStop: (memoId: string) => void;
  projectNameById?: Record<string, string>;
};

export default function Timeline({
  memos,
  onSelect,
  onDelete,
  onAudioPlay,
  onAudioStop,
  projectNameById,
}: TimelineProps) {
  return (
    <div className="panel">
      <div className="timeline-header">
        <h2 className="panel-title">Timeline</h2>
        <span className="timeline-count">{memos.length} memos</span>
      </div>
      <div className="timeline-list">
        {memos.length === 0 && <p className="helper-text">No memos yet.</p>}
        {memos.map((memo) => (
          <div key={memo.id} className="timeline-card">
            <button
              type="button"
              className="timeline-select"
              onClick={() => onSelect(memo)}
            >
            <div className="timeline-meta">
              <span className={`badge status-${memo.status}`}>{memo.status}</span>
              <span className="timeline-date">
                {new Date(memo.created_at).toLocaleString()}
              </span>
            </div>
            <p className="timeline-content">
              {memo.content?.trim() || "No transcription yet."}
            </p>
            {memo.audio_url && (
              <audio
                controls
                preload="none"
                className="timeline-audio"
                onPlay={(event) => onAudioPlay(memo.id, event.currentTarget)}
                onPause={() => onAudioStop(memo.id)}
                onEnded={() => onAudioStop(memo.id)}
              >
                <source src={memo.audio_url} />
              </audio>
            )}
            <div className="timeline-project">
              {memo.project_id
                ? `Project: ${projectNameById?.[memo.project_id] ?? memo.project_id}`
                : "Inbox"}
            </div>
            </button>
            <button
              type="button"
              className="icon-button danger"
              aria-label="Delete memo"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(memo);
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
