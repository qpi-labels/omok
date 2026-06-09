import { useState, useCallback, useEffect } from 'react';

export type Player = 'black' | 'white' | null;
export type BoardState = Player[][];
export type Position = { row: number; col: number };
export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert' | 'god';

const BOARD_SIZE = 15;

const createEmptyBoard = (): BoardState => {
  return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
};

export const useOmok = (onGameEnd?: (isHumanWin: boolean, diff: Difficulty) => void) => {
  const [board, setBoard] = useState<BoardState>(createEmptyBoard());
  const [currentPlayer, setCurrentPlayer] = useState<Player>('black');
  const [winner, setWinner] = useState<Player | 'draw'>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [winningLine, setWinningLine] = useState<Position[]>([]);
  const [lastMove, setLastMove] = useState<Position | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [humanColor, setHumanColor] = useState<'black' | 'white'>('black');
  const [isColorDeciding, setIsColorDeciding] = useState(false);
  const [decidedColor, setDecidedColor] = useState<'black' | 'white' | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('hard');
  const [hasStarted, setHasStarted] = useState(false);

  const resetGame = useCallback(() => {
    setHasStarted(true);
    setBoard(createEmptyBoard());
    setCurrentPlayer('black');
    setWinner(null);
    setShowOverlay(false);
    setWinningLine([]);
    setLastMove(null);
    setIsAiThinking(false);
    
    // Start animation
    setIsColorDeciding(true);
    setDecidedColor(null);
    const chosenColor = Math.random() < 0.5 ? 'black' : 'white';

    setTimeout(() => {
      setDecidedColor(chosenColor);
      setHumanColor(chosenColor);
      setTimeout(() => {
        setIsColorDeciding(false);
      }, 1500); // Show result for 1.5 seconds before hiding
    }, 1500); // 1.5 seconds spinning animation
  }, []);

  const checkWin = (currentBoard: BoardState, row: number, col: number, player: 'black' | 'white'): Position[] | null => {
    const directions = [
      [0, 1],  // horizontal
      [1, 0],  // vertical
      [1, 1],  // diagonal right-down
      [1, -1]  // diagonal left-down
    ];

    for (const [dr, dc] of directions) {
      let count = 1;
      const line: Position[] = [{ row, col }];

      // check positive direction
      for (let i = 1; i < 5; i++) {
        const nr = row + dr * i;
        const nc = col + dc * i;
        if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE || currentBoard[nr][nc] !== player) break;
        count++;
        line.push({ row: nr, col: nc });
      }

      // check negative direction
      for (let i = 1; i < 5; i++) {
        const nr = row - dr * i;
        const nc = col - dc * i;
        if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE || currentBoard[nr][nc] !== player) break;
        count++;
        line.push({ row: nr, col: nc });
      }

      if (count >= 5) return line;
    }
    return null;
  };

  const checkDraw = (currentBoard: BoardState) => {
    return currentBoard.every(row => row.every(cell => cell !== null));
  };

  const WINDOW_SCORES = {
    5: 100000000,
    4: 2000000, // 4목 최우선
    3: 400000,  // 3목 가치 대폭 상향. (쌍삼 3-3 유도)
    2: 10000,   // 밀착 마크
    1: 100,
    0: 0
  };

  const evaluateBoardState = (board: BoardState, aiPlayer: Player, humanPlayer: Player): { aiWin: boolean, humanWin: boolean, score: number } => {
    let aiScore = 0;
    let humanScore = 0;
    let aiWin = false;
    let humanWin = false;

    const evaluateWindow = (r: number, c: number, dr: number, dc: number) => {
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
        let s = WINDOW_SCORES[aiStones as keyof typeof WINDOW_SCORES];
        if (dr !== 0 && dc !== 0) s *= 1.2;
        aiScore += s;
      } else if (humanStones > 0 && aiStones === 0) {
        if (humanStones === 5) humanWin = true;
        let s = WINDOW_SCORES[humanStones as keyof typeof WINDOW_SCORES];
        if (dr !== 0 && dc !== 0) s *= 1.2;
        humanScore += s;
      }
    };

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c <= BOARD_SIZE - 5; c++) {
        evaluateWindow(r, c, 0, 1);
      }
    }

    for (let c = 0; c < BOARD_SIZE; c++) {
      for (let r = 0; r <= BOARD_SIZE - 5; r++) {
        evaluateWindow(r, c, 1, 0);
      }
    }

    for (let r = 0; r <= BOARD_SIZE - 5; r++) {
      for (let c = 0; c <= BOARD_SIZE - 5; c++) {
        evaluateWindow(r, c, 1, 1);
      }
    }

    for (let r = 0; r <= BOARD_SIZE - 5; r++) {
      for (let c = 4; c < BOARD_SIZE; c++) {
        evaluateWindow(r, c, 1, -1);
      }
    }

    return {
      aiWin,
      humanWin,
      score: aiScore * 1.1 - humanScore
    };
  };

  const evaluateMove = (board: BoardState, r: number, c: number, player: 'black' | 'white', opponent: 'black' | 'white') => {
    // 1. 중앙 선호도 (Positional Bonus)
    // 체스나 오목 모두 중앙(7,7)을 장악할수록 유리합니다.
    const centerDist = Math.max(Math.abs(r - 7), Math.abs(c - 7));
    let score = (7 - centerDist) * 50;
    let isWin = false;

    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1]
    ];

    for (const [dr, dc] of directions) {
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
          let s = WINDOW_SCORES[pStones as keyof typeof WINDOW_SCORES];
          if (dr !== 0 && dc !== 0) s *= 1.2;
          score += s;
        }
      }
    }

    return { score, isWin };
  };

  const getCandidateMoves = (board: BoardState, aiPlayer: 'black' | 'white', humanPlayer: 'black' | 'white') => {
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
          const aiEval = evaluateMove(board, r, c, aiPlayer, humanPlayer);
          board[r][c] = null;
          
          board[r][c] = humanPlayer;
          const humanEval = evaluateMove(board, r, c, humanPlayer, aiPlayer);
          board[r][c] = null;
          
          let moveScore = aiEval.score + humanEval.score; 
          
          if (aiEval.isWin) moveScore += 500000000;
          else if (humanEval.isWin) moveScore += 200000000; 

          moves.push({ row: r, col: c, score: moveScore });
        }
      }
    }

    moves.sort((a, b) => b.score - a.score);
    return moves;
  };

  const minimax = (board: BoardState, depth: number, alpha: number, beta: number, isMaximizing: boolean, aiPlayer: 'black' | 'white', humanPlayer: 'black' | 'white'): number => {
    const boardEval = evaluateBoardState(board, aiPlayer, humanPlayer);
    
    if (boardEval.aiWin) return 50000000 + depth;
    if (boardEval.humanWin) return -50000000 - depth;
    if (depth === 0) return boardEval.score;

    const currentPlayer = isMaximizing ? aiPlayer : humanPlayer;
    const moves = getCandidateMoves(board, aiPlayer, humanPlayer);
    
    if (moves.length === 0) return 0;
    
    let searchMoves = [];
    // 강력한 핑계(강제수)가 발견되면 다른 가지는 탐색하지 않음 (승리 또는 필수 방어)
    if (moves[0].score >= 200000000) {
      searchMoves = [moves[0]];
    } else {
      // Forward Pruning: 깊이가 깊어질수록 상위 핵심 수만 탐색하여 연산량 최적화
      let branchLimit = 12;
      if (depth >= 9) branchLimit = 2; 
      else if (depth >= 7) branchLimit = 3;
      else if (depth >= 5) branchLimit = 4;
      else if (depth >= 3) branchLimit = 6;
      else if (depth >= 2) branchLimit = 8;
      
      searchMoves = moves.slice(0, branchLimit);
    }
    
    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const move of searchMoves) {
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
      for (const move of searchMoves) {
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
    
    if (moves[0].score >= 200000000) {
      return { row: moves[0].row, col: moves[0].col };
    }
    
    let bestScore = -Infinity;
    let bestMove = moves[0];
    
    const depthMap = {
      'easy': 1,
      'normal': 3,
      'hard': 5,
      'expert': 7,
      'god': 10
    };
    const searchDepth = depthMap[difficulty];
    
    // 루트 노드(첫 번째 수)에서는 조금 더 폭넓게 고려하되 
    // 깊이가 아주 깊을 때는 루트도 가지를 조금 칩니다.
    const rootBranchLimit = searchDepth >= 10 ? 6 : searchDepth >= 7 ? 8 : searchDepth >= 5 ? 10 : 12;
    const searchMoves = moves.slice(0, rootBranchLimit);
    
    for (const move of searchMoves) {
      currentBoard[move.row][move.col] = aiPlayer;
      const score = minimax(currentBoard, searchDepth, -Infinity, Infinity, false, aiPlayer, humanPlayer);
      currentBoard[move.row][move.col] = null;
      
      const finalScore = score + Math.random();

      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestMove = move;
      }
    }
    
    return bestMove;
  };

  const playMove = useCallback((row: number, col: number) => {
    if (!hasStarted || board[row][col] || winner || isAiThinking || currentPlayer !== humanColor || isColorDeciding) return;

    const aiPlayer = humanColor === 'black' ? 'white' : 'black';
    const humanPlayer = humanColor;

    const newBoard = board.map(r => [...r]);
    newBoard[row][col] = currentPlayer;
    
    setBoard(newBoard);
    setLastMove({ row, col });
    setCurrentPlayer(aiPlayer);

    const boardEval = evaluateBoardState(newBoard, aiPlayer, humanPlayer);
    if (boardEval.humanWin) {
      setWinner(humanPlayer);
      setWinningLine(checkWin(newBoard, row, col, humanPlayer) || []);
      setTimeout(() => setShowOverlay(true), 1500);
      if (onGameEnd) onGameEnd(true, difficulty);
      return;
    }
    
    if (boardEval.aiWin) {
      setWinner(aiPlayer);
      setWinningLine(checkWin(newBoard, row, col, aiPlayer) || []);
      setTimeout(() => setShowOverlay(true), 1500);
      if (onGameEnd) onGameEnd(false, difficulty);
      return;
    }

    if (checkDraw(newBoard)) {
      setWinner('draw');
      setTimeout(() => setShowOverlay(true), 500);
      return;
    }

  }, [board, currentPlayer, winner, isAiThinking, humanColor, isColorDeciding]);

  // AI Turn
  useEffect(() => {
    if (!hasStarted) return;
    if (currentPlayer !== humanColor && !winner && !isColorDeciding) {
      setIsAiThinking(true);
      const aiPlayer = humanColor === 'black' ? 'white' : 'black';
      const humanPlayer = humanColor;
      
      // Use setTimeout to allow UI to render human's move and show "AI Thinking"
      const timer = setTimeout(() => {
        const bestMove = findBestMove(board, aiPlayer);
        
        const newBoardAfterAi = board.map(r => [...r]);
        newBoardAfterAi[bestMove.row][bestMove.col] = aiPlayer;
        setBoard(newBoardAfterAi);
        setLastMove({ row: bestMove.row, col: bestMove.col });
        setCurrentPlayer(humanColor);

        const aiEval = evaluateBoardState(newBoardAfterAi, aiPlayer, humanPlayer);
        if (aiEval.humanWin) {
          setWinner(humanPlayer);
          setWinningLine(checkWin(newBoardAfterAi, bestMove.row, bestMove.col, humanPlayer) || []);
          setTimeout(() => setShowOverlay(true), 1500);
          if (onGameEnd) onGameEnd(true, difficulty);
          return;
        }
        
        if (aiEval.aiWin) {
          setWinner(aiPlayer);
          setWinningLine(checkWin(newBoardAfterAi, bestMove.row, bestMove.col, aiPlayer) || []);
          setTimeout(() => setShowOverlay(true), 1500);
          if (onGameEnd) onGameEnd(false, difficulty);
          return;
        } else if (checkDraw(newBoardAfterAi)) {
          setWinner('draw');
          setTimeout(() => setShowOverlay(true), 500);
        } else {
          setCurrentPlayer(humanColor);
        }
        setIsAiThinking(false);
      }, 300); // 300ms delay for realism
      
      return () => clearTimeout(timer);
    }
  }, [currentPlayer, board, winner, humanColor, isColorDeciding, hasStarted]);

  return {
    board,
    currentPlayer,
    winner,
    showOverlay,
    winningLine,
    lastMove,
    isAiThinking,
    humanColor,
    isColorDeciding,
    decidedColor,
    difficulty,
    setDifficulty,
    playMove,
    resetGame,
    hasStarted
  };
};
