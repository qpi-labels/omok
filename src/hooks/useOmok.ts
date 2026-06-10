import { useState, useCallback, useEffect, useRef } from 'react';

export type Player = 'black' | 'white' | null;
export type BoardState = Player[][];
export type Position = { row: number; col: number };
export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert' | 'god';
export interface AiStats {
  nodesEvaluated: number;
  searchDepth: number;
  timeTakenMs: number;
  evalScore: number;
  playStyle: number;
}

const BOARD_SIZE = 15;

const createEmptyBoard = (): BoardState => {
  return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
};

export const useOmok = (onGameEnd?: (isHumanWin: boolean, diff: Difficulty) => void) => {
  const onGameEndRef = useRef(onGameEnd);
  useEffect(() => {
    onGameEndRef.current = onGameEnd;
  }, [onGameEnd]);

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
  const [difficulty, setDifficulty] = useState<Difficulty>(() => {
    return (localStorage.getItem('omokDifficulty') as Difficulty) || 'hard';
  });
  const [playStyle, setPlayStyle] = useState<number>(0.5);
  const [hasStarted, setHasStarted] = useState(false);
  const [aiStatsHistory, setAiStatsHistory] = useState<AiStats[]>([]);
  const [latestAiStats, setLatestAiStats] = useState<AiStats | null>(null);
  
  const aiWorker = useRef<Worker | null>(null);

  useEffect(() => {
    aiWorker.current = new Worker(new URL('../workers/aiWorker.ts', import.meta.url), { type: 'module' });
    return () => {
      aiWorker.current?.terminate();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('omokDifficulty', difficulty);
  }, [difficulty]);

  const resetGame = useCallback(() => {
    setHasStarted(true);
    setBoard(createEmptyBoard());
    setCurrentPlayer('black');
    setWinner(null);
    setShowOverlay(false);
    setWinningLine([]);
    setLastMove(null);
    setIsAiThinking(false);
    setAiStatsHistory([]);
    setLatestAiStats(null);

    if (['hard', 'expert', 'god'].includes(difficulty)) {
      setPlayStyle(Math.random()); // 0.0 to 1.0 range
    } else {
      setPlayStyle(0.5);
    }
    
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
  }, [difficulty]);

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

  const playMove = useCallback((row: number, col: number) => {
    if (!hasStarted || board[row][col] || winner || isAiThinking || currentPlayer !== humanColor || isColorDeciding) return;

    const aiPlayer = humanColor === 'black' ? 'white' : 'black';
    const humanPlayer = humanColor;

    const newBoard = board.map(r => [...r]);
    newBoard[row][col] = currentPlayer;
    
    setBoard(newBoard);
    setLastMove({ row, col });
    setCurrentPlayer(aiPlayer);

    const winLine = checkWin(newBoard, row, col, humanPlayer);
    if (winLine) {
      setWinner(humanPlayer);
      setWinningLine(winLine);
      setTimeout(() => setShowOverlay(true), 1500);
      if (onGameEndRef.current) onGameEndRef.current(true, difficulty);
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
    if (!hasStarted || winner || isColorDeciding) return;
    
    if (currentPlayer !== humanColor && !isAiThinking) {
      setIsAiThinking(true);
      const aiPlayer = humanColor === 'black' ? 'white' : 'black';
      
      if (aiWorker.current) {
        aiWorker.current.onmessage = (e) => {
          const { bestMove, stats } = e.data;
          
          if (stats) {
            setLatestAiStats(stats);
            setAiStatsHistory(prev => [...prev, stats]);
          }
          
          const newBoardAfterAi = board.map(r => [...r]);
          newBoardAfterAi[bestMove.row][bestMove.col] = aiPlayer;
          setBoard(newBoardAfterAi);
          setLastMove({ row: bestMove.row, col: bestMove.col });
          setCurrentPlayer(humanColor);

          const winLine = checkWin(newBoardAfterAi, bestMove.row, bestMove.col, aiPlayer);
          if (winLine) {
            setWinner(aiPlayer);
            setWinningLine(winLine);
            setTimeout(() => setShowOverlay(true), 1500);
            if (onGameEndRef.current) onGameEndRef.current(false, difficulty);
          } else if (checkDraw(newBoardAfterAi)) {
            setWinner('draw');
            setTimeout(() => setShowOverlay(true), 500);
          }
          setIsAiThinking(false);
        };
        
        // Post message to worker to compute next move
        aiWorker.current.postMessage({ board, aiPlayer, difficulty, humanColor, playStyle });
      }
    }
  }, [currentPlayer, board, winner, humanColor, isColorDeciding, hasStarted, difficulty, playStyle]);

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
    hasStarted,
    playStyle,
    aiStatsHistory,
    latestAiStats
  };
};
