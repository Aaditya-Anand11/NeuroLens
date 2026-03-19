"use client";

import { useRef, useEffect } from "react";

interface WaveformRingProps {
  /** 0-100 score that affects wave amplitude */
  score?: number;
  /** Size in pixels */
  size?: number;
  /** Primary color */
  color?: string;
  className?: string;
}

/**
 * Algorithmic art: An animated circular waveform that pulses
 * with organic noise-based deformations. Used as a decorative
 * element behind stats or as a hero visual.
 */
export default function WaveformRing({
  score = 50,
  size = 200,
  color = "#00e5a0",
  className = "",
}: WaveformRingProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const baseRadius = size * 0.32;

    // Simple noise function (no dependencies)
    const noise = (x: number, y: number) => {
      const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      return n - Math.floor(n);
    };

    const smoothNoise = (angle: number, time: number, octave: number) => {
      const x = Math.cos(angle) * octave + time;
      const y = Math.sin(angle) * octave + time;
      const n0 = noise(Math.floor(x), Math.floor(y));
      const n1 = noise(Math.floor(x) + 1, Math.floor(y));
      const n2 = noise(Math.floor(x), Math.floor(y) + 1);
      const n3 = noise(Math.floor(x) + 1, Math.floor(y) + 1);
      const fx = x - Math.floor(x);
      const fy = y - Math.floor(y);
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      return n0 * (1 - sx) * (1 - sy) + n1 * sx * (1 - sy) + n2 * (1 - sx) * sy + n3 * sx * sy;
    };

    let time = 0;

    const draw = () => {
      time += 0.008;
      ctx.clearRect(0, 0, size, size);

      const amplitude = (score / 100) * baseRadius * 0.25 + baseRadius * 0.05;
      const segments = 120;

      // Draw multiple rings with different phases
      for (let ring = 0; ring < 3; ring++) {
        const ringAlpha = (3 - ring) / 3 * 0.4;
        const ringOffset = ring * 0.3;
        const ringScale = 1 + ring * 0.08;

        ctx.beginPath();
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          const n1 = smoothNoise(angle * 2, time + ringOffset, 1) - 0.5;
          const n2 = smoothNoise(angle * 4, time * 0.7 + ringOffset, 2) - 0.5;
          const displacement = (n1 * 0.7 + n2 * 0.3) * amplitude;
          const r = baseRadius * ringScale + displacement;

          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = color.replace(")", `, ${ringAlpha})`).replace("rgb(", "rgba(");
        // Handle hex colors
        if (color.startsWith("#")) {
          const r = parseInt(color.slice(1, 3), 16);
          const g = parseInt(color.slice(3, 5), 16);
          const b = parseInt(color.slice(5, 7), 16);
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${ringAlpha})`;
        }
        ctx.lineWidth = ring === 0 ? 1.5 : 0.8;
        ctx.stroke();
      }

      // Center glow
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius * 0.6);
      if (color.startsWith("#")) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.05)`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      }
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(animRef.current);
  }, [score, size, color]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
