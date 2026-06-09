import { useState, useCallback, useEffect, useRef } from 'react';

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

  const resetGame = () => {
    setBoard(createEmptyBoard());
    setCurrentPlayer('black');
    setWinner(null);
    setShowOverlay(false);
    setWinningLine([]);
    setLastMove(null);
    setIsAiThinking(false);
  };

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

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(new URL('../workers/omokWorker.ts', import.meta.url), { type: 'module' });
    
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const playMove = useCallback((row: number, col: number) => {
    if (board[row][col] || winner || isAiThinking) return;

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
    if (currentPlayer === 'white' && !winner) {
      setIsAiThinking(true);
      
      const timer = setTimeout(() => {
        if (!workerRef.current) return;
        
        workerRef.current.onmessage = (e) => {
          const { row, col } = e.data;
          
          const newBoard = board.map(r => [...r]);
          newBoard[row][col] = 'white';
          setBoard(newBoard);
          setLastMove({ row, col });

          const winLine = checkWin(newBoard, row, col, 'white');
          if (winLine) {
            setWinner('white');
            setWinningLine(winLine);
            setTimeout(() => setShowOverlay(true), 1500);
          } else if (checkDraw(newBoard)) {
            setWinner('draw');
            setTimeout(() => setShowOverlay(true), 500);
          } else {
            setCurrentPlayer('black');
          }
          setIsAiThinking(false);
        };
        
        // Start Web Worker calculation
        workerRef.current.postMessage({ board, aiPlayer: 'white' });
      }, 50); // Small delay to let UI render "AI Thinking" before worker takes over CPU
      
      return () => clearTimeout(timer);
    }
  }, [currentPlayer, board, winner]);

  return {
    board,
    currentPlayer,
    winner,
    showOverlay,
    winningLine,
    lastMove,
    isAiThinking,
    playMove,
    resetGame
  };
};
