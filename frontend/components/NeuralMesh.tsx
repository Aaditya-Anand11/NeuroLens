"use client";

import { useRef, useEffect, useCallback } from "react";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  pulsePhase: number;
  pulseSpeed: number;
  brightness: number;
}

interface NeuralMeshProps {
  /** 0-100 fatigue score — shifts color from cool cyan to warm red */
  intensity?: number;
  nodeCount?: number;
  className?: string;
  /** Controls overall opacity */
  opacity?: number;
}

/**
 * Algorithmic art: A generative neural-network-inspired particle mesh.
 * Nodes drift organically and connect when close, forming synaptic links.
 * The color temperature shifts from calm blue/cyan to stressed orange/red
 * based on the fatigue intensity prop.
 */
export default function NeuralMesh({
  intensity = 0,
  nodeCount = 40,
  className = "",
  opacity = 1,
}: NeuralMeshProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const getColor = useCallback(
    (alpha: number) => {
      const t = Math.min(intensity / 100, 1);
      // Calm: green-teal (0, 229, 160) → Stressed: red (255, 77, 106)
      const r = Math.round(lerp(0, 255, t));
      const g = Math.round(lerp(229, 77, t));
      const b = Math.round(lerp(160, 106, t));
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    },
    [intensity]
  );

  const initNodes = useCallback(
    (w: number, h: number) => {
      const nodes: Node[] = [];
      for (let i = 0; i < nodeCount; i++) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          radius: 1.5 + Math.random() * 2,
          pulsePhase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.5 + Math.random() * 1.5,
          brightness: 0.3 + Math.random() * 0.7,
        });
      }
      nodesRef.current = nodes;
    },
    [nodeCount]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(dpr, dpr);

      if (nodesRef.current.length === 0) {
        initNodes(rect.width, rect.height);
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const connectionDistance = 120;

    const animate = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) {
        animRef.current = requestAnimationFrame(animate);
        return;
      }
      const w = rect.width;
      const h = rect.height;
      timeRef.current += 0.016;
      const time = timeRef.current;

      ctx.clearRect(0, 0, w, h);

      const nodes = nodesRef.current;

      // Update positions with organic drift
      for (const node of nodes) {
        // Add subtle sinusoidal drift for organic movement
        const driftX = Math.sin(time * 0.3 + node.pulsePhase) * 0.05;
        const driftY = Math.cos(time * 0.25 + node.pulsePhase * 1.3) * 0.05;

        node.x += node.vx + driftX;
        node.y += node.vy + driftY;

        // Soft boundary wrap
        if (node.x < -20) node.x = w + 20;
        if (node.x > w + 20) node.x = -20;
        if (node.y < -20) node.y = h + 20;
        if (node.y > h + 20) node.y = -20;
      }

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < connectionDistance) {
            const alpha = (1 - dist / connectionDistance) * 0.15 * opacity;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = getColor(alpha);
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      // Draw nodes
      for (const node of nodes) {
        const pulse = Math.sin(time * node.pulseSpeed + node.pulsePhase) * 0.5 + 0.5;
        const r = node.radius * (0.8 + pulse * 0.4);
        const alpha = node.brightness * (0.4 + pulse * 0.3) * opacity;

        // Glow
        ctx.beginPath();
        ctx.arc(node.x, node.y, r * 3, 0, Math.PI * 2);
        ctx.fillStyle = getColor(alpha * 0.15);
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = getColor(alpha);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, [getColor, initNodes, opacity]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{ opacity }}
    />
  );
}
