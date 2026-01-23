type TranscriptionEditorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export default function TranscriptionEditor({
  value,
  onChange,
  disabled,
}: TranscriptionEditorProps) {
  return (
    <div className="panel">
      <h2 className="panel-title">Transcription</h2>
      <textarea
        className="transcription-editor"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Your transcript will appear here..."
        disabled={disabled}
      />
    </div>
  );
}
