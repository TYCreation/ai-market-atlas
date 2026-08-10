"use client";

import { useEffect, useRef } from "react";

type AtlasNode = {
  x: number;
  y: number;
  radius: number;
  phase: number;
  driftX: number;
  driftY: number;
  depth: number;
  accent: boolean;
};

function createNodes(): AtlasNode[] {
  let seed = 0x41_54_4c_41;
  const random = () => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    return seed / 0x1_00_00_00_00;
  };

  return Array.from({ length: 42 }, (_, index) => ({
    x: 0.04 + random() * 0.92,
    y: 0.06 + random() * 0.86,
    radius: 0.9 + random() * 1.8,
    phase: random() * Math.PI * 2,
    driftX: 4 + random() * 10,
    driftY: 3 + random() * 8,
    depth: 0.2 + random() * 0.8,
    accent: index % 11 === 4 || index % 13 === 8,
  }));
}

export function AmbientPointerGlow() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const glow = glowRef.current;
    if (!glow) return;
    const finePointer = window.matchMedia("(pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!finePointer.matches || reducedMotion.matches) return;

    let frame = 0;
    let targetX = window.innerWidth * 0.72;
    let targetY = window.innerHeight * 0.22;
    let currentX = targetX;
    let currentY = targetY;

    const render = () => {
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;
      glow.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
      frame = window.requestAnimationFrame(render);
    };
    const onPointerMove = (event: PointerEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
      glow.dataset.active = "true";
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    frame = window.requestAnimationFrame(render);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return <div className="ambient-pointer-glow" ref={glowRef} aria-hidden="true" />;
}

export function AtlasField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const nodes = createNodes();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const pointer = { x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5 };
    let width = 1;
    let height = 1;
    let frame = 0;

    const resize = () => {
      const bounds = host.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const positions = (time: number) =>
      nodes.map((node) => {
        const cursorX = (pointer.x - 0.5) * 22 * node.depth;
        const cursorY = (pointer.y - 0.5) * 16 * node.depth;
        return {
          ...node,
          px:
            node.x * width +
            Math.sin(time * 0.00022 + node.phase) * node.driftX +
            cursorX,
          py:
            node.y * height +
            Math.cos(time * 0.00018 + node.phase) * node.driftY +
            cursorY,
        };
      });

    const drawRadarArc = (
      centerX: number,
      centerY: number,
      radius: number,
      angle: number,
      alpha: number,
    ) => {
      const gradient = context.createLinearGradient(
        centerX - radius,
        centerY,
        centerX + radius,
        centerY,
      );
      gradient.addColorStop(0, `rgba(115, 225, 230, 0)`);
      gradient.addColorStop(0.65, `rgba(115, 225, 230, ${alpha * 0.45})`);
      gradient.addColorStop(1, `rgba(255, 138, 92, ${alpha})`);
      context.beginPath();
      context.arc(centerX, centerY, radius, angle, angle + Math.PI * 0.72);
      context.strokeStyle = gradient;
      context.lineWidth = 1;
      context.stroke();
    };

    const draw = (time: number) => {
      pointer.x += (pointer.targetX - pointer.x) * 0.055;
      pointer.y += (pointer.targetY - pointer.y) * 0.055;
      context.clearRect(0, 0, width, height);
      const points = positions(time);
      const linkDistance = Math.min(142, Math.max(96, width * 0.105));

      for (let left = 0; left < points.length; left += 1) {
        for (let right = left + 1; right < points.length; right += 1) {
          const dx = points[left].px - points[right].px;
          const dy = points[left].py - points[right].py;
          const distance = Math.hypot(dx, dy);
          if (distance >= linkDistance) continue;
          context.beginPath();
          context.moveTo(points[left].px, points[left].py);
          context.lineTo(points[right].px, points[right].py);
          context.strokeStyle = `rgba(115, 225, 230, ${
            (1 - distance / linkDistance) * 0.18
          })`;
          context.lineWidth = 0.7;
          context.stroke();
        }
      }

      const radarX = width * 0.78 + (pointer.x - 0.5) * 12;
      const radarY = height * 0.48 + (pointer.y - 0.5) * 8;
      drawRadarArc(radarX, radarY, Math.min(width, height) * 0.23, time * 0.00016, 0.34);
      drawRadarArc(
        radarX,
        radarY,
        Math.min(width, height) * 0.36,
        -time * 0.00011 + Math.PI,
        0.22,
      );

      for (const node of points) {
        context.beginPath();
        context.arc(node.px, node.py, node.radius * 3.8, 0, Math.PI * 2);
        context.fillStyle = node.accent
          ? "rgba(255, 138, 92, 0.07)"
          : "rgba(115, 225, 230, 0.065)";
        context.fill();
        context.beginPath();
        context.arc(node.px, node.py, node.radius, 0, Math.PI * 2);
        context.fillStyle = node.accent
          ? "rgba(255, 138, 92, 0.82)"
          : "rgba(115, 225, 230, 0.72)";
        context.fill();
      }
    };

    const animate = (time: number) => {
      draw(time);
      frame = window.requestAnimationFrame(animate);
    };
    const onPointerMove = (event: PointerEvent) => {
      const bounds = host.getBoundingClientRect();
      pointer.targetX = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
      pointer.targetY = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    };

    const observer = new ResizeObserver(() => {
      resize();
      if (reducedMotion) draw(2_400);
    });
    observer.observe(host);
    resize();

    if (reducedMotion) {
      draw(2_400);
    } else {
      if (finePointer) host.addEventListener("pointermove", onPointerMove, { passive: true });
      frame = window.requestAnimationFrame(animate);
    }

    return () => {
      observer.disconnect();
      host.removeEventListener("pointermove", onPointerMove);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas className="atlas-field" ref={canvasRef} aria-hidden="true" />;
}
