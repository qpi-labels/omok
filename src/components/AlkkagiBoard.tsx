import React, { useRef, useState, useEffect, useCallback } from 'react';
import { AlkkagiStone } from '../hooks/useAlkkagi';

interface AlkkagiBoardProps {
  stones: AlkkagiStone[];
  currentPlayer: 'black' | 'white';
  humanColor: 'black' | 'white';
  isSimulating: boolean;
  winner: 'black' | 'white' | null;
  shoot: (stoneId: number, vx: number, vy: number) => void;
  isPlacementPhase?: boolean;
  setStones?: React.Dispatch<React.SetStateAction<AlkkagiStone[]>>;
  onDragStateChange?: (dragging: boolean) => void;
  /** Collision events from the physics engine (for visual effects) */
  collisionEvents?: { x: number; y: number; intensity: number }[];
}

const BOARD_SIZE = 500;
const PADDING = 25;
const GRID_SPACING = (BOARD_SIZE - PADDING * 2) / 14;
const MAX_DRAG = 160;
const POWER_FACTOR = 0.145;

// ─── Particle system ──────────────────────────────────────────────────────
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; // 0–1
  maxLife: number;
  size: number;
  color: string;
}

export const AlkkagiBoard: React.FC<AlkkagiBoardProps> = ({
  stones,
  currentPlayer,
  humanColor,
  isSimulating,
  winner,
  shoot,
  isPlacementPhase = false,
  setStones,
  onDragStateChange,
  collisionEvents = [],
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [draggedStoneId, setDraggedStoneId] = useState<number | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number | null>(null);

  // ── Spawn particles on collision events ──────────────────────────────────
  useEffect(() => {
    if (!collisionEvents || collisionEvents.length === 0) return;
    for (const ev of collisionEvents) {
      const count = Math.ceil(ev.intensity * 12) + 4;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (0.8 + Math.random() * 2) * (0.5 + ev.intensity);
        particlesRef.current.push({
          x: ev.x, y: ev.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          maxLife: 0.8 + Math.random() * 0.7,
          size: 1.5 + Math.random() * 2.5 * ev.intensity,
          color: Math.random() > 0.5 ? '#FFD700' : '#FF8C00',
        });
      }
    }
  }, [collisionEvents]);

  // ── Aiming line trajectory preview ───────────────────────────────────────
  const drawAimPreview = useCallback((
    ctx: CanvasRenderingContext2D,
    stone: AlkkagiStone,
    dx: number,
    dy: number,
    dragDist: number,
  ) => {
    const ratio = Math.min(dragDist / MAX_DRAG, 1);
    const speed = ratio * MAX_DRAG * POWER_FACTOR;
    const angle = Math.atan2(dy, dx);
    const vx0 = Math.cos(angle) * speed;
    const vy0 = Math.sin(angle) * speed;

    // Simulate a few frames to draw trajectory
    const FRICTION_SIM = 0.978;
    let px = stone.x, py = stone.y;
    let pvx = vx0, pvy = vy0;
    const dots: { x: number; y: number; a: number }[] = [];

    for (let i = 0; i < 60; i++) {
      px += pvx;
      py += pvy;
      pvx *= FRICTION_SIM;
      pvy *= FRICTION_SIM;
      if (i % 4 === 0) dots.push({ x: px, y: py, a: 1 - i / 60 });
      if (Math.sqrt(pvx * pvx + pvy * pvy) < 0.3) break;
    }

    // Draw trajectory dots
    ctx.save();
    for (const dot of dots) {
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, 2.5 * dot.a, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 60, 60, ${dot.a * 0.55})`;
      ctx.fill();
    }
    ctx.restore();

    // Draw drag pull line
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(stone.x, stone.y);
    ctx.lineTo(stone.x - dx, stone.y - dy); // pull-back direction
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Draw launch arrow
    const arrowLen = ratio * 90;
    const arrowTipX = stone.x + Math.cos(angle) * arrowLen;
    const arrowTipY = stone.y + Math.sin(angle) * arrowLen;
    const arrowWidth = 2.5 + ratio * 3;

    ctx.save();
    ctx.strokeStyle = `rgba(220, 30, 30, ${0.6 + ratio * 0.4})`;
    ctx.lineWidth = arrowWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(stone.x, stone.y);
    ctx.lineTo(arrowTipX, arrowTipY);
    ctx.stroke();

    // Arrowhead
    const headLen = 8 + ratio * 6;
    ctx.fillStyle = `rgba(220, 30, 30, ${0.6 + ratio * 0.4})`;
    ctx.beginPath();
    ctx.moveTo(arrowTipX, arrowTipY);
    ctx.lineTo(
      arrowTipX - headLen * Math.cos(angle - Math.PI / 6),
      arrowTipY - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      arrowTipX - headLen * Math.cos(angle + Math.PI / 6),
      arrowTipY - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Power gauge bar (bottom of canvas)
    const barX = stone.x - 30;
    const barY = stone.y + stone.radius + 12;
    const barW = 60;
    const barH = 6;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 3);
    ctx.fill();

    const powerColor = ratio < 0.4 ? '#4CAF50' : ratio < 0.75 ? '#FFC107' : '#F44336';
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0, powerColor);
    grad.addColorStop(1, '#fff');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * ratio, barH, 3);
    ctx.fill();
    ctx.restore();
  }, []);

  // ── Main draw loop ────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);

    // 1. Wood background with texture-like gradient
    const bgGrad = ctx.createLinearGradient(0, 0, BOARD_SIZE, BOARD_SIZE);
    bgGrad.addColorStop(0, '#D4A055');
    bgGrad.addColorStop(0.5, '#C8943D');
    bgGrad.addColorStop(1, '#B8813A');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

    // Subtle wood grain stripes
    ctx.save();
    for (let i = 0; i < 12; i++) {
      const y = i * (BOARD_SIZE / 11);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(BOARD_SIZE, y + 20);
      ctx.strokeStyle = `rgba(100, 60, 0, 0.04)`;
      ctx.lineWidth = 18;
      ctx.stroke();
    }
    ctx.restore();

    // 2. Board border
    ctx.strokeStyle = '#7A5530';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(PADDING, PADDING, BOARD_SIZE - PADDING * 2, BOARD_SIZE - PADDING * 2);

    // 3. Grid lines
    ctx.strokeStyle = '#9C7040';
    ctx.lineWidth = 0.8;
    for (let i = 1; i < 14; i++) {
      const pos = PADDING + i * GRID_SPACING;
      ctx.beginPath();
      ctx.moveTo(pos, PADDING);
      ctx.lineTo(pos, BOARD_SIZE - PADDING);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(PADDING, pos);
      ctx.lineTo(BOARD_SIZE - PADDING, pos);
      ctx.stroke();
    }

    // 4. Star points
    ctx.fillStyle = '#7A5530';
    [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]].forEach(([row, col]) => {
      ctx.beginPath();
      ctx.arc(PADDING + col * GRID_SPACING, PADDING + row * GRID_SPACING, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // 5. Aiming preview
    if (!isPlacementPhase && draggedStoneId !== null && dragStart && dragCurrent) {
      const activeStone = stones.find((s) => s.id === draggedStoneId);
      if (activeStone) {
        const dx = dragStart.x - dragCurrent.x;
        const dy = dragStart.y - dragCurrent.y;
        const dragDist = Math.sqrt(dx * dx + dy * dy);
        if (dragDist > 5) {
          drawAimPreview(ctx, activeStone, dx, dy, dragDist);
        }
      }
    }

    // 6. Draw stones
    stones.forEach((stone) => {
      if (!stone.active) return;

      const r = stone.radius;
      const scale = stone.scale ?? 1;
      const hitFlash = stone.hitFlash ?? 0;

      ctx.save();
      ctx.translate(stone.x, stone.y);
      ctx.rotate(stone.angle ?? 0);
      ctx.scale(scale, scale);

      // Shadow
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 4;

      // Stone body gradient
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);

      if (stone.color === 'black') {
        const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.05, 0, 0, r);
        grad.addColorStop(0, hitFlash > 0.1 ? `rgba(${120 + Math.round(hitFlash * 80)}, ${50 + Math.round(hitFlash * 30)}, 30, 1)` : '#5A5A5A');
        grad.addColorStop(1, '#0F0F0F');
        ctx.fillStyle = grad;
      } else {
        const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.05, 0, 0, r);
        grad.addColorStop(0, hitFlash > 0.1 ? `rgba(255, ${220 - Math.round(hitFlash * 60)}, ${180 - Math.round(hitFlash * 80)}, 1)` : '#FFFFFF');
        grad.addColorStop(0.7, '#E8E8E8');
        grad.addColorStop(1, '#C0C0C0');
        ctx.fillStyle = grad;
      }
      ctx.fill();

      // Outline for white stones
      if (stone.color === 'white') {
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = hitFlash > 0.1 ? `rgba(255,120,40,${hitFlash})` : '#A0A0A0';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Hit flash ring
      if (hitFlash > 0.05) {
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = `rgba(255, 180, 30, ${hitFlash * 0.8})`;
        ctx.lineWidth = 2.5 + hitFlash * 3;
        ctx.beginPath();
        ctx.arc(0, 0, r + 1 + hitFlash * 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Specular highlight
      ctx.shadowColor = 'transparent';
      const highlightGrad = ctx.createRadialGradient(-r * 0.28, -r * 0.28, 0, -r * 0.28, -r * 0.28, r * 0.45);
      highlightGrad.addColorStop(0, 'rgba(255,255,255,0.55)');
      highlightGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath();
      ctx.arc(-r * 0.2, -r * 0.2, r * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = highlightGrad;
      ctx.fill();

      // Secondary smaller highlight
      ctx.beginPath();
      ctx.arc(-r * 0.12, -r * 0.12, r * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fill();

      ctx.restore();

      // Dragged stone selection ring (outside transform for correct positioning)
      if (draggedStoneId === stone.id) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 220, 0, 0.85)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(stone.x, stone.y, r + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    });

    // 7. Update & draw particles
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);
    for (const p of particlesRef.current) {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= 1 / (p.maxLife * 60);

      const alpha = Math.max(0, p.life);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fillStyle = p.color.replace(')', `, ${alpha})`).replace('rgb', 'rgba');
      // Fallback: just use hex with globalAlpha
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    animFrameRef.current = requestAnimationFrame(draw);
  }, [stones, draggedStoneId, dragStart, dragCurrent, drawAimPreview, isPlacementPhase]);

  // Start/stop the render loop
  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [draw]);

  // ── Input handling ────────────────────────────────────────────────────────
  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    let clientX = 0, clientY = 0;

    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }

    const x = ((clientX - rect.left) / rect.width) * BOARD_SIZE;
    const y = ((clientY - rect.top) / rect.height) * BOARD_SIZE;
    return { x, y };
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (isSimulating || winner) return;
    if (!isPlacementPhase && currentPlayer !== humanColor) return;

    const coords = getCanvasCoords(e);
    if (!coords) return;

    const clickedStone = stones.find((s) => {
      if (!s.active || s.isFalling || s.color !== humanColor) return false;
      const dist = Math.sqrt((s.x - coords.x) ** 2 + (s.y - coords.y) ** 2);
      return dist <= s.radius + 4; // slightly easier to click
    });

    if (clickedStone) {
      if (e.cancelable) e.preventDefault();
      setDraggedStoneId(clickedStone.id);
      setDragStart(coords);
      setDragCurrent(coords);
      onDragStateChange?.(true);
    }
  };

  const handleEnd = useCallback(() => {
    if (draggedStoneId === null || !dragStart || !dragCurrent) return;

    if (!isPlacementPhase) {
      const dx = dragStart.x - dragCurrent.x;
      const dy = dragStart.y - dragCurrent.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 5) {
        const ratio = Math.min(dist / MAX_DRAG, 1);
        const speed = ratio * MAX_DRAG * POWER_FACTOR;
        const angle = Math.atan2(dy, dx);
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        shoot(draggedStoneId, vx, vy);
      }
    }

    setDraggedStoneId(null);
    setDragStart(null);
    setDragCurrent(null);
    onDragStateChange?.(false);
  }, [draggedStoneId, dragStart, dragCurrent, isPlacementPhase, shoot, onDragStateChange]);

  useEffect(() => {
    if (draggedStoneId === null) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      const coords = getCanvasCoords(e);
      if (coords) {
        if (isPlacementPhase && setStones && draggedStoneId !== null) {
          setStones((prev) =>
            prev.map((s) => {
              if (s.id === draggedStoneId) {
                let y = coords.y;
                if (humanColor === 'black') {
                  y = Math.max(250 + s.radius, Math.min(500 - s.radius, y));
                } else {
                  y = Math.max(s.radius, Math.min(250 - s.radius, y));
                }
                const x = Math.max(s.radius, Math.min(500 - s.radius, coords.x));
                return { ...s, x, y };
              }
              return s;
            })
          );
        }
        setDragCurrent(coords);
      }
    };

    const handleWindowTouchMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      const coords = getCanvasCoords(e);
      if (coords) {
        if (isPlacementPhase && setStones && draggedStoneId !== null) {
          setStones((prev) =>
            prev.map((s) => {
              if (s.id === draggedStoneId) {
                let y = coords.y;
                if (humanColor === 'black') {
                  y = Math.max(250 + s.radius, Math.min(500 - s.radius, y));
                } else {
                  y = Math.max(s.radius, Math.min(250 - s.radius, y));
                }
                const x = Math.max(s.radius, Math.min(500 - s.radius, coords.x));
                return { ...s, x, y };
              }
              return s;
            })
          );
        }
        setDragCurrent(coords);
      }
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleWindowTouchMove, { passive: false });
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleWindowTouchMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [draggedStoneId, dragStart, dragCurrent, handleEnd, isPlacementPhase, setStones, humanColor]);

  return (
    <div
      className="board-wrapper"
      style={{
        width: '100%',
        maxWidth: '500px',
        padding: '0',
        aspectRatio: '1',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        width={BOARD_SIZE}
        height={BOARD_SIZE}
        onMouseDown={handleStart}
        onTouchStart={handleStart}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: isSimulating || winner || currentPlayer !== humanColor ? 'default' : 'crosshair',
        }}
      />
    </div>
  );
};
