import { motion } from "framer-motion";
import { Mic, Square } from "lucide-react";

type ActionBubbleProps = {
  state: "idle" | "recording" | "saving" | "review";
  onStart: () => void;
  onStop: () => void;
};

export default function ActionBubble({ state, onStart, onStop }: ActionBubbleProps) {
  const isRecording = state === "recording";
  const isDisabled = state === "saving";

  return (
    <div className="action-bubble">
      <motion.button
        type="button"
        className={`bubble-button ${isRecording ? "recording" : ""}`}
        onClick={isRecording ? onStop : onStart}
        disabled={isDisabled}
        animate={
          isRecording
            ? {
                scale: [1, 1.05, 1],
                boxShadow: [
                  "0 0 20px rgba(255, 99, 132, 0.5)",
                  "0 0 28px rgba(255, 99, 132, 0.8)",
                  "0 0 20px rgba(255, 99, 132, 0.5)",
                ],
              }
            : { scale: 1 }
        }
        transition={{ duration: 1.4, repeat: isRecording ? Infinity : 0 }}
        aria-label={isRecording ? "Stop recording" : "Start recording"}
      >
        {isRecording ? <Square size={28} /> : <Mic size={28} />}
      </motion.button>
      <div className="action-bubble-label">
        {isRecording ? "Recording" : state === "saving" ? "Saving" : "Tap to record"}
      </div>
    </div>
  );
}
