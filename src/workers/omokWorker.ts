export type Player = 'black' | 'white' | null;
export type BoardState = Player[][];
export type Position = { row: number; col: number };

const BOARD_SIZE = 15;

const evaluateDirection = (line: string) => {
  if (line.includes('11111')) return 10000000;
  if (line.includes('011110')) return 1000000;
  if (line.includes('01111') || line.includes('11110') || 
      line.includes('10111') || line.includes('11101') || 
      line.includes('11011')) return 100000;
  if (line.includes('01110') || line.includes('010110') || 
      line.includes('011010')) return 100000;
  if (line.includes('00111') || line.includes('11100') || 
      line.includes('01101') || line.includes('10110') || 
      line.includes('01011') || line.includes('11010') || 
      line.includes('10011') || line.includes('11001') || 
      line.includes('10101')) return 10000;
  if (line.includes('00110') || line.includes('01100') || 
      line.includes('01010') || line.includes('010010') ||
      line.includes('10010') || line.includes('01001') || 
      line.includes('10001')) return 1000;
  if (line.includes('00010') || line.includes('01000')) return 100;
  return 0;
};

const getLine = (currentBoard: BoardState, r: number, c: number, dr: number, dc: number, player: Player) => {
  let line = '';
  for (let i = -4; i <= 4; i++) {
    const nr = r + dr * i;
    const nc = c + dc * i;
    if (nr === r && nc === c) {
      line += '1';
    } else if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) {
      line += '2';
    } else if (currentBoard[nr][nc] === player) {
      line += '1';
    } else if (currentBoard[nr][nc] === null) {
      line += '0';
    } else {
      line += '2';
    }
  }
  return line;
};

const evaluateCell = (currentBoard: BoardState, r: number, c: number, player: 'black' | 'white') => {
  let score = 0;
  const directions = [
    [0, 1], [1, 0], [1, 1], [1, -1]
  ];

  for (const [dr, dc] of directions) {
    const lineStr = getLine(currentBoard, r, c, dr, dc, player);
    score += evaluateDirection(lineStr);
  }
  return score;
};

const getCandidateMoves = (board: BoardState, aiPlayer: 'black' | 'white', humanPlayer: 'black' | 'white') => {
  const moves: { row: number, col: number, score: number, aiWin: boolean, humanWin: boolean }[] = [];
  
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
    return [{ row: 7, col: 7, score: 0, aiWin: false, humanWin: false }];
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
        const attackScore = evaluateCell(board, r, c, aiPlayer);
        const defenseScore = evaluateCell(board, r, c, humanPlayer);
        
        let score = attackScore * 1.1 + defenseScore;
        const aiWin = attackScore >= 10000000;
        const humanWin = defenseScore >= 10000000;
        
        if (aiWin) score += 50000000;
        else if (humanWin) score += 20000000;
        
        moves.push({ row: r, col: c, score, aiWin, humanWin });
      }
    }
  }

  moves.sort((a, b) => b.score - a.score);
  return moves;
};

const minimax = (board: BoardState, depth: number, alpha: number, beta: number, isMaximizing: boolean, aiPlayer: 'black' | 'white', humanPlayer: 'black' | 'white'): number => {
  if (depth === 0) {
    let maxAi = 0;
    let maxHuman = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] !== null) continue;
        const aiScore = evaluateCell(board, r, c, aiPlayer);
        const humanScore = evaluateCell(board, r, c, humanPlayer);
        if (aiScore > maxAi) maxAi = aiScore;
        if (humanScore > maxHuman) maxHuman = humanScore;
      }
    }
    return maxAi * 1.1 - maxHuman;
  }

  const currentPlayer = isMaximizing ? aiPlayer : humanPlayer;
  const moves = getCandidateMoves(board, aiPlayer, humanPlayer).slice(0, 20); // Width 20 for extreme difficulty
  
  if (moves.length === 0) return 0;
  
  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      if (move.aiWin) return 50000000 + depth;
      
      board[move.row][move.col] = currentPlayer;
      const ev = minimax(board, depth - 1, alpha, beta, false, aiPlayer, humanPlayer);
      board[move.row][move.col] = null;
      
      maxEval = Math.max(maxEval, ev);
      alpha = Math.max(alpha, ev);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      if (move.humanWin) return -50000000 - depth;
      
      board[move.row][move.col] = currentPlayer;
      const ev = minimax(board, depth - 1, alpha, beta, true, aiPlayer, humanPlayer);
      board[move.row][move.col] = null;
      
      minEval = Math.min(minEval, ev);
      beta = Math.min(beta, ev);
      if (beta <= alpha) break;
    }
    return minEval;
  }
};

const findBestMove = (currentBoard: BoardState, aiPlayer: 'black' | 'white') => {
  const humanPlayer = aiPlayer === 'black' ? 'white' : 'black';
  const moves = getCandidateMoves(currentBoard, aiPlayer, humanPlayer);
  
  if (moves.length === 0) return { row: 7, col: 7 };
  
  for (const move of moves) {
    if (move.aiWin) return { row: move.row, col: move.col };
  }
  for (const move of moves) {
    if (move.humanWin) return { row: move.row, col: move.col };
  }
  
  let bestScore = -Infinity;
  let bestMove = moves[0];
  
  const searchMoves = moves.slice(0, 20);
  for (const move of searchMoves) {
    currentBoard[move.row][move.col] = aiPlayer;
    // Depth 4 search (5 plies deep) for true extreme difficulty
    const score = minimax(currentBoard, 4, -Infinity, Infinity, false, aiPlayer, humanPlayer);
    currentBoard[move.row][move.col] = null;
    
    const finalScore = score + Math.random() * 10;

    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestMove = move;
    }
  }
  
  return bestMove;
};

// Web Worker message listener
self.onmessage = (e: MessageEvent<{ board: BoardState, aiPlayer: 'black' | 'white' }>) => {
  const { board, aiPlayer } = e.data;
  
  const bestMove = findBestMove(board, aiPlayer);
  
  self.postMessage({ row: bestMove.row, col: bestMove.col });
};
