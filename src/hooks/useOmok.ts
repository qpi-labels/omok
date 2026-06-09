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

        const attackScore = evaluateCell(currentBoard, r, c, aiPlayer);
        const defenseScore = evaluateCell(currentBoard, r, c, humanPlayer);

        if (attackScore >= 10000000) {
          return { row: r, col: c }; // Immediate win
        }

        let score = attackScore * 1.1 + defenseScore;
        if (defenseScore >= 10000000) {
          score += 20000000; // Must block opponent win
        }

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
