import React, { useRef, useState, useEffect } from 'react';
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
}

const BOARD_SIZE = 500;
const PADDING = 25;
const GRID_SPACING = (BOARD_SIZE - PADDING * 2) / 14;

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
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [draggedStoneId, setDraggedStoneId] = useState<number | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);

  // Redraw board whenever stones or drag state updates
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);

    // 1. Draw Wood Background
    ctx.fillStyle = '#D2A05B';
    ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

    // 2. Draw Board Border Line
    ctx.strokeStyle = '#9C7040';
    ctx.lineWidth = 2;
    ctx.strokeRect(PADDING, PADDING, BOARD_SIZE - PADDING * 2, BOARD_SIZE - PADDING * 2);

    // 3. Draw Grid Lines
    ctx.lineWidth = 1;
    for (let i = 1; i < 14; i++) {
      const pos = PADDING + i * GRID_SPACING;

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(pos, PADDING);
      ctx.lineTo(pos, BOARD_SIZE - PADDING);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(PADDING, pos);
      ctx.lineTo(BOARD_SIZE - PADDING, pos);
      ctx.stroke();
    }

    // 4. Draw standard Go board dots (Hwajeom)
    const dots = [3, 7, 11];
    ctx.fillStyle = '#9C7040';
    dots.forEach((row) => {
      dots.forEach((col) => {
        // Only draw center (7,7) and 4 corner dots
        if (row === 7 && col !== 7) return;
        if (col === 7 && row !== 7) return;
        ctx.beginPath();
        ctx.arc(
          PADDING + col * GRID_SPACING,
          PADDING + row * GRID_SPACING,
          3.5,
          0,
          Math.PI * 2
        );
        ctx.fill();
      });
    });

    // 5. Draw Aiming Line/Arrow (if dragging and not in placement phase)
    if (!isPlacementPhase && draggedStoneId !== null && dragStart && dragCurrent) {
      const activeStone = stones.find((s) => s.id === draggedStoneId);
      if (activeStone) {
        const dx = dragStart.x - dragCurrent.x;
        const dy = dragStart.y - dragCurrent.y;
        const dragDist = Math.sqrt(dx * dx + dy * dy);

        if (dragDist > 5) {
          // Cap maximum drag distance at 150px
          const maxDrag = 150;
          const ratio = Math.min(dragDist / maxDrag, 1);
          const aimLength = ratio * 120; // Max arrow draw length
          const angle = Math.atan2(dy, dx);

          // Target point of arrow (flick direction is opposite of drag)
          const targetX = activeStone.x + Math.cos(angle) * aimLength;
          const targetY = activeStone.y + Math.sin(angle) * aimLength;

          // Draw dotted drag line
          ctx.beginPath();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 2;
          ctx.moveTo(activeStone.x, activeStone.y);
          ctx.lineTo(dragCurrent.x, dragCurrent.y);
          ctx.stroke();
          ctx.setLineDash([]); // Reset dash

          // Draw firing arrow
          ctx.beginPath();
          ctx.strokeStyle = '#ad1d1d';
          ctx.lineWidth = 3 + ratio * 3; // Thicker arrow for higher power
          ctx.moveTo(activeStone.x, activeStone.y);
          ctx.lineTo(targetX, targetY);
          ctx.stroke();

          // Arrow head
          const headlen = 8 + ratio * 4;
          ctx.beginPath();
          ctx.fillStyle = '#ad1d1d';
          ctx.moveTo(targetX, targetY);
          ctx.lineTo(
            targetX - headlen * Math.cos(angle - Math.PI / 6),
            targetY - headlen * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(
            targetX - headlen * Math.cos(angle + Math.PI / 6),
            targetY - headlen * Math.sin(angle + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // 6. Draw Stones
    stones.forEach((stone) => {
      if (!stone.active) return;

      // Draw shadow
      ctx.beginPath();
      ctx.arc(stone.x + 2, stone.y + 3, stone.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fill();

      // Draw stone body
      ctx.beginPath();
      ctx.arc(stone.x, stone.y, stone.radius, 0, Math.PI * 2);

      const grad = ctx.createRadialGradient(
        stone.x - stone.radius * 0.3,
        stone.y - stone.radius * 0.3,
        stone.radius * 0.1,
        stone.x,
        stone.y,
        stone.radius
      );

      if (stone.color === 'black') {
        grad.addColorStop(0, '#555555');
        grad.addColorStop(1, '#1A1A1A');
        ctx.fillStyle = grad;
        ctx.fill();
      } else {
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.8, '#F0F0F0');
        grad.addColorStop(1, '#D0D0D0');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = '#B0B0B0';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Draw highlight to make it look 3D
      ctx.beginPath();
      ctx.arc(
        stone.x - stone.radius * 0.25,
        stone.y - stone.radius * 0.25,
        stone.radius * 0.2,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fill();
    });
  }, [stones, draggedStoneId, dragStart, dragCurrent]);

  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Map screen coordinates back to canvas dimensions (500x500)
    const x = ((clientX - rect.left) / rect.width) * BOARD_SIZE;
    const y = ((clientY - rect.top) / rect.height) * BOARD_SIZE;

    return { x, y };
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (isSimulating || winner) return;
    if (!isPlacementPhase && currentPlayer !== humanColor) return;

    const coords = getCanvasCoords(e);
    if (!coords) return;

    // Find if we clicked on a stone of humanColor
    const clickedStone = stones.find((s) => {
      if (!s.active || s.isFalling || s.color !== humanColor) return false;
      const dist = Math.sqrt((s.x - coords.x) ** 2 + (s.y - coords.y) ** 2);
      return dist <= s.radius;
    });

    if (clickedStone) {
      // Prevent scrolling on touch devices during active dragging
      if (e.cancelable) {
        e.preventDefault();
      }
      setDraggedStoneId(clickedStone.id);
      setDragStart(coords);
      setDragCurrent(coords);
      if (onDragStateChange) {
        onDragStateChange(true);
      }
    }
  };

  const handleEnd = () => {
    if (draggedStoneId === null || !dragStart || !dragCurrent) return;

    if (!isPlacementPhase) {
      const dx = dragStart.x - dragCurrent.x;
      const dy = dragStart.y - dragCurrent.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 5) {
        // Aim power coefficient (scaled from drag pixels to shooting velocity)
        const powerFactor = 0.16;
        // Cap maximum launch speed
        const maxDrag = 150;
        let vx = dx * powerFactor;
        let vy = dy * powerFactor;
        const speed = Math.sqrt(vx * vx + vy * vy);
        const maxSpeed = maxDrag * powerFactor;

        if (speed > maxSpeed) {
          vx = (vx / speed) * maxSpeed;
          vy = (vy / speed) * maxSpeed;
        }

        shoot(draggedStoneId, vx, vy);
      }
    }

    setDraggedStoneId(null);
    setDragStart(null);
    setDragCurrent(null);
    if (onDragStateChange) {
      onDragStateChange(false);
    }
  };

  useEffect(() => {
    if (draggedStoneId === null) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      const coords = getCanvasCoords(e as any);
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
      if (e.cancelable) {
        e.preventDefault();
      }
      const coords = getCanvasCoords(e as any);
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

    const handleWindowMouseUp = () => {
      handleEnd();
    };

    const handleWindowTouchEnd = () => {
      handleEnd();
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    window.addEventListener('touchmove', handleWindowTouchMove, { passive: false });
    window.addEventListener('touchend', handleWindowTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.removeEventListener('touchmove', handleWindowTouchMove);
      window.removeEventListener('touchend', handleWindowTouchEnd);
    };
  }, [draggedStoneId, dragStart, dragCurrent]);

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
