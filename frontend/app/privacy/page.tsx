"use client";

import { useState } from "react";
import NeuralMesh from "../../components/NeuralMesh";
import { api } from "../../lib/api";

export default function PrivacyPage() {
  const [wipeStatus, setWipeStatus] = useState<"idle" | "confirming" | "wiping" | "done" | "error">("idle");
  const [wipeError, setWipeError] = useState<string | null>(null);

  async function handleWipeData() {
    if (wipeStatus === "idle") {
      setWipeStatus("confirming");
      return;
    }
    if (wipeStatus === "confirming") {
      try {
        setWipeStatus("wiping");
        await api.wipeData();
        setWipeStatus("done");
      } catch (err) {
        setWipeError(err instanceof Error ? err.message : "Failed to wipe data");
        setWipeStatus("error");
      }
    }
  }

  const sections = [
    {
      title: "What Is Collected",
      items: [
        "Webcam frames processed in real-time for facial landmarks, blink rate, PERCLOS, and head pose. Frames are never saved.",
        "Microphone audio for voice stress analysis: speech rate, F0, tremor, silence ratio. Audio is never saved.",
        "Keyboard event timing (not characters) for typing rhythm analysis.",
        "Mouse coordinates for behavioral biometrics. Only movement patterns are stored, not screen content.",
      ],
    },
    {
      title: "How Data Is Stored",
      items: [
        "All data stored locally in SQLite on your machine. No cloud, no sync.",
        "Only computed metrics are persisted: fatigue scores, modality sub-scores, intervention text.",
        "All ML inference runs locally via ONNX Runtime. No model calls leave your device.",
        "Optional Gemini API sends only computed scores, never raw sensor data.",
      ],
    },
    {
      title: "What Is Never Collected",
      items: [
        "Keystroke content (only timing patterns).",
        "Video or audio recordings.",
        "Screen content, browsing history, or app usage.",
        "No PII required. No account, no email, no tracking.",
      ],
    },
    {
      title: "Third-Party Services",
      items: [
        "Gemini 1.5 Flash: Optional. Only computed fatigue metrics sent. Requires GEMINI_API_KEY.",
        "No analytics. No telemetry. No crash reporting.",
      ],
    },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="heading-lg">Privacy</h1>
        <p className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>
          Privacy-first architecture. Your data never leaves your device.
        </p>
      </div>

      <div className="accent-line" />

      {/* Privacy banner */}
      <div className="gradient-border">
        <div className="surface p-6 relative overflow-hidden">
          <div className="absolute inset-0 opacity-20">
            <NeuralMesh intensity={5} nodeCount={12} opacity={0.2} />
          </div>
          <div className="relative z-10 flex items-start gap-4">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(0,229,160,0.08)" }}
            >
              <svg className="w-4.5 h-4.5" style={{ color: "var(--accent-green)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--accent-green)" }}>
                Zero cloud dependency
              </h3>
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                All ML inference runs locally via ONNX Runtime. No video, audio, or biometric data
                ever leaves your machine. The only external call is optional Gemini integration
                for generating intervention text.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content sections */}
      {sections.map((section, idx) => (
        <div
          key={section.title}
          className="surface p-6 animate-slide-up"
          style={{ animationDelay: `${idx * 60}ms` }}
        >
          <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
            {section.title}
          </h2>
          <ul className="space-y-2">
            {section.items.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                <span className="mt-2 flex-shrink-0 w-1 h-1 rounded-full" style={{ background: "var(--text-muted)" }} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* Wipe section */}
      <div className="surface p-6" style={{ borderColor: "rgba(255,77,106,0.1)" }}>
        <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
          Wipe All Data
        </h2>
        <p className="text-[13px] mb-4" style={{ color: "var(--text-muted)" }}>
          Permanently delete all sessions, records, and calibration profiles.
        </p>

        {wipeStatus === "done" ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--accent-green)" }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            All data wiped.
          </div>
        ) : wipeStatus === "error" ? (
          <p className="text-sm" style={{ color: "var(--accent-red)" }}>{wipeError}</p>
        ) : (
          <button
            type="button"
            onClick={handleWipeData}
            disabled={wipeStatus === "wiping"}
            className={
              wipeStatus === "confirming"
                ? "btn-danger"
                : wipeStatus === "wiping"
                ? "opacity-50 cursor-not-allowed btn-secondary"
                : "btn-secondary"
            }
            style={
              wipeStatus === "idle"
                ? { borderColor: "rgba(255,77,106,0.2)", color: "var(--accent-red)" }
                : undefined
            }
          >
            {wipeStatus === "idle"
              ? "Wipe All Data"
              : wipeStatus === "confirming"
              ? "Click Again to Confirm"
              : "Wiping..."}
          </button>
        )}
      </div>
    </div>
  );
}
