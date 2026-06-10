// src/workers/aiWorker.ts
export type Player = 'black' | 'white' | null;
export type BoardState = Player[][];
export type Position = { row: number; col: number };
export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert' | 'god' | 'transcendent';

const BOARD_SIZE = 15;

// Evaluation constants
const SCORES = {
  WIN: 100000000,
  OPEN_FOUR: 5000000,
  BLOCKED_FOUR: 100000,
  OPEN_THREE: 50000,
  BLOCKED_THREE: 1000,
  OPEN_TWO: 500,
  BLOCKED_TWO: 50
};

// Directions for 8 ways (4 axes)
const DIRECTIONS = [
  [0, 1],  // Horizontal
  [1, 0],  // Vertical
  [1, 1],  // Diagonal right-down
  [1, -1]  // Diagonal left-down
];

let globalStartTime = 0;
let timeLimitMs = 4300; // Total 4.5s limit max
let currentPlayStyle: number = 0.5; // 0.0 (conservative) to 1.0 (aggressive)
let nodesEvaluated = 0;
let currentGlobalDepth = 0;
let currentGlobalBestScore = 0;
let lastPostTime = 0;

let isHintMode = false;

function reportProgress() {
  if ((nodesEvaluated & 8191) === 0) {
    const now = performance.now();
    if (now - lastPostTime > 60) {
      if (!isHintMode) {
        self.postMessage({
          type: 'progress',
          stats: {
            nodesEvaluated,
            searchDepth: currentGlobalDepth,
            timeTakenMs: now - globalStartTime,
            evalScore: currentGlobalBestScore,
            playStyle: currentPlayStyle
          }
        });
      }
      lastPostTime = now;
    }
  }
}

function isTimeUp() {
  return performance.now() - globalStartTime > timeLimitMs;
}

// Full board evaluation
function evaluateBoardState(board: BoardState, aiPlayer: 'black'|'white', humanPlayer: 'black'|'white'): { aiWin: boolean, humanWin: boolean, score: number } {
  nodesEvaluated++;
  reportProgress();
  let aiScore = 0;
  let humanScore = 0;
  let aiWin = false;
  let humanWin = false;

  const evalWindow = (r: number, c: number, dr: number, dc: number) => {
    let aiStones = 0;
    let humanStones = 0;
    
    for (let i = 0; i < 5; i++) {
      const nr = r + dr * i;
      const nc = c + dc * i;
      const stone = board[nr][nc];
      if (stone === aiPlayer) aiStones++;
      else if (stone === humanPlayer) humanStones++;
    }

    if (aiStones > 0 && humanStones === 0) {
      if (aiStones === 5) aiWin = true;
      let s = 0;
      if (aiStones === 4) s = SCORES.OPEN_FOUR; // Approximation
      else if (aiStones === 3) s = SCORES.OPEN_THREE;
      else if (aiStones === 2) s = SCORES.OPEN_TWO;
      else if (aiStones === 1) s = 10;
      aiScore += s;
    } else if (humanStones > 0 && aiStones === 0) {
      if (humanStones === 5) humanWin = true;
      let s = 0;
      if (humanStones === 4) s = SCORES.OPEN_FOUR;
      else if (humanStones === 3) s = SCORES.OPEN_THREE;
      else if (humanStones === 2) s = SCORES.OPEN_TWO;
      else if (humanStones === 1) s = 10;
      humanScore += s;
    }
  };

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c <= BOARD_SIZE - 5; c++) {
      evalWindow(r, c, 0, 1);
    }
  }

  for (let c = 0; c < BOARD_SIZE; c++) {
    for (let r = 0; r <= BOARD_SIZE - 5; r++) {
      evalWindow(r, c, 1, 0);
    }
  }

  for (let r = 0; r <= BOARD_SIZE - 5; r++) {
    for (let c = 0; c <= BOARD_SIZE - 5; c++) {
      evalWindow(r, c, 1, 1);
    }
  }

  for (let r = 0; r <= BOARD_SIZE - 5; r++) {
    for (let c = 4; c < BOARD_SIZE; c++) {
      evalWindow(r, c, 1, -1);
    }
  }

  // Map aggressiveness (0.0 to 1.0) to multipliers
  // 0.5 -> aiMult = 1.0, humanMult = 1.0
  // 1.0 -> aiMult = 1.5, humanMult = 0.8
  // 0.0 -> aiMult = 0.8, humanMult = 1.5
  let aiMult = 0.8 + currentPlayStyle * 0.7;
  let humanMult = 1.5 - currentPlayStyle * 0.7;

  return { aiWin, humanWin, score: aiScore * aiMult - humanScore * humanMult };
}

