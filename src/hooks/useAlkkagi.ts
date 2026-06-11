import { useState, useCallback, useEffect, useRef } from 'react';

export interface AlkkagiStone {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: 'black' | 'white';
  radius: number;
  active: boolean;
  isFalling: boolean;
}

const BOARD_SIZE = 500;
const STONE_RADIUS = 16;
const FRICTION = 0.985;
const MIN_SPEED = 0.15;

export const useAlkkagi = (
  isPracticeMode: boolean,
  twoPlayerMode: boolean,
  initialStoneCount: number = 7,
  onGameEnd?: (winner: 'black' | 'white', turnCount: number) => void
) => {
  const [stones, setStones] = useState<AlkkagiStone[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<'black' | 'white'>('black');
  const [winner, setWinner] = useState<'black' | 'white' | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [turnCount, setTurnCount] = useState(0);

  const onGameEndRef = useRef(onGameEnd);
  useEffect(() => {
    onGameEndRef.current = onGameEnd;
  }, [onGameEnd]);

  const simulationRef = useRef<boolean>(false);
  const animationFrameId = useRef<number | null>(null);

  const initGame = useCallback(() => {
    const initialStones: AlkkagiStone[] = [];
    let idCounter = 0;

    // Place Black stones at the bottom
    for (let i = 0; i < initialStoneCount; i++) {
      initialStones.push({
        id: idCounter++,
        x: initialStoneCount === 1 
          ? BOARD_SIZE / 2 
          : 50 + i * (BOARD_SIZE - 100) / (initialStoneCount - 1),
        y: BOARD_SIZE - 60,
        vx: 0,
        vy: 0,
        color: 'black',
        radius: STONE_RADIUS,
        active: true,
        isFalling: false,
      });
    }

    // Place White stones at the top
    for (let i = 0; i < initialStoneCount; i++) {
      initialStones.push({
        id: idCounter++,
        x: initialStoneCount === 1 
          ? BOARD_SIZE / 2 
          : 50 + i * (BOARD_SIZE - 100) / (initialStoneCount - 1),
        y: 60,
        vx: 0,
        vy: 0,
        color: 'white',
        radius: STONE_RADIUS,
        active: true,
        isFalling: false,
      });
    }

    setStones(initialStones);
    setCurrentPlayer('black');
    setWinner(null);
    setIsSimulating(false);
    simulationRef.current = false;
    setTurnCount(0);
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
  }, [initialStoneCount]);

  // Run initial game setup
  useEffect(() => {
    initGame();
    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, [initGame]);

  const updatePhysics = useCallback(() => {
    setStones((prevStones) => {
      let nextStones = prevStones.map((s) => ({ ...s }));

      // 1. Move stones and apply friction
      for (let s of nextStones) {
        if (!s.active) continue;

        if (s.isFalling) {
          s.radius -= 0.8;
          if (s.radius <= 0) {
            s.radius = 0;
            s.active = false;
          }
          // Continue moving slightly while falling
          s.x += s.vx;
          s.y += s.vy;
          s.vx *= 0.9;
          s.vy *= 0.9;
          continue;
        }

        s.x += s.vx;
        s.y += s.vy;
        s.vx *= FRICTION;
        s.vy *= FRICTION;

        if (Math.abs(s.vx) < MIN_SPEED) s.vx = 0;
        if (Math.abs(s.vy) < MIN_SPEED) s.vy = 0;

        // Boundary Check (Fall off)
        // Check if the center of the stone goes outside the board
        if (s.x < 0 || s.x > BOARD_SIZE || s.y < 0 || s.y > BOARD_SIZE) {
          s.isFalling = true;
        }
      }

      // 2. Resolve Collisions (Elastic 2D collisions between circles)
      for (let i = 0; i < nextStones.length; i++) {
        const a = nextStones[i];
        if (!a.active || a.isFalling) continue;

        for (let j = i + 1; j < nextStones.length; j++) {
          const b = nextStones[j];
          if (!b.active || b.isFalling) continue;

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = a.radius + b.radius;

          if (dist < minDist) {
            // Collision detected!
            const overlap = minDist - dist;
            // Collision normal
            const nx = dx / (dist || 1);
            const ny = dy / (dist || 1);

            // Separate overlapping stones to prevent sticking
            a.x -= nx * overlap * 0.5;
            a.y -= ny * overlap * 0.5;
            b.x += nx * overlap * 0.5;
            b.y += ny * overlap * 0.5;

            // Relative velocity
            const rvx = a.vx - b.vx;
            const rvy = a.vy - b.vy;

            // Velocity along normal
            const velAlongNormal = rvx * nx + rvy * ny;

            // Only resolve if moving towards each other
            if (velAlongNormal > 0) {
              // Perfect elastic collision (restitution = 1)
              const impulse = velAlongNormal;
              a.vx -= impulse * nx;
              a.vy -= impulse * ny;
              b.vx += impulse * nx;
              b.vy += impulse * ny;
            }
          }
        }
      }

      // Check if simulation is complete (all stones stopped)
      const isAnyMoving = nextStones.some(
        (s) => s.active && (s.vx !== 0 || s.vy !== 0 || s.isFalling)
      );

      if (!isAnyMoving && simulationRef.current) {
        setIsSimulating(false);
        simulationRef.current = false;
        
        // Count active stones for each player
        const blackCount = nextStones.filter((s) => s.active && s.color === 'black').length;
        const whiteCount = nextStones.filter((s) => s.active && s.color === 'white').length;

        if (blackCount === 0 && whiteCount === 0) {
          // Both fell off? Player whose turn it was (who initiated the shot) wins
          const w = currentPlayer === 'black' ? 'black' : 'white';
          setWinner(w);
          if (onGameEndRef.current) onGameEndRef.current(w, turnCount);
        } else if (blackCount === 0) {
          setWinner('white');
          if (onGameEndRef.current) onGameEndRef.current('white', turnCount);
        } else if (whiteCount === 0) {
          setWinner('black');
          if (onGameEndRef.current) onGameEndRef.current('black', turnCount);
        } else {
          // Switch turn
          setCurrentPlayer((prev) => (prev === 'black' ? 'white' : 'black'));
        }
      }

      return nextStones;
    });

    if (simulationRef.current) {
      animationFrameId.current = requestAnimationFrame(updatePhysics);
    }
  }, [currentPlayer]);

  const shoot = useCallback((stoneId: number, vx: number, vy: number) => {
    if (simulationRef.current || winner) return;

    setStones((prev) =>
      prev.map((s) => {
        if (s.id === stoneId) {
          return { ...s, vx, vy };
        }
        return s;
      })
    );

    setIsSimulating(true);
    simulationRef.current = true;
    setTurnCount((c) => c + 1);

    // Start physics loop
    if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    animationFrameId.current = requestAnimationFrame(updatePhysics);
  }, [updatePhysics, winner]);

  // AI Logic
  const triggerAiMove = useCallback(() => {
    if (winner || isSimulating || currentPlayer !== 'white' || isPracticeMode || twoPlayerMode) return;

    // White is AI
    const whiteStones = stones.filter((s) => s.active && s.color === 'white' && !s.isFalling);
    const blackStones = stones.filter((s) => s.active && s.color === 'black' && !s.isFalling);

    if (whiteStones.length === 0 || blackStones.length === 0) return;

    // AI strategy: pick a random active white stone
    const aiStone = whiteStones[Math.floor(Math.random() * whiteStones.length)];

    // Target a random active player stone
    const targetStone = blackStones[Math.floor(Math.random() * blackStones.length)];

    // Vector to target
    const dx = targetStone.x - aiStone.x;
    const dy = targetStone.y - aiStone.y;

    // Shoot in direction of target with moderate accuracy
    const baseAngle = Math.atan2(dy, dx);
    const randomOffset = (Math.random() - 0.5) * 0.28; // Reduced error margin (was 0.45, now 0.28) for intermediate level
    const finalAngle = baseAngle + randomOffset;
    const speed = 9 + Math.random() * 9; // Slightly faster and more solid speed

    const vx = Math.cos(finalAngle) * speed;
    const vy = Math.sin(finalAngle) * speed;

    // Delay AI shot slightly to feel natural
    setTimeout(() => {
      shoot(aiStone.id, vx, vy);
    }, 800);
  }, [stones, winner, isSimulating, currentPlayer, isPracticeMode, twoPlayerMode, shoot]);

  // Listen to currentPlayer change to trigger AI
  useEffect(() => {
    if (currentPlayer === 'white' && !isSimulating && !winner && !isPracticeMode && !twoPlayerMode) {
      triggerAiMove();
    }
  }, [currentPlayer, isSimulating, winner, isPracticeMode, twoPlayerMode, triggerAiMove]);

  return {
    stones,
    currentPlayer,
    winner,
    isSimulating,
    turnCount,
    shoot,
    resetGame: initGame,
    setStones,
    setCurrentPlayer,
    setWinner,
    setIsSimulating
  };
};
