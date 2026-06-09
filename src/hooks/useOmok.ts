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

  const evaluateLine = (count: number, openEnds: number) => {
    if (count >= 5) return 1000000;
    if (count === 4) {
      if (openEnds === 2) return 100000;
      if (openEnds === 1) return 10000;
    }
    if (count === 3) {
      if (openEnds === 2) return 5000;
      if (openEnds === 1) return 500;
    }
    if (count === 2) {
      if (openEnds === 2) return 100;
      if (openEnds === 1) return 10;
    }
    if (count === 1 && openEnds === 2) return 1;
    return 0;
  };

  const evaluateCell = (currentBoard: BoardState, r: number, c: number, player: 'black' | 'white') => {
    let score = 0;
    const directions = [
      [0, 1], [1, 0], [1, 1], [1, -1]
    ];

    for (const [dr, dc] of directions) {
      let count = 1;
      let openEnds = 0;

      // check positive
      let posBlocked = false;
      for (let i = 1; i <= 4; i++) {
        const nr = r + dr * i;
        const nc = c + dc * i;
        if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) {
          posBlocked = true;
          break;
        }
        if (currentBoard[nr][nc] === player) {
          count++;
        } else if (currentBoard[nr][nc] === null) {
          openEnds++;
          break;
        } else {
          posBlocked = true;
          break;
        }
      }

      // check negative
      let negBlocked = false;
      for (let i = 1; i <= 4; i++) {
        const nr = r - dr * i;
        const nc = c - dc * i;
        if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) {
          negBlocked = true;
          break;
        }
        if (currentBoard[nr][nc] === player) {
          count++;
        } else if (currentBoard[nr][nc] === null) {
          openEnds++;
          break;
        } else {
          negBlocked = true;
          break;
        }
      }

      if (posBlocked && negBlocked && count < 5) continue; // dead line
      score += evaluateLine(count, openEnds);
    }
    return score;
  };

  const findBestMove = (currentBoard: BoardState, aiPlayer: 'black' | 'white') => {
    const humanPlayer = aiPlayer === 'black' ? 'white' : 'black';
    let bestScore = -1;
    let bestMoves: Position[] = [];

    // If first move and board is empty, place in center
    let isEmpty = true;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (currentBoard[r][c] !== null) {
          isEmpty = false;
          break;
        }
      }
      if (!isEmpty) break;
    }
    if (isEmpty) return { row: 7, col: 7 };

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (currentBoard[r][c] !== null) continue;

        // Evaluate attack score (AI making a line)
        const attackScore = evaluateCell(currentBoard, r, c, aiPlayer);
        // Evaluate defense score (blocking human making a line)
        const defenseScore = evaluateCell(currentBoard, r, c, humanPlayer);

        // Defensive moves are slightly more important to prevent immediate losses
        const score = attackScore + defenseScore * 1.2;

        if (score > bestScore) {
          bestScore = score;
          bestMoves = [{ row: r, col: c }];
        } else if (score === bestScore) {
          bestMoves.push({ row: r, col: c });
        }
      }
    }

    // Randomize slightly between equal best moves
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  };

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
      
      // Use setTimeout to allow UI to render human's move and show "AI Thinking"
      const timer = setTimeout(() => {
        const bestMove = findBestMove(board, 'white');
        
        const newBoard = board.map(r => [...r]);
        newBoard[bestMove.row][bestMove.col] = 'white';
        setBoard(newBoard);
        setLastMove({ row: bestMove.row, col: bestMove.col });

        const winLine = checkWin(newBoard, bestMove.row, bestMove.col, 'white');
        if (winLine) {
          setWinner('white');
          setWinningLine(winLine);
          setTimeout(() => setShowOverlay(true), 1500); // delay overlay
        } else if (checkDraw(newBoard)) {
          setWinner('draw');
          setTimeout(() => setShowOverlay(true), 500);
        } else {
          setCurrentPlayer('black');
        }
        setIsAiThinking(false);
      }, 300); // 300ms delay for realism
      
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