// Improved Evaluate Move for fast sorting
function evaluateMoveFast(board: BoardState, r: number, c: number, player: 'black'|'white', opponent: 'black'|'white'): { score: number, isWin: boolean } {
  nodesEvaluated++;
  reportProgress();
  const centerDist = Math.max(Math.abs(r - 7), Math.abs(c - 7));
  let score = (7 - centerDist) * 10;
  let isWin = false;

  for (const [dr, dc] of DIRECTIONS) {
    for (let i = 0; i < 5; i++) {
      const wr = r - dr * i;
      const wc = c - dc * i;
      const endR = wr + dr * 4;
      const endC = wc + dc * 4;
      
      if (wr < 0 || wr >= BOARD_SIZE || wc < 0 || wc >= BOARD_SIZE || 
          endR < 0 || endR >= BOARD_SIZE || endC < 0 || endC >= BOARD_SIZE) {
        continue;
      }

      let pStones = 0;
      let oStones = 0;
      for (let j = 0; j < 5; j++) {
        const nr = wr + dr * j;
        const nc = wc + dc * j;
        const stone = board[nr][nc];
        if (stone === player) pStones++;
        else if (stone === opponent) oStones++;
      }

      if (pStones > 0 && oStones === 0) {
        if (pStones === 5) isWin = true;
        let s = 0;
        if (pStones === 4) s = SCORES.OPEN_FOUR;
        else if (pStones === 3) s = SCORES.OPEN_THREE;
        else if (pStones === 2) s = SCORES.OPEN_TWO;
        else if (pStones === 1) s = 10;
        score += s;
      }
    }
  }

  return { score, isWin };
}

function getCandidateMoves(board: BoardState, aiPlayer: 'black'|'white', humanPlayer: 'black'|'white') {
  const moves: { row: number, col: number, score: number }[] = [];
  
  let minR = BOARD_SIZE, maxR = -1, minC = BOARD_SIZE, maxC = -1;
  let hasStones = false;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== null) {
        hasStones = true;
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
      }
    }
  }

  if (!hasStones) {
    return [{ row: 7, col: 7, score: 0 }];
  }

  minR = Math.max(0, minR - 2);
  maxR = Math.min(BOARD_SIZE - 1, maxR + 2);
  minC = Math.max(0, minC - 2);
  maxC = Math.min(BOARD_SIZE - 1, maxC + 2);

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (board[r][c] !== null) continue;
      
      let hasNeighbor = false;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] !== null) {
            hasNeighbor = true;
            break;
          }
        }
        if (hasNeighbor) break;
      }
      
      if (hasNeighbor) {
        board[r][c] = aiPlayer;
        const aiEval = evaluateMoveFast(board, r, c, aiPlayer, humanPlayer);
        board[r][c] = null;
        
        board[r][c] = humanPlayer;
        const humanEval = evaluateMoveFast(board, r, c, humanPlayer, aiPlayer);
        board[r][c] = null;
        
        let aiMult = 0.8 + currentPlayStyle * 0.7;
        let humanMult = 1.5 - currentPlayStyle * 0.7;
        
        let moveScore = aiEval.score * aiMult + humanEval.score * humanMult; 
        
        if (aiEval.isWin) moveScore += 500000000;
        else if (humanEval.isWin) moveScore += 200000000; 

        moves.push({ row: r, col: c, score: moveScore });
      }
    }
  }

  moves.sort((a, b) => b.score - a.score);
  return moves;
}

