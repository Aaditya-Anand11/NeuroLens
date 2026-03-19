"use client";

import { useState, useEffect } from "react";

interface InterventionCardProps {
  message: string;
  type: string;
  modality: string;
  severity: "info" | "medium" | "high" | "critical";
  generatedBy: string;
  onDismiss: () => void;
}

const SEVERITY_COLORS: Record<string, { accent: string; bg: string }> = {
  info: { accent: "var(--accent-blue)", bg: "rgba(77,142,255,0.06)" },
  medium: { accent: "var(--accent-amber)", bg: "rgba(255,178,36,0.06)" },
  high: { accent: "#ff8c42", bg: "rgba(255,140,66,0.06)" },
  critical: { accent: "var(--accent-red)", bg: "rgba(255,77,106,0.06)" },
};

const MODALITY_LABELS: Record<string, string> = {
  vision: "Face",
  eye: "Eyes",
  biometric: "Input",
  audio: "Voice",
  fusion: "Multi",
  time: "Time",
};

export default function InterventionCard({
  message,
  type,
  modality,
  severity,
  generatedBy,
  onDismiss,
}: InterventionCardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const colors = SEVERITY_COLORS[severity] || SEVERITY_COLORS.info;

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(onDismiss, 250);
  };

  return (
    <div
      className="transition-all duration-300 ease-out rounded-xl overflow-hidden"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(8px)",
        background: colors.bg,
        borderLeft: `2px solid ${colors.accent}`,
      }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Tags row */}
            <div className="flex items-center gap-2 mb-2.5">
              <span
                className="text-[10px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded"
                style={{ color: colors.accent, background: `${colors.accent}15` }}
              >
                {MODALITY_LABELS[modality] || modality}
              </span>
              {generatedBy === "gemini" && (
                <span
                  className="text-[9px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded"
                  style={{
                    color: "var(--accent-violet)",
                    background: "rgba(157,110,255,0.12)",
                  }}
                >
                  AI
                </span>
              )}
            </div>

            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              {message}
            </p>

            <span
              className="text-[10px] uppercase tracking-[0.08em] mt-2.5 inline-block"
              style={{ color: "var(--text-muted)" }}
            >
              {type.replace(/_/g, " ")}
            </span>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 rounded-lg transition-colors hover:bg-white/[0.05]"
            style={{ color: "var(--text-muted)" }}
            aria-label="Dismiss"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
