type ProjectSelectorProps = {
  mode: "inbox" | "existing" | "new";
  projects: { id: string; name: string }[];
  selectedProjectId: string;
  newProjectName: string;
  onModeChange: (mode: "inbox" | "existing" | "new") => void;
  onProjectChange: (value: string) => void;
  onNameChange: (value: string) => void;
  disabled?: boolean;
};

export default function ProjectSelector({
  mode,
  projects,
  selectedProjectId,
  newProjectName,
  onModeChange,
  onProjectChange,
  onNameChange,
  disabled,
}: ProjectSelectorProps) {
  const hasProjects = projects.length > 0;

  return (
    <div className="panel">
      <h2 className="panel-title">Project</h2>
      <div className="selector-row">
        <select
          className="select"
          value={mode}
          onChange={(event) =>
            onModeChange(event.target.value as "inbox" | "existing" | "new")
          }
          disabled={disabled}
        >
          <option value="inbox">Inbox (Unsorted)</option>
          <option value="existing" disabled={!hasProjects}>
            Select existing project
          </option>
          <option value="new">Create new project</option>
        </select>
        {mode === "existing" && (
          <select
            className="select"
            value={selectedProjectId}
            onChange={(event) => onProjectChange(event.target.value)}
            disabled={disabled || !hasProjects}
          >
            <option value="">Choose a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        )}
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
        Use Inbox for later review, pick an existing project, or create a new one.
      </p>
    </div>
  );
}
