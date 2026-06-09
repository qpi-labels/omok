import { useState, useCallback, useEffect } from 'react';

export type Player = 'black' | 'white' | null;
export type BoardState = Player[][];
export type Position = { row: number; col: number };

const BOARD_SIZE = 15;

const createEmptyBoard = (): BoardState => {
  return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
};

export const useOmok = () => {
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

  const resetGame = useCallback(() => {
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

  useEffect(() => {
    resetGame();
  }, [resetGame]);

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
    5: 10000000,
    4: 100000,
    3: 15000,
    2: 2000,
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
          const aiEval = evaluateBoardState(board, aiPlayer, humanPlayer);
          board[r][c] = null;
          
          board[r][c] = humanPlayer;
          const humanEval = evaluateBoardState(board, humanPlayer, aiPlayer);
          board[r][c] = null;
          
          let moveScore = aiEval.score + humanEval.score; 
          
          if (aiEval.aiWin) moveScore += 500000000;
          else if (humanEval.aiWin) moveScore += 200000000; 

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
    const moves = getCandidateMoves(board, aiPlayer, humanPlayer).slice(0, 12);
    
    if (moves.length === 0) return 0;
    
    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const move of moves) {
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
    
    const searchMoves = moves.slice(0, 12);
    for (const move of searchMoves) {
      currentBoard[move.row][move.col] = aiPlayer;
      const score = minimax(currentBoard, 3, -Infinity, Infinity, false, aiPlayer, humanPlayer);
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
    if (board[row][col] || winner || isAiThinking || currentPlayer !== humanColor) return;

    const newBoard = board.map(r => [...r]);
    newBoard[row][col] = currentPlayer;
    setBoard(newBoard);
    setLastMove({ row, col });

    const winLine = checkWin(newBoard, row, col, currentPlayer!);
    if (winLine) {
      setWinner(currentPlayer);
      setWinningLine(winLine);
      setTimeout(() => setShowOverlay(true), 1500); // delay overlay by 1.5s
      return;
    }

    if (checkDraw(newBoard)) {
      setWinner('draw');
      setTimeout(() => setShowOverlay(true), 500);
      return;
    }

    setCurrentPlayer(currentPlayer === 'black' ? 'white' : 'black');
  }, [board, currentPlayer, winner, isAiThinking]);

  // AI Turn
  useEffect(() => {
    if (currentPlayer !== humanColor && !winner) {
      setIsAiThinking(true);
      const aiPlayer = currentPlayer as 'black' | 'white';
      
      // Use setTimeout to allow UI to render human's move and show "AI Thinking"
      const timer = setTimeout(() => {
        const bestMove = findBestMove(board, aiPlayer);
        
        const newBoard = board.map(r => [...r]);
        newBoard[bestMove.row][bestMove.col] = aiPlayer;
        setBoard(newBoard);
        setLastMove({ row: bestMove.row, col: bestMove.col });

        const winLine = checkWin(newBoard, bestMove.row, bestMove.col, aiPlayer);
        if (winLine) {
          setWinner(aiPlayer);
          setWinningLine(winLine);
          setTimeout(() => setShowOverlay(true), 1500); // delay overlay
        } else if (checkDraw(newBoard)) {
          setWinner('draw');
          setTimeout(() => setShowOverlay(true), 500);
        } else {
          setCurrentPlayer(humanColor);
        }
        setIsAiThinking(false);
      }, 300); // 300ms delay for realism
      
      return () => clearTimeout(timer);
    }
  }, [currentPlayer, board, winner, humanColor]);

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
    playMove,
    resetGame
  };
};
