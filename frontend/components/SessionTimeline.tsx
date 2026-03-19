"use client";

import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart,
} from "recharts";

interface TimelineDataPoint {
  timestamp: string;
  cli_score: number;
  vision_score: number;
  eye_score: number;
  biometric_score: number;
  audio_score: number;
  fatigue_stage?: string;
}

interface InterventionEvent {
  timestamp: string;
  message: string;
  trigger_cli: number;
}

interface SessionTimelineProps {
  data: TimelineDataPoint[];
  interventions?: InterventionEvent[];
  showModalities?: boolean;
  height?: number;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const STAGE_THRESHOLDS = [
  { y: 30, label: "Alert", color: "#00e5a0" },
  { y: 55, label: "Borderline", color: "#ffb224" },
  { y: 75, label: "Fatigued", color: "#ff8c42" },
];

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className="rounded-xl p-3 min-w-[150px] border backdrop-blur-xl"
      style={{
        background: "rgba(12,14,20,0.95)",
        borderColor: "var(--border-medium)",
      }}
    >
      <p
        className="text-[10px] uppercase tracking-[0.1em] mb-2 font-medium"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </p>
      <div className="space-y-1.5">
        {payload.map((entry) => (
          <div
            key={entry.name}
            className="flex items-center justify-between gap-4 text-xs"
          >
            <div className="flex items-center gap-2">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span style={{ color: "var(--text-secondary)" }}>
                {entry.name}
              </span>
            </div>
            <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
              {entry.value.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const MODALITY_LEGEND = [
  { key: "cli", label: "CLI", color: "#00e5a0", solid: true },
  { key: "vision", label: "Vision", color: "#9d6eff", solid: false },
  { key: "eye", label: "Eye", color: "#4d8eff", solid: false },
  { key: "biometric", label: "Input", color: "#ffb224", solid: false },
  { key: "audio", label: "Audio", color: "#ff8c42", solid: false },
];

export default function SessionTimeline({
  data,
  interventions = [],
  showModalities = true,
  height = 300,
}: SessionTimelineProps) {
  const chartData = data.map((d) => ({
    ...d,
    time: formatTime(d.timestamp),
  }));

  if (chartData.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-48 text-center"
      >
        <svg
          className="w-8 h-8 mb-3"
          style={{ color: "var(--text-muted)" }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
          />
        </svg>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No data yet
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
          Start a session to begin tracking
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={chartData}
          margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
        >
          <defs>
            <linearGradient id="cliGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00e5a0" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#00e5a0" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.03)"
            vertical={false}
          />
          <XAxis
            dataKey="time"
            tick={{ fill: "#4e5268", fontSize: 10, fontFamily: "JetBrains Mono" }}
            tickLine={false}
            axisLine={{ stroke: "rgba(255,255,255,0.04)" }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "#4e5268", fontSize: 10, fontFamily: "JetBrains Mono" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />

          {STAGE_THRESHOLDS.map((t) => (
            <ReferenceLine
              key={t.label}
              y={t.y}
              stroke={t.color}
              strokeDasharray="8 4"
              strokeOpacity={0.12}
            />
          ))}

          <Area
            type="monotone"
            dataKey="cli_score"
            fill="url(#cliGrad)"
            stroke="none"
          />

          <Line
            type="monotone"
            dataKey="cli_score"
            stroke="#00e5a0"
            strokeWidth={2}
            dot={false}
            name="CLI"
          />

          {showModalities && (
            <>
              <Line type="monotone" dataKey="vision_score" stroke="#9d6eff" strokeWidth={1} dot={false} name="Vision" strokeDasharray="4 3" opacity={0.4} />
              <Line type="monotone" dataKey="eye_score" stroke="#4d8eff" strokeWidth={1} dot={false} name="Eye" strokeDasharray="4 3" opacity={0.4} />
              <Line type="monotone" dataKey="biometric_score" stroke="#ffb224" strokeWidth={1} dot={false} name="Input" strokeDasharray="4 3" opacity={0.4} />
              <Line type="monotone" dataKey="audio_score" stroke="#ff8c42" strokeWidth={1} dot={false} name="Audio" strokeDasharray="4 3" opacity={0.4} />
            </>
          )}

          {interventions.map((intervention, idx) => (
            <ReferenceLine
              key={`int-${idx}`}
              x={formatTime(intervention.timestamp)}
              stroke="#ff4d6a"
              strokeDasharray="3 3"
              strokeOpacity={0.5}
              label={{
                value: "!",
                position: "top",
                fill: "#ff4d6a",
                fontSize: 11,
                fontWeight: 700,
              }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center justify-center gap-5 mt-4 flex-wrap">
        {MODALITY_LEGEND.filter((item) => item.solid || showModalities).map(
          ({ key, label, color, solid }) => (
            <div key={key} className="flex items-center gap-1.5">
              <div
                className="w-3 h-[2px] rounded-full"
                style={{ backgroundColor: color, opacity: solid ? 1 : 0.5 }}
              />
              <span
                className="text-[10px] font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                {label}
              </span>
            </div>
          )
        )}
      </div>
    </div>
  );
}
