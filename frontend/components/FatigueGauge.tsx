"use client";

import { useMemo, useState, useEffect } from "react";

interface FatigueGaugeProps {
  score: number;
  stage: string;
  confidence: number;
}

const STAGE_CONFIG: Record<
  string,
  { color: string; glow: string; label: string }
> = {
  alert: { color: "#00e5a0", glow: "rgba(0,229,160,0.35)", label: "Alert" },
  borderline: {
    color: "#ffb224",
    glow: "rgba(255,178,36,0.35)",
    label: "Borderline",
  },
  fatigued: {
    color: "#ff8c42",
    glow: "rgba(255,140,66,0.35)",
    label: "Fatigued",
  },
  critical: {
    color: "#ff4d6a",
    glow: "rgba(255,77,106,0.4)",
    label: "Critical",
  },
};

export default function FatigueGauge({
  score,
  stage,
  confidence,
}: FatigueGaugeProps) {
  const config = STAGE_CONFIG[stage] || STAGE_CONFIG.alert;
  const clampedScore = Math.min(Math.max(score, 0), 100);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Arc: 270 degrees (3/4 circle), starting from bottom-left
  const { arcPath, bgArcPath } = useMemo(() => {
    const cx = 100,
      cy = 100,
      r = 78;
    const startAngle = 135; // bottom-left
    const totalAngle = 270;
    const endAngleScore = startAngle + (clampedScore / 100) * totalAngle;
    const endAngleFull = startAngle + totalAngle;

    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const arcPoint = (angle: number) => ({
      x: Math.round((cx + r * Math.cos(toRad(angle))) * 100) / 100,
      y: Math.round((cy + r * Math.sin(toRad(angle))) * 100) / 100,
    });

    const start = arcPoint(startAngle);
    const endScore = arcPoint(endAngleScore);
    const endFull = arcPoint(endAngleFull);
    const largeScore = endAngleScore - startAngle > 180 ? 1 : 0;
    const largeFull = endAngleFull - startAngle > 180 ? 1 : 0;

    return {
      arcPath: `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeScore} 1 ${endScore.x} ${endScore.y}`,
      bgArcPath: `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeFull} 1 ${endFull.x} ${endFull.y}`,
    };
  }, [clampedScore]);

  // Generate tick marks
  const ticks = useMemo(() => {
    const items = [];
    const cx = 100,
      cy = 100,
      r1 = 64,
      r2 = 68;
    const startAngle = 135,
      totalAngle = 270;
    for (let i = 0; i <= 20; i++) {
      const angle = startAngle + (i / 20) * totalAngle;
      const rad = (angle * Math.PI) / 180;
      const isMajor = i % 5 === 0;
      const innerR = isMajor ? r1 - 2 : r1;
      items.push({
        x1: Math.round((cx + innerR * Math.cos(rad)) * 100) / 100,
        y1: Math.round((cy + innerR * Math.sin(rad)) * 100) / 100,
        x2: Math.round((cx + r2 * Math.cos(rad)) * 100) / 100,
        y2: Math.round((cy + r2 * Math.sin(rad)) * 100) / 100,
        major: isMajor,
      });
    }
    return items;
  }, []);

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative w-52 h-52">
        {/* Outer glow */}
        <div
          className="absolute inset-[-20px] rounded-full blur-3xl transition-all duration-1000"
          style={{
            background: `radial-gradient(circle, ${config.glow}, transparent 70%)`,
            opacity: 0.4,
          }}
        />

        <svg
          className="w-full h-full relative z-10"
          viewBox="0 0 200 200"
        >
          {mounted && (
            <>
              {/* Tick marks */}
              {ticks.map((tick, i) => (
                <line
                  key={i}
                  x1={tick.x1}
                  y1={tick.y1}
                  x2={tick.x2}
                  y2={tick.y2}
                  stroke={tick.major ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)"}
                  strokeWidth={tick.major ? 1.5 : 0.8}
                  strokeLinecap="round"
                />
              ))}

              {/* Background arc */}
              <path
                d={bgArcPath}
                fill="none"
                stroke="rgba(255,255,255,0.04)"
                strokeWidth="6"
                strokeLinecap="round"
              />

              {/* Glow arc (behind main) */}
              <path
                d={arcPath}
                fill="none"
                stroke={config.color}
                strokeWidth="12"
                strokeLinecap="round"
                opacity={0.15}
                filter="url(#gauge-glow)"
                style={{
                  transition:
                    "d 0.8s cubic-bezier(0.4,0,0.2,1), stroke 0.5s",
                }}
              />

              {/* Main arc */}
              <path
                d={arcPath}
                fill="none"
                stroke={config.color}
                strokeWidth="5"
                strokeLinecap="round"
                style={{
                  transition:
                    "d 0.8s cubic-bezier(0.4,0,0.2,1), stroke 0.5s",
                }}
              />
            </>
          )}

          <defs>
            <filter
              id="gauge-glow"
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
            >
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
          <span
            className="text-[44px] font-bold font-mono tracking-tighter transition-colors duration-500 leading-none"
            style={{ color: config.color }}
          >
            {Math.round(clampedScore)}
          </span>
          <span
            className="text-[9px] uppercase tracking-[0.25em] mt-1.5"
            style={{ color: "var(--text-muted)" }}
          >
            CLI Score
          </span>
        </div>
      </div>

      {/* Stage badge */}
      <div
        className="px-4 py-1 rounded-full text-[11px] font-bold uppercase tracking-[0.15em] transition-all duration-500"
        style={{
          color: config.color,
          background: `${config.color}12`,
          border: `1px solid ${config.color}25`,
        }}
      >
        {config.label}
      </div>

      {/* Confidence */}
      <div className="flex items-center gap-3">
        <span
          className="text-[10px] uppercase tracking-[0.1em]"
          style={{ color: "var(--text-muted)" }}
        >
          Confidence
        </span>
        <div
          className="w-20 h-[3px] rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${confidence * 100}%`,
              background: config.color,
              opacity: 0.7,
            }}
          />
        </div>
        <span
          className="text-[11px] font-mono"
          style={{ color: "var(--text-secondary)" }}
        >
          {Math.round(confidence * 100)}%
        </span>
      </div>
    </div>
  );
}