function minimax(board: BoardState, depth: number, alpha: number, beta: number, isMaximizing: boolean, aiPlayer: 'black'|'white', humanPlayer: 'black'|'white', branchLimitFn?: (d: number, t: boolean) => number): number {
  if (isTimeUp()) return isMaximizing ? -Infinity : Infinity;

  const boardEval = evaluateBoardState(board, aiPlayer, humanPlayer);
  
  if (boardEval.aiWin) return 50000000 + depth;
  if (boardEval.humanWin) return -50000000 - depth;
  if (depth === 0) return boardEval.score;

  const currentPlayer = isMaximizing ? aiPlayer : humanPlayer;
  const moves = getCandidateMoves(board, aiPlayer, humanPlayer);
  
  if (moves.length === 0) return 0;
  
  const isLocalTactical = moves[0].score > 40000;
  let branchLimit = branchLimitFn ? branchLimitFn(depth, isLocalTactical) : (depth >= 6 ? 10 : depth >= 4 ? 8 : 6);
  
  const searchMoves = moves[0].score >= 200000000 ? [moves[0]] : moves.slice(0, branchLimit);
  
  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of searchMoves) {
      board[move.row][move.col] = currentPlayer;
      const ev = minimax(board, depth - 1, alpha, beta, false, aiPlayer, humanPlayer, branchLimitFn);
      board[move.row][move.col] = null;
      
      if (isTimeUp()) return 0;

      maxEval = Math.max(maxEval, ev);
      alpha = Math.max(alpha, ev);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of searchMoves) {
      board[move.row][move.col] = currentPlayer;
      const ev = minimax(board, depth - 1, alpha, beta, true, aiPlayer, humanPlayer, branchLimitFn);
      board[move.row][move.col] = null;
      
      if (isTimeUp()) return 0;

      minEval = Math.min(minEval, ev);
      beta = Math.min(beta, ev);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

// VCF (Victory by Continuous Fours) Implementation
function findVCF(board: BoardState, attacker: 'black'|'white', defender: 'black'|'white', depth: number, isAttackerTurn: boolean): Position | null {
  if (depth === 0 || isTimeUp()) return null;

  // Simple VCF logic: look for 4s
  const moves = getCandidateMoves(board, isAttackerTurn ? attacker : defender, isAttackerTurn ? defender : attacker);
  
  if (isAttackerTurn) {
    // Attacker must play a move that creates a 4 (or 5)
    // For VCF, we only consider moves that have a very high score (meaning it creates a 4)
    // A move creating a 4 has an evaluateMoveFast score > 5,000,000. So moveScore > 2,000,000 is a safe threshold.
    const attackMoves = moves.filter(m => m.score > 2000000);
    for (const move of attackMoves) {
      board[move.row][move.col] = attacker;
      // Check if this move wins immediately
      const moveEval = evaluateMoveFast(board, move.row, move.col, attacker, defender);
      if (moveEval.isWin) {
        board[move.row][move.col] = null;
        return { row: move.row, col: move.col };
      }
      
      // If it creates a 4, the defender MUST block
      const vcfReply = findVCF(board, attacker, defender, depth - 1, false);
      board[move.row][move.col] = null;
      
      if (vcfReply !== null) { // Means attacker wins down this line
        return { row: move.row, col: move.col };
      }
    }
    return null;
  } else {
    // Defender must play a move that blocks the 4, or creates their own 5
    // If they have a winning move, they play it and attacker loses this line
    const winMove = moves.find(m => {
      board[m.row][m.col] = defender;
      const e = evaluateMoveFast(board, m.row, m.col, defender, attacker);
      board[m.row][m.col] = null;
      return e.isWin;
    });
    if (winMove) return null; // Defender wins, VCF failed

    // Otherwise defender plays the mandatory block
    // A mandatory block is usually the move that prevents the 5
    // If there's multiple blocks, we must ensure VCF works against ALL of them.
    // For simplicity, we assume defender plays the highest scoring move
    if (moves.length > 0) {
      const move = moves[0];
      board[move.row][move.col] = defender;
      const result = findVCF(board, attacker, defender, depth - 1, true);
      board[move.row][move.col] = null;
      return result; // If result is non-null, attacker wins even after this block
    }
    return null;
  }
}

self.onmessage = (e: MessageEvent) => {
  const { type, board, aiPlayer, difficulty, humanColor, playStyle } = e.data;
  globalStartTime = performance.now();
  lastPostTime = globalStartTime;
  currentPlayStyle = typeof playStyle === 'number' ? playStyle : 0.5;
  nodesEvaluated = 0;
  currentGlobalDepth = 1;
  currentGlobalBestScore = 0;
  isHintMode = (type === 'hint');
  
  // Time limits
  timeLimitMs = actualDifficulty === 'transcendent' ? 7800 : 4300; 
  
  let actualAiPlayer = aiPlayer;
  let actualHumanPlayer = humanColor;
  let actualDifficulty = difficulty;

  if (isHintMode) {
    actualAiPlayer = humanColor;
    actualHumanPlayer = aiPlayer;
    actualDifficulty = 'god';
  }
  
  // 1. Check for immediate VCF
  if (actualDifficulty === 'expert' || actualDifficulty === 'god' || actualDifficulty === 'transcendent') {
    // VCF max depth 11 for expert, 15 for god, 18 for transcendent
    const vcfDepth = actualDifficulty === 'transcendent' ? 18 : (actualDifficulty === 'god' ? 15 : 11);
    const vcfMove = findVCF(board, actualAiPlayer, actualHumanPlayer, vcfDepth, true);
    if (vcfMove && !isTimeUp()) {
      if (isHintMode) {
        self.postMessage({ 
          type: 'hintResult', 
          bestMove: vcfMove, 
          reason: "이 곳에 두면 연속 공격으로 반드시 승리할 수 있습니다!" 
        });
        return;
      }
      self.postMessage({ 
        type: 'result',
        bestMove: vcfMove, 
        isVCF: true,
        stats: { nodesEvaluated, searchDepth: vcfDepth, timeTakenMs: performance.now() - globalStartTime, evalScore: 99999999, playStyle: currentPlayStyle }
      });
      return;
    }
  }

  // 2. Normal Minimax
  const moves = getCandidateMoves(board, actualAiPlayer, actualHumanPlayer);
  if (moves.length === 0) {
    if (isHintMode) {
      self.postMessage({ 
        type: 'hintResult', 
        bestMove: { row: 7, col: 7 }, 
        reason: "첫 수이거나 둘 곳이 없습니다. 중앙을 추천합니다." 
      });
      return;
    }
    self.postMessage({ 
      type: 'result',
      bestMove: { row: 7, col: 7 },
      stats: { nodesEvaluated, searchDepth: 0, timeTakenMs: performance.now() - globalStartTime, evalScore: 0, playStyle: currentPlayStyle }
    });
    return;
  }

  if (moves[0].score >= 200000000) {
    if (isHintMode) {
      self.postMessage({ 
        type: 'hintResult', 
        bestMove: { row: moves[0].row, col: moves[0].col }, 
        reason: "상대방의 오목을 막거나 바로 승리할 수 있는 결정적인 자리입니다!" 
      });
      return;
    }
    self.postMessage({ 
      type: 'result',
      bestMove: { row: moves[0].row, col: moves[0].col },
      stats: { nodesEvaluated, searchDepth: 1, timeTakenMs: performance.now() - globalStartTime, evalScore: moves[0].score, playStyle: currentPlayStyle }
    });
    return;
  }

  const depthMap = {
    'easy': 2,
    'normal': 3,
    'hard': 4,
    'expert': 6,
    'god': 8,
    'transcendent': 12
  };
  
  let maxSearchDepth = depthMap[actualDifficulty as Difficulty] || 4;
  let rootBranchLimit = 10;
  let branchLimitFn: (d: number, tactical: boolean) => number = (d, _tactical) => d >= 6 ? 10 : d >= 4 ? 8 : 6;

  if (actualDifficulty === 'expert' || actualDifficulty === 'god' || actualDifficulty === 'transcendent') {
    const isTactical = moves.length > 0 && moves[0].score > 40000;
    if (isTactical) {
      // Tactical Situation: Narrow & Deep
      maxSearchDepth = actualDifficulty === 'transcendent' ? 16 : (actualDifficulty === 'god' ? 12 : 8);
      rootBranchLimit = actualDifficulty === 'transcendent' ? 10 : (actualDifficulty === 'god' ? 8 : 6);
      branchLimitFn = (_d, tactical) => tactical ? (actualDifficulty === 'transcendent' ? 8 : 6) : 4;
    } else {
      // Strategic Situation: Wide & Shallow
      maxSearchDepth = actualDifficulty === 'transcendent' ? 10 : (actualDifficulty === 'god' ? 8 : 6);
      rootBranchLimit = actualDifficulty === 'transcendent' ? 20 : (actualDifficulty === 'god' ? 16 : 12); // Adjusted down for time limit
      branchLimitFn = (d, tactical) => tactical ? (actualDifficulty === 'transcendent' ? 10 : 8) : (d >= 6 ? (actualDifficulty === 'transcendent' ? 12 : 10) : d >= 4 ? 8 : 6);
    }
  } else {
    rootBranchLimit = maxSearchDepth >= 6 ? 12 : maxSearchDepth >= 4 ? 10 : 8;
  }
  
  let overallBestMove = moves[0];
  let lastCompletedDepth = 1;

  if (!isHintMode) {
    self.postMessage({ type: 'progress', stats: { nodesEvaluated: 0, searchDepth: 1, timeTakenMs: 0, evalScore: moves[0].score, playStyle: currentPlayStyle } });
  }

  for (let currentDepth = 2; currentDepth <= maxSearchDepth; currentDepth++) {
    currentGlobalDepth = currentDepth;
    let currentBestScore = -Infinity;
    let currentBestMove = moves[0];
    
    const searchMoves = moves.slice(0, rootBranchLimit);
    let completedDepth = true;

    for (const move of searchMoves) {
      if (isTimeUp()) {
        completedDepth = false;
        break;
      }
      
      board[move.row][move.col] = actualAiPlayer;
      const score = minimax(board, currentDepth, -Infinity, Infinity, false, actualAiPlayer, actualHumanPlayer, branchLimitFn);
      board[move.row][move.col] = null;

      if (isTimeUp()) {
        completedDepth = false;
        break;
      }

      const finalScore = score + Math.random();
      if (finalScore > currentBestScore) {
        currentBestScore = finalScore;
        currentBestMove = move;
        currentGlobalBestScore = currentBestScore;
      }
    }

    if (completedDepth || currentBestScore > 40000000) {
      overallBestMove = currentBestMove;
      lastCompletedDepth = currentDepth;
    }
    
    if (!completedDepth || isTimeUp()) break;
  }

  if (isHintMode) {
    let reason = "이 자리는 중앙 또는 대각선 전개에 유리한 전략적 요충지입니다.";
    if (overallBestMove.score >= 50000000) {
      reason = "이 곳에 두면 공격이 성공하여 다음 수에 오목을 완성합니다!";
    } else if (overallBestMove.score >= 20000000) {
      reason = "상대방의 오목 또는 4-3을 막는 필수 수비 자리입니다.";
    } else if (overallBestMove.score >= 400000) {
      reason = "공격(3이나 4)을 전개하며 상대방을 압박하는 아주 좋은 자리입니다.";
    } else if (overallBestMove.score >= 40000) {
      reason = "잠재적인 상대의 공격을 차단하거나 모양을 갖추는 핵심 자리입니다.";
    }
    
    self.postMessage({ 
      type: 'hintResult', 
      bestMove: { row: overallBestMove.row, col: overallBestMove.col },
      reason
    });
    return;
  }

  self.postMessage({ 
    type: 'result',
    bestMove: { row: overallBestMove.row, col: overallBestMove.col }, 
    isVCF: false,
    stats: { 
      nodesEvaluated, 
      searchDepth: lastCompletedDepth, 
      timeTakenMs: performance.now() - globalStartTime, 
      evalScore: overallBestMove.score,
      playStyle: currentPlayStyle 
    }
  });
};
