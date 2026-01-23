type ProjectSelectorProps = {
  mode: "inbox" | "new";
  newProjectName: string;
  onModeChange: (mode: "inbox" | "new") => void;
  onNameChange: (value: string) => void;
  disabled?: boolean;
};

export default function ProjectSelector({
  mode,
  newProjectName,
  onModeChange,
  onNameChange,
  disabled,
}: ProjectSelectorProps) {
  return (
    <div className="panel">
      <h2 className="panel-title">Project</h2>
      <div className="selector-row">
        <select
          className="select"
          value={mode}
          onChange={(event) => onModeChange(event.target.value as "inbox" | "new")}
          disabled={disabled}
        >
          <option value="inbox">Inbox (Unsorted)</option>
          <option value="new">Create new project</option>
        </select>
        {mode === "new" && (
          <input
            className="input"
            value={newProjectName}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Project name"
            disabled={disabled}
          />
        )}
      </div>
      <p className="helper-text">
        Use Inbox for later review or create a project to file immediately.
      </p>
    </div>
  );
}
