import { useState, useCallback, useEffect, useRef } from 'react';

export type AlkkagiAbility = 'normal' | 'heavy' | 'sniper' | 'bomb' | 'ghost';

export interface AlkkagiStone {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Angular velocity (radians/frame) for visual spin */
  omega: number;
  /** Current rotation angle for drawing */
  angle: number;
  color: 'black' | 'white';
  radius: number;
  active: boolean;
  isFalling: boolean;
  /** 0–1 scale factor used during the fall-off shrink animation */
  scale: number;
  /** Flash intensity after a collision (0–1, decays quickly) */
  hitFlash: number;
  ability: AlkkagiAbility;
  mass: number;
}

const BOARD_SIZE = 500;
const STONE_RADIUS = 16;

/** Rolling friction coefficient – lower = slides less (more realistic) */
const FRICTION = 0.978;
/** Minimum speed before a stone is considered stopped */
const MIN_SPEED = 0.08;
/** Coefficient of restitution for stone-stone collisions (0=inelastic, 1=perfect elastic) */
const RESTITUTION = 0.82;
/** Tangential friction during collision (spin generation) */
const COLLISION_TANGENT_FRICTION = 0.18;
/** Maximum launch speed a player can apply */
const MAX_SHOOT_SPEED = 22;
/** Number of sub-steps per frame for continuous collision detection */
const SUB_STEPS = 3;

