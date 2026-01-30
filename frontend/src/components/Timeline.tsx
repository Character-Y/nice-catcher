import type { Memo } from "../api";

type TimelineProps = {
  memos: Memo[];
  onSelect: (memo: Memo) => void;
  projectNameById?: Record<string, string>;
};

export default function Timeline({ memos, onSelect, projectNameById }: TimelineProps) {
  return (
    <div className="panel">
      <div className="timeline-header">
        <h2 className="panel-title">Timeline</h2>
        <span className="timeline-count">{memos.length} memos</span>
      </div>
      <div className="timeline-list">
        {memos.length === 0 && <p className="helper-text">No memos yet.</p>}
        {memos.map((memo) => (
          <button
            key={memo.id}
            type="button"
            className="timeline-card"
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
              <audio controls preload="none" className="timeline-audio">
                <source src={memo.audio_url} />
              </audio>
            )}
            <div className="timeline-project">
              {memo.project_id
                ? `Project: ${projectNameById?.[memo.project_id] ?? memo.project_id}`
                : "Inbox"}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
