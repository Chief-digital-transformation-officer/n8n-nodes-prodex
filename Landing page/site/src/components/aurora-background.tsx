"use client";

import { useEffect, useRef } from "react";

const BLOBS = [
  { x: 0.15, y: 0.25, r: 0.38, hue: 165, speed: 0.00035 },
  { x: 0.82, y: 0.18, r: 0.32, hue: 280, speed: 0.00028 },
  { x: 0.55, y: 0.72, r: 0.42, hue: 195, speed: 0.00032 },
  { x: 0.3, y: 0.65, r: 0.28, hue: 45, speed: 0.0004 },
];

export function AuroraBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let raf = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#05080d";
      ctx.fillRect(0, 0, w, h);

      BLOBS.forEach((blob, i) => {
        const phase = frame * blob.speed + i * 2.1;
        const cx = (blob.x + Math.sin(phase) * 0.07) * w;
        const cy = (blob.y + Math.cos(phase * 0.85) * 0.05) * h;
        const radius = blob.r * Math.min(w, h);

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, `hsla(${blob.hue}, 85%, 55%, 0.2)`);
        grad.addColorStop(0.45, `hsla(${blob.hue}, 70%, 45%, 0.07)`);
        grad.addColorStop(1, "transparent");

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      });

      frame++;
      raf = requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 -z-30"
      aria-hidden
    />
  );
}