export const useAlkkagi = (
  isPracticeMode: boolean,
  twoPlayerMode: boolean,
  superpowerMode: boolean,
  initialStoneCount: number = 7,
  onGameEnd?: (winner: 'black' | 'white', turnCount: number) => void
) => {
  const [stones, setStones] = useState<AlkkagiStone[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<'black' | 'white'>('black');
  const [winner, setWinner] = useState<'black' | 'white' | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [turnCount, setTurnCount] = useState(0);
  /** Collision events this frame for sound/visual feedback */
  const [collisionEvents, setCollisionEvents] = useState<{ x: number; y: number; intensity: number }[]>([]);

  const onGameEndRef = useRef(onGameEnd);
  useEffect(() => {
    onGameEndRef.current = onGameEnd;
  }, [onGameEnd]);

  const simulationRef = useRef<boolean>(false);
  const animationFrameId = useRef<number | null>(null);

  const initGame = useCallback(() => {
    const initialStones: AlkkagiStone[] = [];
    let idCounter = 0;

    // Random ability assignment logic
    const getRandomAbilities = () => {
      if (!superpowerMode) return Array(initialStoneCount).fill('normal');
      const pool: AlkkagiAbility[] = ['heavy', 'sniper', 'bomb', 'ghost'];
      const numAbilities = Math.floor(Math.random() * 2) + 2; // 2 or 3
      const shuffledPool = [...pool].sort(() => Math.random() - 0.5);
      const chosen = shuffledPool.slice(0, numAbilities);
      const result = new Array(initialStoneCount).fill('normal');
      for (let i = 0; i < chosen.length; i++) {
        result[i] = chosen[i];
      }
      return result.sort(() => Math.random() - 0.5);
    };

    const blackAbilities = getRandomAbilities();
    const whiteAbilities = getRandomAbilities();

    // Place Black stones at the bottom
    for (let i = 0; i < initialStoneCount; i++) {
      const ability = blackAbilities[i];
      const mass = ability === 'heavy' ? 3 : ability === 'sniper' ? 0.5 : 1;
      const radius = ability === 'heavy' ? STONE_RADIUS * 1.2 : STONE_RADIUS;
      initialStones.push({
        id: idCounter++,
        x: initialStoneCount === 1
          ? BOARD_SIZE / 2
          : 50 + i * (BOARD_SIZE - 100) / (initialStoneCount - 1),
        y: BOARD_SIZE - 60,
        vx: 0, vy: 0, omega: 0, angle: 0,
        color: 'black',
        radius, active: true, isFalling: false, scale: 1, hitFlash: 0,
        ability, mass
      });
    }

    // Place White stones at the top
    for (let i = 0; i < initialStoneCount; i++) {
      const ability = whiteAbilities[i];
      const mass = ability === 'heavy' ? 3 : ability === 'sniper' ? 0.5 : 1;
      const radius = ability === 'heavy' ? STONE_RADIUS * 1.2 : STONE_RADIUS;
      initialStones.push({
        id: idCounter++,
        x: initialStoneCount === 1
          ? BOARD_SIZE / 2
          : 50 + i * (BOARD_SIZE - 100) / (initialStoneCount - 1),
        y: 60,
        vx: 0, vy: 0, omega: 0, angle: 0,
        color: 'white',
        radius, active: true, isFalling: false, scale: 1, hitFlash: 0,
        ability, mass
      });
    }

    setStones(initialStones);
    setCurrentPlayer('black');
    setWinner(null);
    setIsSimulating(false);
    simulationRef.current = false;
    setTurnCount(0);
    setCollisionEvents([]);
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
  }, [initialStoneCount, superpowerMode]);

  useEffect(() => {
    initGame();
    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, [initGame]);

  // ─── Core physics step (called SUB_STEPS times per frame) ────────────────
  const physicsStep = (stones: AlkkagiStone[], dt: number): { stones: AlkkagiStone[]; events: { x: number; y: number; intensity: number }[] } => {
    const next = stones.map(s => ({ ...s }));
    const events: { x: number; y: number; intensity: number }[] = [];

    // 1. Integrate positions & apply friction
    for (const s of next) {
      if (!s.active) continue;

      // Decay hit flash
      s.hitFlash = Math.max(0, s.hitFlash - 0.08);

      if (s.isFalling) {
        // Shrink while falling off the edge
        s.scale -= 0.06 * dt;
        s.radius = STONE_RADIUS * Math.max(0, s.scale);
        s.angle += s.omega;
        if (s.scale <= 0) {
          s.scale = 0;
          s.radius = 0;
          s.active = false;
        }
        // Continue drifting outward
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= 0.92;
        s.vy *= 0.92;
        continue;
      }

      s.x += s.vx * dt;
      s.y += s.vy * dt;

      // Speed-dependent friction: faster stones lose speed quicker (air drag)
      const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      const frictionThisFrame = FRICTION - speed * 0.0003;
      s.vx *= frictionThisFrame;
      s.vy *= frictionThisFrame;

      // Angular velocity from rolling
      const radius = Math.max(s.radius, 1);
      s.omega = (s.vx * 0.7) / radius; // simplified rolling
      s.angle += s.omega * dt;

      if (Math.abs(s.vx) < MIN_SPEED) s.vx = 0;
      if (Math.abs(s.vy) < MIN_SPEED) s.vy = 0;

      // Boundary check – stone falls off when center exits board
      if (s.x < 0 || s.x > BOARD_SIZE || s.y < 0 || s.y > BOARD_SIZE) {
        s.isFalling = true;
      }
    }

    // 2. Resolve stone-stone collisions
    for (let i = 0; i < next.length; i++) {
      const a = next[i];
      if (!a.active || a.isFalling) continue;

      for (let j = i + 1; j < next.length; j++) {
        const b = next[j];
        if (!b.active || b.isFalling) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy;
        const minDist = a.radius + b.radius;
        if (distSq < minDist * minDist && distSq > 0.0001) {
          // Ghost ability: skip collision between same-color stones if either is a ghost
          if (a.color === b.color && (a.ability === 'ghost' || b.ability === 'ghost')) {
            continue;
          }

          const dist = Math.sqrt(distSq);
          const overlap = minDist - dist;

          // Collision normal
          const nx = dx / dist;
          const ny = dy / dist;

          // Mass-based positional correction
          const totalInverseMass = (1 / a.mass) + (1 / b.mass);
          const aInvMass = 1 / a.mass;
          const bInvMass = 1 / b.mass;
          const aRatio = aInvMass / totalInverseMass;
          const bRatio = bInvMass / totalInverseMass;

          a.x -= nx * overlap * aRatio * 1.01;
          a.y -= ny * overlap * aRatio * 1.01;
          b.x += nx * overlap * bRatio * 1.01;
          b.y += ny * overlap * bRatio * 1.01;

          // Relative velocity along normal
          const rvx = a.vx - b.vx;
          const rvy = a.vy - b.vy;
          const velAlongNormal = rvx * nx + rvy * ny;

          if (velAlongNormal > 0) {
            // Normal impulse with restitution (1D elastic collision formula with mass)
            const impulse = velAlongNormal * (1 + RESTITUTION) / totalInverseMass;

            a.vx -= impulse * aInvMass * nx;
            a.vy -= impulse * aInvMass * ny;
            b.vx += impulse * bInvMass * nx;
            b.vy += impulse * bInvMass * ny;

            // Tangential friction (generates spin)
            const tx = -ny;
            const ty = nx;
            const relTan = rvx * tx + rvy * ty;
            const tanImpulse = relTan * COLLISION_TANGENT_FRICTION / totalInverseMass;

            a.vx -= tanImpulse * aInvMass * tx;
            a.vy -= tanImpulse * aInvMass * ty;
            b.vx += tanImpulse * bInvMass * tx;
            b.vy += tanImpulse * bInvMass * ty;

            // Apply hit flash proportional to impact speed
            const impactSpeed = Math.abs(velAlongNormal);
            a.hitFlash = Math.min(1, impactSpeed / 12);
            b.hitFlash = Math.min(1, impactSpeed / 12);

            // Record collision event for visual effect
            const cx = (a.x + b.x) * 0.5;
            const cy = (a.y + b.y) * 0.5;
            events.push({ x: cx, y: cy, intensity: Math.min(1, impactSpeed / 12) });

            // Add spin from collision
            a.omega += (relTan * 0.15 * aInvMass) / Math.max(a.radius, 1);
            b.omega -= (relTan * 0.15 * bInvMass) / Math.max(b.radius, 1);

            // Bomb logic
            if (a.color !== b.color && (a.ability === 'bomb' || b.ability === 'bomb')) {
              events.push({ x: cx, y: cy, intensity: 2 }); // Bigger flash
              
              // Apply AoE impulse to all stones
              for (const s of next) {
                if (!s.active || s.isFalling) continue;
                const adx = s.x - cx;
                const ady = s.y - cy;
                const adistSq = adx * adx + ady * ady;
                if (adistSq < 10000 && adistSq > 0.01) { // roughly 100px radius
                  const adist = Math.sqrt(adistSq);
                  const force = (100 - adist) * 0.2; // Falloff
                  s.vx += (adx / adist) * force * (1 / s.mass);
                  s.vy += (ady / adist) * force * (1 / s.mass);
                }
              }
              if (a.ability === 'bomb') a.isFalling = true;
              if (b.ability === 'bomb') b.isFalling = true;
            }
          }
        }
      }
    }

    return { stones: next, events };
  };

  const updatePhysics = useCallback(() => {
    setStones((prevStones) => {
      let current = prevStones;
      const allEvents: { x: number; y: number; intensity: number }[] = [];

      // Sub-step CCD: run multiple small steps per frame
      for (let step = 0; step < SUB_STEPS; step++) {
        const result = physicsStep(current, 1 / SUB_STEPS);
        current = result.stones;
        allEvents.push(...result.events);
      }

      if (allEvents.length > 0) {
        setCollisionEvents(allEvents);
      }

      // Check if simulation is complete
      const isAnyMoving = current.some(
        (s) => s.active && (s.vx !== 0 || s.vy !== 0 || s.isFalling || s.hitFlash > 0)
      );

      if (!isAnyMoving && simulationRef.current) {
        setIsSimulating(false);
        simulationRef.current = false;

        const blackCount = current.filter((s) => s.active && s.color === 'black').length;
        const whiteCount = current.filter((s) => s.active && s.color === 'white').length;

        if (blackCount === 0 && whiteCount === 0) {
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
          setCurrentPlayer((prev) => (prev === 'black' ? 'white' : 'black'));
        }
      }

      return current;
    });

    if (simulationRef.current) {
      animationFrameId.current = requestAnimationFrame(updatePhysics);
    }
  }, [currentPlayer, turnCount]);

  const shoot = useCallback((stoneId: number, vx: number, vy: number) => {
    if (simulationRef.current || winner) return;

    setStones((prev) => {
      const newStones = prev.map((s) => {
        if (s.id === stoneId && !s.isFalling) {
          const maxSpeed = s.ability === 'sniper' ? MAX_SHOOT_SPEED * 2.5 : MAX_SHOOT_SPEED;
          let speed = Math.sqrt(vx * vx + vy * vy);
          if (speed > maxSpeed) {
            vx = (vx / speed) * maxSpeed;
            vy = (vy / speed) * maxSpeed;
          }
          return { ...s, vx, vy };
        }
        return s;
      });
      return newStones;
    });

    setIsSimulating(true);
    simulationRef.current = true;
    setTurnCount((c) => c + 1);
    setCollisionEvents([]);

    if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    animationFrameId.current = requestAnimationFrame(updatePhysics);
  }, [updatePhysics, winner]);

  // ─── AI Logic ────────────────────────────────────────────────────────────
  const triggerAiMove = useCallback(() => {
    if (winner || isSimulating || currentPlayer !== 'white' || isPracticeMode || twoPlayerMode) return;

    const whiteStones = stones.filter((s) => s.active && s.color === 'white' && !s.isFalling);
    const blackStones = stones.filter((s) => s.active && s.color === 'black' && !s.isFalling);

    if (whiteStones.length === 0 || blackStones.length === 0) return;

    // AI strategy: Score each possible white->black shot
    // Smarter & More Aggressive:
    // 1. Push black stones away from the center (towards edges).
    // 2. Prioritize using white stones that are safer (further from edges).
    // 3. Prioritize shorter shots for better accuracy.
    let bestAiStone = whiteStones[0];
    let bestTarget = blackStones[0];
    let bestScore = -Infinity;
    let bestDist = Infinity;

    for (const ws of whiteStones) {
      for (const bs of blackStones) {
        const dx = bs.x - ws.x;
        const dy = bs.y - ws.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Normalize direction
        const dirX = dx / dist;
        const dirY = dy / dist;

        // Vector from black stone to the center of the board
        const toCenterX = (BOARD_SIZE / 2) - bs.x;
        const toCenterY = (BOARD_SIZE / 2) - bs.y;
        
        // Dot product of shot direction and center vector
        // If negative, the shot pushes the black stone AWAY from the center (towards an edge) -> Good!
        const dotProduct = dirX * toCenterX + dirY * toCenterY;
        
        // White stone safety (distance to nearest edge)
        const wEdgeDist = Math.min(
          ws.x, BOARD_SIZE - ws.x,
          ws.y, BOARD_SIZE - ws.y
        );

        // Calculate a heuristic score (higher is better)
        const score = (-dotProduct * 1.5) + (wEdgeDist * 0.8) - (dist * 0.5);

        if (score > bestScore) {
          bestScore = score;
          bestAiStone = ws;
          bestTarget = bs;
          bestDist = dist;
        }
      }
    }

    // Aim with high precision (reduced randomness for a "smarter" AI)
    const dx = bestTarget.x - bestAiStone.x;
    const dy = bestTarget.y - bestAiStone.y;
    const baseAngle = Math.atan2(dy, dx);
    const randomOffset = (Math.random() - 0.5) * 0.05; // Tiny error margin
    const finalAngle = baseAngle + randomOffset;
    
    // Aggressive speed: Hit hard enough to knock the target off
    const distFactor = Math.min(bestDist / BOARD_SIZE, 1);
    const speed = 16 + (distFactor * 16) + (Math.random() * 2);

    const vx = Math.cos(finalAngle) * speed;
    const vy = Math.sin(finalAngle) * speed;

    setTimeout(() => {
      shoot(bestAiStone.id, vx, vy);
    }, 800);
  }, [stones, winner, isSimulating, currentPlayer, isPracticeMode, twoPlayerMode, shoot]);

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
    collisionEvents,
    shoot,
    resetGame: initGame,
    setStones,
    setCurrentPlayer,
    setWinner,
    setIsSimulating,
    setTurnCount,
  };
};
