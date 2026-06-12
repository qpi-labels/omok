import { useOmok, Difficulty } from './hooks/useOmok';
import { useEffect, useState, useRef } from 'react';
import { useFirebase } from './hooks/useFirebase';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import './omok.css';
import { useAlkkagi } from './hooks/useAlkkagi';
import { AlkkagiBoard } from './components/AlkkagiBoard';
import { NetworkRoom } from './utils/network';
import { initializePeer, connectToPeer, sendP2PData, registerConnection, closeP2P } from './utils/p2pNetwork';

function App() {
  const [isPracticeMode, setIsPracticeMode] = useState(() => {
    return localStorage.getItem('omokPracticeMode') === 'true';
  });
  const [govatarOpponent, setGovatarOpponent] = useState<{ uid: string; name: string; playStyle: number; difficulty: Difficulty } | null>(null);
  
  // LAN MultiPlayer States
  const [roomCode, setRoomCode] = useState('');
  const [activeRoom, setActiveRoom] = useState<NetworkRoom | null>(null);
  const [networkRole, setNetworkRole] = useState<'black' | 'white' | null>(null); // Guest is white, Creator is black
  const isUpdatingNetworkRef = useRef(false);
  const prevAlkkagiPlayerRef = useRef<string | null>(null);
  const hasReportedOmokResultRef = useRef(false);
  const hasReportedAlkkagiResultRef = useRef(false);
  const [lanPlacementTimer, setLanPlacementTimer] = useState<number | null>(null);
  const isAlkkagiDraggingRef = useRef(false);

  const { profile, loginWithGoogle, logout, updateGameResult, updateAlkkagiResult, updateNickname, startGovatarTraining, cancelGovatarTraining, rankBadge, isLoading, user } = useFirebase();
  const [gameMode, setGameMode] = useState<'home' | 'omok' | 'alkkagi'>('home');
  const [omokMode, setOmokMode] = useState<'vs_ai' | 'vs_player' | 'vs_lan'>('vs_ai');
  const [alkkagiMode, setAlkkagiMode] = useState<'vs_ai' | 'vs_player' | 'vs_lan'>('vs_ai');

  const { board, currentPlayer, winner, showOverlay, winningLine, lastMove, isAiThinking, humanColor, isColorDeciding, decidedColor, difficulty, setDifficulty, playMove, resetGame, hasStarted, aiStatsHistory, latestAiStats, tutorialMode, setTutorialMode, tutorialDifficulty, setTutorialDifficulty, tutorialHint, isCalculatingHint, requestHint, setBoard, setWinner, setWinningLine, setLastMove, setCurrentPlayer, setHumanColor, decidedColor: _unusedDecidedColor, setDecidedColor, setHasStarted } = useOmok((isWin, diff, turnsPlayed) => {
    if (omokMode !== 'vs_lan' && (!isPracticeMode || profile?.govatarTrainingMode) && omokMode !== 'vs_player') {
      updateGameResult(diff, isWin, turnsPlayed, govatarOpponent);
    }
  }, govatarOpponent, omokMode === 'vs_player' || omokMode === 'vs_lan');

  const [alkkagiStonesCount, setAlkkagiStonesCount] = useState<number>(7);
  
  const {
    stones: alkkagiStones,
    currentPlayer: alkkagiCurrentPlayer,
    winner: alkkagiWinner,
    isSimulating: alkkagiIsSimulating,
    shoot: alkkagiShoot,
    resetGame: alkkagiResetGame,
    setStones: setAlkkagiStones,
    setCurrentPlayer: setAlkkagiCurrentPlayer,
    setWinner: setAlkkagiWinner,
    setIsSimulating: setAlkkagiIsSimulating,
    turnCount: alkkagiTurnCount,
    setTurnCount: setAlkkagiTurnCount,
    collisionEvents: alkkagiCollisionEvents
  } = useAlkkagi(isPracticeMode, alkkagiMode === 'vs_player' || alkkagiMode === 'vs_lan', alkkagiStonesCount, (winnerColor, turnCount) => {
    if (alkkagiMode !== 'vs_lan' && !isPracticeMode && alkkagiMode !== 'vs_player') {
      const isWin = winnerColor === 'black';
      updateAlkkagiResult(isWin, false, turnCount);
    }
  });

  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showDiffInfo, setShowDiffInfo] = useState(false);
  const [showRankInfo, setShowRankInfo] = useState(false);
  const [showGameInfo, setShowGameInfo] = useState(false);
  const [pendingGovatarChallenge, setPendingGovatarChallenge] = useState<{uid: string, name: string, playStyle: number, difficulty: Difficulty} | null>(null);

  // Force practice mode off if in training mode
  useEffect(() => {
    if (profile?.govatarTrainingMode) {
      setIsPracticeMode(false);
      localStorage.setItem('omokPracticeMode', 'false');
    }
  }, [profile?.govatarTrainingMode]);
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [leaderboardTab, setLeaderboardTab] = useState<'omok' | 'alkkagi'>('omok');
  const [cursorPos, setCursorPos] = useState({ row: 7, col: 7 });
  const [hoverPos, setHoverPos] = useState<{row: number, col: number} | null>(null);
  const [hasCheckedAbandonment, setHasCheckedAbandonment] = useState(false);
  const [showAiStats, setShowAiStats] = useState(false);

  const stoneCount = board.flat().filter(cell => cell !== null).length;

  useEffect(() => {
    if (isLoading || hasCheckedAbandonment) return;
    
    if (profile) {
      const abandonedDiff = localStorage.getItem('omokOngoingGame');
      const wasPractice = localStorage.getItem('omokOngoingPractice') === 'true';
      if (abandonedDiff) {
        if (!wasPractice) {
          updateGameResult(abandonedDiff as any, false);
        }
        localStorage.removeItem('omokOngoingGame');
        localStorage.removeItem('omokOngoingPractice');
      }
    } else {
      localStorage.removeItem('omokOngoingGame');
      localStorage.removeItem('omokOngoingPractice');
    }
    setHasCheckedAbandonment(true);
  }, [isLoading, profile, updateGameResult, hasCheckedAbandonment]);

  useEffect(() => {
    if (omokMode !== 'vs_lan' && hasStarted && !winner && !isColorDeciding && stoneCount >= 2) {
      localStorage.setItem('omokOngoingGame', difficulty);
      localStorage.setItem('omokOngoingPractice', String(isPracticeMode));
    } else {
      localStorage.removeItem('omokOngoingGame');
      localStorage.removeItem('omokOngoingPractice');
    }
  }, [hasStarted, winner, isColorDeciding, difficulty, isPracticeMode, stoneCount, omokMode]);

  const handleNewGame = () => {
    if (omokMode !== 'vs_lan' && hasStarted && !winner && !isColorDeciding && stoneCount >= 2) {
      if (!isPracticeMode || profile?.govatarTrainingMode) {
        updateGameResult(difficulty, false, stoneCount, govatarOpponent);
      }
    }
    
    // If in training mode, pick a random difficulty silently
    if (profile?.govatarTrainingMode) {
      const diffs: Difficulty[] = ['normal', 'hard', 'expert'];
      const randomDiff = diffs[Math.floor(Math.random() * diffs.length)];
      setDifficulty(randomDiff);
    }
    
    resetGame();
  };

  const handleLANReset = (mode: 'omok' | 'alkkagi') => {
    const hostColor = Math.random() < 0.5 ? 'black' : 'white';
    const guestColor = hostColor === 'black' ? 'white' : 'black';
    setNetworkRole(hostColor);
    setHumanColor(hostColor);

    if (mode === 'omok') {
      resetGame();
      sendP2PData({ type: 'reset', gameMode: 'omok', assignedRole: guestColor });
    } else {
      alkkagiResetGame();
      setLanPlacementTimer(15);
      sendP2PData({ type: 'reset', gameMode: 'alkkagi', assignedRole: guestColor });
    }
  };

  const handleOpenLeaderboard = async (tab?: 'omok' | 'alkkagi') => {
    if (!profile) {
      alert("로그인이 필요합니다.");
      return;
    }
    const targetTab = tab || (gameMode === 'home' ? 'omok' : gameMode);
    setLeaderboardTab(targetTab);
    setShowLeaderboard(true);
    setLeaderboardData([]);
    try {
      if (db) {
        const docKey = targetTab === 'omok' ? 'global' : 'alkkagi';
        const docSnap = await getDoc(doc(db, 'leaderboard', docKey));
        if (docSnap.exists()) {
          setLeaderboardData(docSnap.data().topPlayers || []);
        } else {
          setLeaderboardData([]);
        }
      }
    } catch (e) {
      console.error("Failed to load leaderboard:", e);
      setLeaderboardData([]);
    }
  };

  // WebRTC P2P MultiPlayer synchronization hook
  useEffect(() => {
    if (omokMode === 'vs_lan' || alkkagiMode === 'vs_lan') {
      // P2P status and sync will be managed by active room connections
    }
  }, [omokMode, alkkagiMode]);

  // Sync state changes to PeerJS connection during LAN match
  const syncGameStateToNetwork = (newGameMode: 'omok' | 'alkkagi') => {
    if (!activeRoom?.id || isUpdatingNetworkRef.current) return;
    
    if (newGameMode === 'omok') {
      sendP2PData({
        type: 'omokState',
        omokState: {
          board: JSON.stringify(board),
          lastMove,
          currentPlayer: currentPlayer as 'black' | 'white',
          winner,
          winningLine,
          decidedColor,
          hasStarted
        }
      });
    } else {
      sendP2PData({
        type: 'alkkagiState',
        alkkagiState: {
          stones: alkkagiStones,
          currentPlayer: alkkagiCurrentPlayer,
          winner: alkkagiWinner,
          isSimulating: alkkagiIsSimulating,
          turnCount: alkkagiTurnCount
        }
      });
    }
  };

  // Run synchronization effect whenever game states change in LAN mode
  useEffect(() => {
    if (omokMode === 'vs_lan' && gameMode === 'omok' && activeRoom?.id) {
      syncGameStateToNetwork('omok');
    }
  }, [board, lastMove, currentPlayer, winner, winningLine, decidedColor, hasStarted, omokMode, gameMode, activeRoom?.id]);

  useEffect(() => {
    if (alkkagiMode === 'vs_lan' && gameMode === 'alkkagi' && activeRoom?.id) {
      if (lanPlacementTimer !== null) {
        if (isAlkkagiDraggingRef.current) {
          syncGameStateToNetwork('alkkagi');
        }
      } else {
        // Sync if it is our turn or was just our turn (to send the final end-of-turn/simulation state)
        const isMyTurn = alkkagiCurrentPlayer === networkRole;
        const wasMyTurn = prevAlkkagiPlayerRef.current === networkRole;
        if (isMyTurn || wasMyTurn) {
          syncGameStateToNetwork('alkkagi');
        }
      }
    }
    prevAlkkagiPlayerRef.current = alkkagiCurrentPlayer;
  }, [alkkagiStones, alkkagiCurrentPlayer, alkkagiWinner, alkkagiIsSimulating, alkkagiMode, gameMode, activeRoom?.id, networkRole, lanPlacementTimer]);

  // Countdown timer for LAN Alkkagi placement phase
  useEffect(() => {
    if (lanPlacementTimer === null) return;

    if (lanPlacementTimer <= 0) {
      setLanPlacementTimer(null);
      return;
    }

    const timer = setInterval(() => {
      setLanPlacementTimer((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [lanPlacementTimer]);

  // LAN Omok result reporting
  useEffect(() => {
    if (omokMode === 'vs_lan' && winner && winner !== 'draw') {
      if (!hasReportedOmokResultRef.current) {
        hasReportedOmokResultRef.current = true;
        const turnsPlayed = board.flat().filter(c => c !== null).length;
        const isWin = winner === humanColor;
        updateGameResult('normal', isWin, turnsPlayed, null, true);
      }
    }
    if (!winner) {
      hasReportedOmokResultRef.current = false;
    }
  }, [winner, omokMode, humanColor, board]);

  // LAN Alkkagi result reporting
  useEffect(() => {
    if (alkkagiMode === 'vs_lan' && alkkagiWinner) {
      if (!hasReportedAlkkagiResultRef.current) {
        hasReportedAlkkagiResultRef.current = true;
        const isWin = alkkagiWinner === networkRole;
        updateAlkkagiResult(isWin, true, alkkagiTurnCount);
      }
    }
    if (!alkkagiWinner) {
      hasReportedAlkkagiResultRef.current = false;
    }
  }, [alkkagiWinner, alkkagiMode, networkRole, alkkagiTurnCount]);

  const changeRoomGameMode = (newMode: 'omok' | 'alkkagi', initialStones: any[] = []) => {
    const hostColor = Math.random() < 0.5 ? 'black' : 'white';
    const guestColor = hostColor === 'black' ? 'white' : 'black';
    setNetworkRole(hostColor);
    setHumanColor(hostColor);
    setIsPracticeMode(false);

    setGameMode(newMode);
    if (newMode === 'omok') {
      setOmokMode('vs_lan');
      setBoard(Array(15).fill(null).map(() => Array(15).fill(null)));
      setLastMove(null);
      setCurrentPlayer('black');
      setWinner(null);
      setWinningLine([]);
      setDecidedColor('black');
      setHasStarted(true);
    } else {
      setAlkkagiMode('vs_lan');
      setLanPlacementTimer(15);
      setAlkkagiStones(initialStones);
      setAlkkagiCurrentPlayer('black');
      setAlkkagiWinner(null);
      setAlkkagiIsSimulating(false);
    }
    sendP2PData({
      type: 'gameMode',
      gameMode: newMode,
      assignedRole: guestColor,
      alkkagiState: newMode === 'alkkagi' ? {
        stones: initialStones,
        currentPlayer: 'black',
        winner: null,
        isSimulating: false,
        turnCount: 0
      } : undefined
    });
  };

  // Handle LAN P2P actions
  const handleCreateRoom = async () => {
    if (!user) {
      alert("LAN 플레이는 구글 로그인 후에만 가능합니다.");
      return;
    }
    const code = 'ROOM_' + Math.random().toString(36).substring(2, 6).toUpperCase();
    try {
      const p = await initializePeer(code);
      
      setRoomCode(code);
      setNetworkRole('black');
      setHumanColor('black');
      setIsPracticeMode(false);
      if (gameMode === 'omok') setOmokMode('vs_lan');
      else setAlkkagiMode('vs_lan');
      
      setActiveRoom({
        id: code,
        gameMode: gameMode === 'home' ? 'omok' : gameMode,
        createdBy: user.uid,
        status: 'waiting',
        lastActionTime: Date.now()
      });

      // Listen for incoming connection from guest
      p.on('connection', (conn) => {
        registerConnection(conn);
        
        // Block sync effects from sending stale state during reset
        isUpdatingNetworkRef.current = true;
        
        // Notify host active status
        setActiveRoom((prev) => prev ? { ...prev, status: 'active' } : null);
        
        // Randomize roles
        const hostColor = Math.random() < 0.5 ? 'black' : 'white';
        const guestColor = hostColor === 'black' ? 'white' : 'black';
        setNetworkRole(hostColor);
        setHumanColor(hostColor);

        // Reset omok state for the host as well
        setBoard(Array(15).fill(null).map(() => Array(15).fill(null)));
        setLastMove(null);
        setCurrentPlayer('black');
        setWinner(null);
        setWinningLine([]);
        setDecidedColor('black');
        setHasStarted(true);

        // Create initial alkkagi stones
        const initialStones: import('./hooks/useAlkkagi').AlkkagiStone[] = [];
        let idCounter = 0;
        for (let i = 0; i < alkkagiStonesCount; i++) {
          initialStones.push({
            id: idCounter++,
            x: alkkagiStonesCount === 1 ? 250 : 50 + i * (500 - 100) / (alkkagiStonesCount - 1),
            y: 500 - 60,
            vx: 0,
            vy: 0,
            omega: 0,
            angle: 0,
            color: 'black' as const,
            radius: 16,
            active: true,
            isFalling: false,
            scale: 1,
            hitFlash: 0,
          });
        }
        for (let i = 0; i < alkkagiStonesCount; i++) {
          initialStones.push({
            id: idCounter++,
            x: alkkagiStonesCount === 1 ? 250 : 50 + i * (500 - 100) / (alkkagiStonesCount - 1),
            y: 60,
            vx: 0,
            vy: 0,
            omega: 0,
            angle: 0,
            color: 'white' as const,
            radius: 16,
            active: true,
            isFalling: false,
            scale: 1,
            hitFlash: 0,
          });
        }

        // Reset alkkagi state for the host
        setAlkkagiStones(initialStones);
        setAlkkagiCurrentPlayer('black');
        setAlkkagiWinner(null);
        setAlkkagiIsSimulating(false);
        setLanPlacementTimer(15);

        // Unblock sync after React state has settled
        setTimeout(() => {
          isUpdatingNetworkRef.current = false;
        }, 100);

        // Send initial game config
        conn.on('open', () => {
          conn.send({
            type: 'init',
            gameMode,
            assignedRole: guestColor,
            alkkagiState: {
              stones: initialStones,
              currentPlayer: 'black',
              winner: null,
              isSimulating: false,
              turnCount: 0
            }
          });
        });

        conn.on('data', (data: any) => {
          isUpdatingNetworkRef.current = true;
          const payload = data as import('./utils/p2pNetwork').P2PPayload;
          
          if (payload.type === 'omokState' && payload.omokState) {
            const state = payload.omokState;
            try {
              const parsedBoard = typeof state.board === 'string' ? JSON.parse(state.board) : state.board;
              setBoard(parsedBoard);
            } catch (e) {
              console.error(e);
            }
            setLastMove(state.lastMove);
            setCurrentPlayer(state.currentPlayer);
            setWinner(state.winner);
            setWinningLine(state.winningLine);
            setDecidedColor(state.decidedColor);
            setHasStarted(state.hasStarted);
          }

          if (payload.type === 'alkkagiState' && payload.alkkagiState) {
            const state = payload.alkkagiState;
            setAlkkagiStones(state.stones);
            setAlkkagiCurrentPlayer(state.currentPlayer);
            setAlkkagiWinner(state.winner);
            setAlkkagiIsSimulating(state.isSimulating);
            if (state.turnCount !== undefined) setAlkkagiTurnCount(state.turnCount);
          }

          if (payload.type === 'reset') {
            if (payload.gameMode === 'omok') {
              resetGame();
            } else if (payload.gameMode === 'alkkagi') {
              alkkagiResetGame();
            }
          }
          isUpdatingNetworkRef.current = false;
        });

        conn.on('close', () => {
          alert('상대방이 방을 나갔습니다.');
          handleExitRoom();
        });
      });

      alert(`P2P 대기실이 개설되었습니다! 방 코드: ${code}`);
    } catch (err) {
      alert("P2P 방 생성 실패: " + err);
    }
  };

  const handleJoinRoom = async () => {
    if (!user) {
      alert("LAN 플레이는 구글 로그인 후에만 가능합니다.");
      return;
    }
    if (!roomCode.trim()) {
      alert("방 코드를 입력해주세요.");
      return;
    }
    const cleanRoomCode = roomCode.trim().toUpperCase();
    try {
      const conn = await connectToPeer(cleanRoomCode);
      
      setNetworkRole('white');
      setHumanColor('white');
      setIsPracticeMode(false);
      if (gameMode === 'omok') setOmokMode('vs_lan');
      else setAlkkagiMode('vs_lan');
      
      setActiveRoom({
        id: cleanRoomCode,
        gameMode: gameMode === 'home' ? 'omok' : gameMode,
        createdBy: '',
        status: 'active',
        lastActionTime: Date.now()
      });

      conn.on('data', (data: any) => {
        isUpdatingNetworkRef.current = true;
        const payload = data as import('./utils/p2pNetwork').P2PPayload;
        
        if (payload.type === 'init' || payload.type === 'gameMode') {
          if (payload.assignedRole) {
            setNetworkRole(payload.assignedRole);
            setHumanColor(payload.assignedRole);
          }
          if (payload.gameMode) {
            setGameMode(payload.gameMode);

            // Always reset both game modes so both sides start fresh
            setOmokMode(payload.gameMode === 'omok' ? 'vs_lan' : 'vs_ai');
            setAlkkagiMode(payload.gameMode === 'alkkagi' ? 'vs_lan' : 'vs_ai');

            // Reset omok state
            setBoard(Array(15).fill(null).map(() => Array(15).fill(null)));
            setLastMove(null);
            setCurrentPlayer('black');
            setWinner(null);
            setWinningLine([]);
            setDecidedColor('black');
            setHasStarted(true);

            // Reset alkkagi state
            setLanPlacementTimer(payload.gameMode === 'alkkagi' ? 15 : null);
            if (payload.alkkagiState) {
              setAlkkagiStones(payload.alkkagiState.stones);
              setAlkkagiCurrentPlayer(payload.alkkagiState.currentPlayer);
              setAlkkagiWinner(payload.alkkagiState.winner);
              setAlkkagiIsSimulating(payload.alkkagiState.isSimulating);
              setAlkkagiTurnCount(payload.alkkagiState.turnCount || 0);
            }
          }
        }

        if (payload.type === 'omokState' && payload.omokState) {
          const state = payload.omokState;
          try {
            const parsedBoard = typeof state.board === 'string' ? JSON.parse(state.board) : state.board;
            setBoard(parsedBoard);
          } catch (e) {
            console.error(e);
          }
          setLastMove(state.lastMove);
          setCurrentPlayer(state.currentPlayer);
          setWinner(state.winner);
          setWinningLine(state.winningLine);
          setDecidedColor(state.decidedColor);
          setHasStarted(state.hasStarted);
        }

        if (payload.type === 'alkkagiState' && payload.alkkagiState) {
          const state = payload.alkkagiState;
          setAlkkagiStones(state.stones);
          setAlkkagiCurrentPlayer(state.currentPlayer);
          setAlkkagiWinner(state.winner);
          setAlkkagiIsSimulating(state.isSimulating);
          if (state.turnCount !== undefined) setAlkkagiTurnCount(state.turnCount);
        }

        if (payload.type === 'reset') {
          if (payload.assignedRole) {
            setNetworkRole(payload.assignedRole);
            setHumanColor(payload.assignedRole);
          }
          if (payload.gameMode === 'omok') {
            resetGame();
          } else if (payload.gameMode === 'alkkagi') {
            alkkagiResetGame();
            setLanPlacementTimer(15);
          }
        }
        isUpdatingNetworkRef.current = false;
      });

      conn.on('close', () => {
        alert('방장과의 연결이 끊어졌습니다.');
        handleExitRoom();
      });

      alert("방에 성공적으로 접속했습니다! (P2P)");
    } catch (err) {
      alert("P2P 방 입장 실패: " + err);
    }
  };

  const handleExitRoom = (newMode?: 'vs_ai' | 'vs_player' | 'vs_lan') => {
    closeP2P();
    setActiveRoom(null);
    setNetworkRole(null);
    if (newMode) {
      if (gameMode === 'omok') setOmokMode(newMode);
      else setAlkkagiMode(newMode);
    } else {
      if (gameMode === 'omok') setOmokMode('vs_ai');
      else setAlkkagiMode('vs_ai');
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('omokPracticeMode', String(isPracticeMode));
    if (!isPracticeMode) setShowAiStats(false);
  }, [isPracticeMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!hasStarted || winner || isAiThinking || currentPlayer !== humanColor || isColorDeciding) return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursorPos(prev => ({ ...prev, row: Math.max(0, prev.row - 1) }));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursorPos(prev => ({ ...prev, row: Math.min(14, prev.row + 1) }));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCursorPos(prev => ({ ...prev, col: Math.max(0, prev.col - 1) }));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCursorPos(prev => ({ ...prev, col: Math.min(14, prev.col + 1) }));
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        playMove(cursorPos.row, cursorPos.col);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasStarted, winner, isAiThinking, currentPlayer, humanColor, isColorDeciding, playMove, cursorPos]);

  return (
    <>
      <div className="portrait-overlay">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pdf-mb-200" style={{ color: 'var(--color-functional-red)' }}>
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" transform="rotate(90 12 12)"></rect>
          <line x1="12" y1="18" x2="12.01" y2="18"></line>
        </svg>
        <h2 className="pdf-text-heading-24 pdf-mb-100" style={{ color: 'var(--color-text-primary)' }}>가로 모드로 회전해 주세요</h2>
        <p className="pdf-text-copy-14 pdf-text-muted">원활한 오목 플레이를 위해 기기를 가로로 눕혀주세요.</p>
      </div>
      <div className="pdf-app">
      <aside className="pdf-sidebar">
        <div className="pdf-p-300">
          <div className="pdf-flex-col pdf-mb-200">
            <div className="pdf-text-heading-24 pdf-font-bold" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🎮</span> 미니게임
            </div>
          </div>

          {/* Game List Selector */}
          <div className="pdf-nav-group-header" style={{ marginTop: 'var(--space-100)' }}>GAMES</div>
          <div className="pdf-mt-050 pdf-mb-200">
            <div className="pdf-flex-col">
              <div 
                className={`pdf-nav-item ${gameMode === 'home' ? 'active' : ''}`}
                onClick={() => setGameMode('home')}
                style={{ borderRadius: '8px', padding: '10px 12px', marginBottom: '4px' }}
              >
                <div className="pdf-flex-row pdf-items-center pdf-gap-100">
                  <span style={{ fontSize: '16px' }}>🏠</span>
                  <span className="pdf-text-label-14-mono">홈 (Home)</span>
                </div>
                {gameMode === 'home' && <div className="pdf-indicator-dot" />}
              </div>
              <div 
                className={`pdf-nav-item ${gameMode === 'omok' ? 'active' : ''}`}
                onClick={() => setGameMode('omok')}
                style={{ borderRadius: '8px', padding: '10px 12px', marginBottom: '4px' }}
              >
                <div className="pdf-flex-row pdf-items-center pdf-gap-100">
                  <span style={{ fontSize: '16px' }}>⚫</span>
                  <span className="pdf-text-label-14-mono">오목 (Gomoku)</span>
                </div>
                {gameMode === 'omok' && <div className="pdf-indicator-dot" />}
              </div>
              <div 
                className={`pdf-nav-item ${gameMode === 'alkkagi' ? 'active' : ''}`}
                onClick={() => setGameMode('alkkagi')}
                style={{ borderRadius: '8px', padding: '10px 12px' }}
              >
                <div className="pdf-flex-row pdf-items-center pdf-gap-100">
                  <span style={{ fontSize: '16px' }}>💥</span>
                  <span className="pdf-text-label-14-mono">알까기 (Alkkagi)</span>
                </div>
                {gameMode === 'alkkagi' && <div className="pdf-indicator-dot" />}
              </div>
            </div>
          </div>

          <div className="pdf-nav-group-header">PROFILE</div>
          <div className="pdf-mt-050 pdf-mb-200">
            {isLoading ? (
              <div className="pdf-text-label-14-mono pdf-text-muted">Loading...</div>
            ) : profile ? (
              <div className="pdf-panel pdf-flex-col pdf-p-150 pdf-gap-100" style={{ margin: 0 }}>
                <div className="pdf-flex-row pdf-items-center pdf-gap-100">
                  {profile.photoURL && <img src={profile.photoURL} alt="Profile" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />}
                  <div style={{ flex: 1 }}>
                    <div className="pdf-flex-row pdf-items-center" style={{ gap: '6px' }}>
                      <div className="pdf-text-label-14-mono">{profile.displayName}</div>
                      <button 
                        onClick={() => setShowProfileModal(true)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', opacity: 0.7 }}
                        title="프로필 설정"
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-secondary)' }}>
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                      </button>
                    </div>
                    <div className="pdf-text-label-14-mono pdf-text-red" style={{ fontSize: '11px', marginTop: '4px', position: 'relative', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {gameMode === 'omok' ? (
                        <>
                          {rankBadge} ({profile.points} pts)
                          <button 
                            onMouseEnter={() => setShowRankInfo(true)}
                            onMouseLeave={() => setShowRankInfo(false)}
                            style={{ background: 'none', border: 'none', cursor: 'help', padding: 0, display: 'flex', alignItems: 'center' }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-functional-red)' }}>
                              <circle cx="12" cy="12" r="10"></circle>
                              <path d="M12 16v-4"></path>
                              <path d="M12 8h.01"></path>
                            </svg>
                          </button>
                        </>
                      ) : (
                        <span>알까기: {profile.alkkagiPoints || 0} pts ({(profile.alkkagiWins || 0)}승 {(profile.alkkagiLosses || 0)}패)</span>
                      )}
                      {gameMode === 'omok' && showRankInfo && (
                        <div className="pdf-panel" style={{ 
                          position: 'absolute', 
                          zIndex: 1000, 
                          left: '0', 
                          top: '100%', 
                          marginTop: '8px', 
                          width: '180px', 
                          padding: '12px',
                          pointerEvents: 'none'
                        }}>
                          <div className="pdf-text-label-14-mono pdf-font-bold pdf-mb-050" style={{ color: 'var(--color-text-primary)', fontSize: '12px' }}>티어 달성 조건</div>
                          <ul className="pdf-text-label-14-mono pdf-text-muted" style={{ paddingLeft: '16px', margin: 0, fontSize: '11px', lineHeight: '1.5' }}>
                            <li><b>Diamond</b>: 4000+ pts</li>
                            <li><b>Platinum</b>: 2000+ pts</li>
                            <li><b>Gold</b>: 1000+ pts</li>
                            <li><b>Silver</b>: 500+ pts</li>
                            <li><b>Bronze</b>: 0+ pts</li>
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="pdf-flex-row pdf-items-center pdf-gap-050" style={{ marginTop: '8px', borderTop: '1px solid var(--color-border-default)', paddingTop: '8px' }}>
                  <button onClick={() => handleOpenLeaderboard()} className="pdf-text-label-14-mono pdf-font-bold pdf-text-red" style={{ fontSize: '12px' }}>
                    🏆 글로벌 랭킹
                  </button>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => setShowProfileModal(true)} className="pdf-text-label-14-mono pdf-text-muted" style={{ fontSize: '12px' }}>
                    ⚙️ 설정
                  </button>
                </div>
              </div>
            ) : (
              <button className="pdf-btn-primary pdf-w-full pdf-justify-center" onClick={loginWithGoogle}>
                Login with Google
              </button>
            )}
          </div>

          <div className="pdf-nav-group-header" style={{ display: gameMode === 'home' ? 'none' : 'flex' }}>
            {gameMode === 'omok' ? 'OMOK CONTROLS' : 'ALKKAGI CONTROLS'}
          </div>
          <div className="pdf-mt-050" style={{ display: gameMode === 'home' ? 'none' : 'block' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {gameMode === 'omok' ? (
                <>
                  <div className="pdf-flex-row" style={{ display: 'inline-flex', backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', borderRadius: '8px', padding: '4px', gap: '4px', width: '100%', opacity: profile?.govatarTrainingMode ? 0.6 : 1, pointerEvents: profile?.govatarTrainingMode ? 'none' : 'auto' }}>
                    <button
                      onClick={() => { handleExitRoom('vs_ai'); setTimeout(handleNewGame, 50); }}
                      style={{
                        flex: 1,
                        padding: '6px 4px',
                        borderRadius: '6px',
                        backgroundColor: omokMode === 'vs_ai' ? 'var(--color-bg-primary)' : 'transparent',
                        color: omokMode === 'vs_ai' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        boxShadow: omokMode === 'vs_ai' ? 'var(--shadow-hardware-bevel)' : 'none',
                        transition: 'all 0.2s',
                        fontSize: '11px',
                        fontWeight: omokMode === 'vs_ai' ? '700' : '400',
                      }}
                    >
                      AI 대전
                    </button>
                    <button
                      onClick={() => { handleExitRoom('vs_player'); setTimeout(handleNewGame, 50); }}
                      style={{
                        flex: 1,
                        padding: '6px 4px',
                        borderRadius: '6px',
                        backgroundColor: omokMode === 'vs_player' ? 'var(--color-bg-primary)' : 'transparent',
                        color: omokMode === 'vs_player' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        boxShadow: omokMode === 'vs_player' ? 'var(--shadow-hardware-bevel)' : 'none',
                        transition: 'all 0.2s',
                        fontSize: '11px',
                        fontWeight: omokMode === 'vs_player' ? '700' : '400',
                      }}
                    >
                      2인 대전
                    </button>
                    <button
                      onClick={() => { setOmokMode('vs_lan'); }}
                      style={{
                        flex: 1,
                        padding: '6px 4px',
                        borderRadius: '6px',
                        backgroundColor: omokMode === 'vs_lan' ? 'var(--color-bg-primary)' : 'transparent',
                        color: omokMode === 'vs_lan' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        boxShadow: omokMode === 'vs_lan' ? 'var(--shadow-hardware-bevel)' : 'none',
                        transition: 'all 0.2s',
                        fontSize: '11px',
                        fontWeight: omokMode === 'vs_lan' ? '700' : '400',
                      }}
                    >
                      LAN 대전
                    </button>
                  </div>

                  {omokMode === 'vs_lan' && (
                    <div className="pdf-panel pdf-flex-col pdf-p-150 pdf-gap-100" style={{ margin: 0 }}>
                      {activeRoom ? (
                        <div className="pdf-flex-col pdf-gap-100">
                          <div className="pdf-text-label-14-mono pdf-font-bold">방 코드: <span className="pdf-text-red">{activeRoom.id}</span></div>
                          <div className="pdf-text-label-14-mono pdf-text-muted" style={{ fontSize: '11px' }}>
                            상태: {activeRoom.status === 'waiting' ? '대기 중...' : '게임 진행 중'}
                          </div>
                          {activeRoom.createdBy === user?.uid && (
                            <button className="pdf-secondary-btn pdf-w-full pdf-justify-center" style={{ fontSize: '12px' }} onClick={() => changeRoomGameMode('alkkagi', Array(14).fill(null))}>
                              알까기로 전환
                            </button>
                          )}
                           <button className="pdf-secondary-btn pdf-w-full pdf-justify-center" style={{ fontSize: '12px' }} onClick={() => handleLANReset('omok')}>
                            방 게임 초기화
                          </button>
                          <button className="pdf-secondary-btn pdf-w-full pdf-justify-center" style={{ fontSize: '12px', color: 'var(--color-functional-red)' }} onClick={() => handleExitRoom()}>
                            방 나가기
                          </button>
                        </div>
                      ) : (
                        <div className="pdf-flex-col pdf-gap-100">
                          <button className="pdf-btn-primary pdf-w-full pdf-justify-center" onClick={handleCreateRoom}>
                            방 만들기 (LAN)
                          </button>
                          <div style={{ height: '1px', backgroundColor: 'var(--color-border-default)' }} />
                           <div className="pdf-flex-row pdf-gap-100" style={{ alignItems: 'center', width: '100%' }}>
                            <input 
                              type="text" 
                              placeholder="방 코드"
                              value={roomCode}
                              onChange={(e) => setRoomCode(e.target.value)}
                              className="pdf-text-label-14-mono"
                              style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-border-default)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', outline: 'none' }}
                            />
                            <button className="pdf-btn-primary" style={{ padding: '0 16px', height: '36px', borderRadius: '8px', flexShrink: 0 }} onClick={handleJoinRoom}>입장</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {omokMode !== 'vs_lan' && (
                    <>
                      <button className="pdf-btn-primary pdf-w-full pdf-justify-center" onClick={() => { 
                        if (profile?.govatarTrainingMode) {
                          alert("평가 모드 진행 중에는 임의로 새 게임을 시작할 수 없습니다. 취소하려면 GOVATAR 패널에서 '평가 취소하기'를 눌러주세요.");
                          return;
                        }
                        setGovatarOpponent(null); 
                        handleNewGame(); 
                      }}>
                        {govatarOpponent ? '일반 모드로 돌아가기' : 'New Game'}
                      </button>
                      {govatarOpponent && !profile?.govatarTrainingMode && (
                        <button className="pdf-secondary-btn pdf-w-full pdf-justify-center" onClick={handleNewGame}>
                          Restart vs {govatarOpponent.name}
                        </button>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="pdf-flex-row" style={{ display: 'inline-flex', backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', borderRadius: '8px', padding: '4px', gap: '4px', width: '100%' }}>
                    <button
                      onClick={() => { handleExitRoom('vs_ai'); setTimeout(alkkagiResetGame, 50); }}
                      style={{
                        flex: 1,
                        padding: '6px 4px',
                        borderRadius: '6px',
                        backgroundColor: alkkagiMode === 'vs_ai' ? 'var(--color-bg-primary)' : 'transparent',
                        color: alkkagiMode === 'vs_ai' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        boxShadow: alkkagiMode === 'vs_ai' ? 'var(--shadow-hardware-bevel)' : 'none',
                        transition: 'all 0.2s',
                        fontSize: '11px',
                        fontWeight: alkkagiMode === 'vs_ai' ? '700' : '400',
                      }}
                    >
                      AI 대전
                    </button>
                    <button
                      onClick={() => { handleExitRoom('vs_player'); setTimeout(alkkagiResetGame, 50); }}
                      style={{
                        flex: 1,
                        padding: '6px 4px',
                        borderRadius: '6px',
                        backgroundColor: alkkagiMode === 'vs_player' ? 'var(--color-bg-primary)' : 'transparent',
                        color: alkkagiMode === 'vs_player' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        boxShadow: alkkagiMode === 'vs_player' ? 'var(--shadow-hardware-bevel)' : 'none',
                        transition: 'all 0.2s',
                        fontSize: '11px',
                        fontWeight: alkkagiMode === 'vs_player' ? '700' : '400',
                      }}
                    >
                      2인 대전
                    </button>
                    <button
                      onClick={() => { setAlkkagiMode('vs_lan'); }}
                      style={{
                        flex: 1,
                        padding: '6px 4px',
                        borderRadius: '6px',
                        backgroundColor: alkkagiMode === 'vs_lan' ? 'var(--color-bg-primary)' : 'transparent',
                        color: alkkagiMode === 'vs_lan' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        boxShadow: alkkagiMode === 'vs_lan' ? 'var(--shadow-hardware-bevel)' : 'none',
                        transition: 'all 0.2s',
                        fontSize: '11px',
                        fontWeight: alkkagiMode === 'vs_lan' ? '700' : '400',
                      }}
                    >
                      LAN 대전
                    </button>
                  </div>

                  {alkkagiMode === 'vs_lan' && (
                    <div className="pdf-panel pdf-flex-col pdf-p-150 pdf-gap-100" style={{ margin: 0 }}>
                      {activeRoom ? (
                        <div className="pdf-flex-col pdf-gap-100">
                          <div className="pdf-text-label-14-mono pdf-font-bold">방 코드: <span className="pdf-text-red">{activeRoom.id}</span></div>
                          <div className="pdf-text-label-14-mono pdf-text-muted" style={{ fontSize: '11px' }}>
                            상태: {activeRoom.status === 'waiting' ? '대기 중...' : '게임 진행 중'}
                          </div>
                          {activeRoom.createdBy === user?.uid && (
                            <button className="pdf-secondary-btn pdf-w-full pdf-justify-center" style={{ fontSize: '12px' }} onClick={() => changeRoomGameMode('omok')}>
                              오목으로 전환
                            </button>
                          )}
                          <button className="pdf-secondary-btn pdf-w-full pdf-justify-center" style={{ fontSize: '12px' }} onClick={() => handleLANReset('alkkagi')}>
                            방 게임 초기화
                          </button>
                          <button className="pdf-secondary-btn pdf-w-full pdf-justify-center" style={{ fontSize: '12px', color: 'var(--color-functional-red)' }} onClick={() => handleExitRoom()}>
                            방 나가기
                          </button>
                        </div>
                      ) : (
                        <div className="pdf-flex-col pdf-gap-100">
                          <button className="pdf-btn-primary pdf-w-full pdf-justify-center" onClick={handleCreateRoom}>
                            방 만들기 (LAN)
                          </button>
                          <div style={{ height: '1px', backgroundColor: 'var(--color-border-default)' }} />
                           <div className="pdf-flex-row pdf-gap-100" style={{ alignItems: 'center', width: '100%' }}>
                            <input 
                              type="text" 
                              placeholder="방 코드"
                              value={roomCode}
                              onChange={(e) => setRoomCode(e.target.value)}
                              className="pdf-text-label-14-mono"
                              style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-border-default)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', outline: 'none' }}
                            />
                            <button className="pdf-btn-primary" style={{ padding: '0 16px', height: '36px', borderRadius: '8px', flexShrink: 0 }} onClick={handleJoinRoom}>입장</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="pdf-flex-row pdf-items-center pdf-justify-between" style={{ padding: '8px 12px', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '8px', border: '1px solid var(--color-border-default)' }}>
                    <span className="pdf-text-label-14-mono" style={{ color: 'var(--color-text-primary)', fontSize: '13px' }}>돌 개수 설정</span>
                    <select
                      value={alkkagiStonesCount}
                      onChange={(e) => {
                        const count = Number(e.target.value);
                        setAlkkagiStonesCount(count);
                      }}
                      className="pdf-text-label-14-mono"
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: 'var(--color-bg-primary)',
                        border: '1px solid var(--color-border-default)',
                        color: 'var(--color-text-primary)',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                        <option key={num} value={num}>
                          {num}개
                        </option>
                      ))}
                    </select>
                  </div>

                  <button className="pdf-btn-primary pdf-w-full pdf-justify-center" onClick={alkkagiResetGame}>
                    알까기 새로고침
                  </button>
                </>
              )}

              <div className="pdf-flex-row pdf-items-center pdf-justify-between" style={{ padding: '8px 12px', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '8px', border: '1px solid var(--color-border-default)', opacity: (gameMode === 'omok' && ((hasStarted && !winner) || profile?.govatarTrainingMode)) || omokMode === 'vs_lan' || alkkagiMode === 'vs_lan' ? 0.6 : 1 }}>
                <span className="pdf-text-label-14-mono" style={{ color: 'var(--color-text-primary)', fontSize: '13px' }}>연습 모드</span>
                <label style={{ display: 'flex', alignItems: 'center', cursor: (gameMode === 'omok' && ((hasStarted && !winner) || profile?.govatarTrainingMode)) || omokMode === 'vs_lan' || alkkagiMode === 'vs_lan' ? 'not-allowed' : 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={isPracticeMode} 
                    onChange={(e) => setIsPracticeMode(e.target.checked)} 
                    disabled={(gameMode === 'omok' && ((hasStarted && !winner) || profile?.govatarTrainingMode)) || omokMode === 'vs_lan' || alkkagiMode === 'vs_lan'}
                    style={{ cursor: 'inherit', width: '16px', height: '16px', accentColor: 'var(--color-functional-red)' }}
                  />
                </label>
              </div>

              {gameMode === 'omok' && ((hasStarted && !winner) || profile?.govatarTrainingMode) && !(omokMode === 'vs_lan' || alkkagiMode === 'vs_lan') && (
                <div className="pdf-text-label-14-mono pdf-text-muted" style={{ fontSize: '10px', textAlign: 'right', marginTop: '-4px' }}>
                  게임 중이거나 평가 중에는 변경할 수 없습니다
                </div>
              )}

              {(omokMode === 'vs_lan' || alkkagiMode === 'vs_lan') && (
                <div className="pdf-text-label-14-mono pdf-text-muted" style={{ fontSize: '10px', textAlign: 'right', marginTop: '-4px', color: 'var(--color-functional-red)' }}>
                  LAN 플레이 중에는 연습 모드를 사용할 수 없습니다
                </div>
              )}

              <button 
                className="pdf-secondary-btn pdf-w-full pdf-justify-center"
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                style={{ fontSize: '12px', height: '38px' }}
              >
                테마 전환 ({theme === 'light' ? 'Dark' : 'Light'})
              </button>
            </div>
          </div>

          {gameMode === 'omok' && (
            <>
              <div className="pdf-nav-group-header pdf-mt-200" style={{ position: 'relative', justifyContent: 'flex-start', gap: '6px' }}>
                AI DIFFICULTY
                <button 
                  onMouseEnter={() => setShowDiffInfo(true)}
                  onMouseLeave={() => setShowDiffInfo(false)}
                  style={{ background: 'none', border: 'none', cursor: 'help', padding: 0, display: 'flex', alignItems: 'center' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-secondary)' }}>
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M12 16v-4"></path>
                    <path d="M12 8h.01"></path>
                  </svg>
                </button>
                {showDiffInfo && (
                  <div className="pdf-panel" style={{ 
                    position: 'absolute', 
                    zIndex: 1000, 
                    left: '0', 
                    top: '100%', 
                    marginTop: '8px', 
                    width: '240px', 
                    padding: '12px',
                    pointerEvents: 'none'
                  }}>
                    <div className="pdf-text-label-14-mono pdf-font-bold pdf-mb-050" style={{ color: 'var(--color-text-primary)' }}>난이도 & 랭킹 안내</div>
                    <div className="pdf-text-label-14-mono pdf-text-muted" style={{ fontSize: '12px', lineHeight: '1.4' }}>
                      <p className="pdf-mb-050">AI와의 대결 결과에 따라 다음 점수가 기록됩니다:</p>
                      <ul className="pdf-mb-100" style={{ paddingLeft: '16px', margin: '4px 0' }}>
                        <li><b>하수</b>: 승리 +10 / 패배 -5</li>
                        <li><b>중수</b>: 승리 +20 / 패배 -10</li>
                        <li><b>고수</b>: 승리 +40 / 패배 -20</li>
                        <li><b>초고수</b>: 승리 +80 / 패배 -40</li>
                        <li><b>신</b>: 승리 +200 / 패배 -100</li>
                        <li><b>초월자</b>: 승리 +500 / 패배 -200</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
              <div className="pdf-mt-050">
                <div className="pdf-flex-row" style={{ display: 'inline-flex', backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', borderRadius: '10px', padding: '4px', gap: '4px', width: '100%', overflowX: 'auto', opacity: profile?.govatarTrainingMode || tutorialMode ? 0.6 : 1, pointerEvents: profile?.govatarTrainingMode || tutorialMode ? 'none' : 'auto' }}>
                  {profile?.govatarTrainingMode ? (
                    <div className="pdf-text-label-14-mono pdf-w-full pdf-text-center pdf-text-muted" style={{ padding: '6px 4px', fontSize: '12px' }}>
                      평가 중에는 난이도를 볼 수 없습니다.
                    </div>
                  ) : (
                    (['easy', 'normal', 'hard', 'expert', 'god', 'transcendent'] as const).map((level) => {
                      const isSelected = tutorialMode ? tutorialDifficulty === level : difficulty === level;
                      return (
                      <button
                        key={level}
                        onClick={() => setDifficulty(level)}
                        style={{
                          flex: 1,
                          padding: '6px 4px',
                          borderRadius: '6px',
                          backgroundColor: isSelected ? 'var(--color-bg-primary)' : 'transparent',
                          color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                          boxShadow: isSelected ? 'var(--shadow-hardware-bevel)' : 'none',
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <span className="pdf-text-label-14-mono" style={{ fontSize: '12px', fontWeight: isSelected ? '700' : '400' }}>
                          {level === 'easy' ? '하수' : level === 'normal' ? '중수' : level === 'hard' ? '고수' : level === 'expert' ? '초고수' : level === 'god' ? '신' : '초월자'}
                        </span>
                      </button>
                    )})
                  )}
                </div>
                {tutorialMode && (
                  <div className="pdf-text-label-14-mono pdf-text-muted pdf-mt-050" style={{ fontSize: '10px', textAlign: 'right' }}>
                    튜토리얼 모드에서는 난이도가 고정됩니다
                  </div>
                )}
              </div>
            </>
          )}

          <div className="pdf-nav-group-header pdf-mt-200" style={{ position: 'relative', justifyContent: 'flex-start', gap: '6px', display: gameMode === 'home' ? 'none' : 'flex' }}>
            GAME INFO
            <button 
              onMouseEnter={() => setShowGameInfo(true)}
              onMouseLeave={() => setShowGameInfo(false)}
              style={{ background: 'none', border: 'none', cursor: 'help', padding: 0, display: 'flex', alignItems: 'center' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-secondary)' }}>
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 16v-4"></path>
                <path d="M12 8h.01"></path>
              </svg>
            </button>
            {showGameInfo && (
              <div className="pdf-panel" style={{ 
                position: 'absolute', 
                zIndex: 1000, 
                left: '0', 
                bottom: '100%', 
                marginBottom: '8px', 
                width: '240px', 
                padding: '12px',
                pointerEvents: 'none'
              }}>
                {gameMode === 'omok' ? (
                  <>
                    <div className="pdf-text-label-14-mono pdf-font-bold pdf-mb-050" style={{ color: 'var(--color-text-primary)' }}>오목 게임 룰 (자유 룰)</div>
                    <div className="pdf-text-label-14-mono pdf-text-muted" style={{ fontSize: '11px', lineHeight: '1.4' }}>
                      <p className="pdf-mb-050">이 게임은 금수가 없는 <b>자유 룰(Freestyle)</b>입니다:</p>
                      <ul style={{ paddingLeft: '16px', margin: '4px 0' }}>
                        <li><b>3-3 허용</b>: 흑과 백 모두 쌍삼 허용.</li>
                        <li><b>4-4 허용</b>: 흑과 백 모두 4-4 허용.</li>
                        <li><b>장목 허용</b>: 6목 이상도 승리 인정.</li>
                      </ul>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="pdf-text-label-14-mono pdf-font-bold pdf-mb-050" style={{ color: 'var(--color-text-primary)' }}>알까기 게임 룰</div>
                    <div className="pdf-text-label-14-mono pdf-text-muted" style={{ fontSize: '11px', lineHeight: '1.4' }}>
                      <p className="pdf-mb-050">상대방의 돌을 모두 바둑판 밖으로 치는 슬링샷 물리 대결입니다.</p>
                      <ul style={{ paddingLeft: '16px', margin: '4px 0' }}>
                        <li><b>슬링샷 조준</b>: 돌을 클릭한 채 반대로 드래그해서 뒤로 당겼다가 놓으면 튕겨 나갑니다.</li>
                        <li><b>랭킹 미반영</b>: 알까기는 전적이나 랭킹에 영향을 주지 않습니다.</li>
                      </ul>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="pdf-panel pdf-mt-050" style={{ margin: 0, display: gameMode === 'home' ? 'none' : 'block' }}>
            <ul className="pdf-text-copy-13-mono pdf-text-muted" style={{ listStyleType: 'none', padding: 0, fontSize: '11px' }}>
              {gameMode === 'omok' ? (
                <>
                  <li style={{ marginBottom: '4px' }}>15x15 Gomoku</li>
                  <li style={{ marginBottom: '4px' }}>Pure Logic Heuristic AI</li>
                  <li>Freestyle (No Restrictions)</li>
                </>
              ) : (
                <>
                  <li style={{ marginBottom: '4px' }}>Canvas 2D Physics</li>
                  <li style={{ marginBottom: '4px' }}>Elastic Collisions</li>
                  <li>Casual Play Mode</li>
                </>
              )}
            </ul>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="pdf-main-view">
        {gameMode === 'home' ? (
          <div className="pdf-main-content">
            <div className="pdf-mb-400">
              <h1 className="pdf-text-heading-32 pdf-mb-050">미니게임 천국</h1>
              <p className="pdf-text-copy-14 pdf-text-muted">
                원하시는 게임을 선택해 플레이하세요!
              </p>
            </div>
            <div className="pdf-flex-row pdf-gap-200 pdf-flex-wrap" style={{ alignItems: 'stretch' }}>
              <div 
                className="pdf-panel pdf-cursor-pointer" 
                onClick={() => setGameMode('omok')}
                style={{ flex: '1 1 300px', transition: 'transform 0.2s, box-shadow 0.2s', display: 'flex', flexDirection: 'column' }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = 'var(--shadow-hardware-bevel-active)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow-hardware-bevel)'; }}
              >
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚫</div>
                <h3 className="pdf-text-heading-24 pdf-mb-100">오목 (Gomoku)</h3>
                <p className="pdf-text-copy-14 pdf-text-muted pdf-mb-200" style={{ flex: 1 }}>
                  컴퓨터나 다른 플레이어와 15x15 오목판에서 대결하세요. 자유 룰이 적용되어 누구나 쉽게 즐길 수 있습니다.
                </p>
                <button className="pdf-btn-primary pdf-w-full">
                  플레이 하기
                </button>
              </div>
              <div 
                className="pdf-panel pdf-cursor-pointer" 
                onClick={() => setGameMode('alkkagi')}
                style={{ flex: '1 1 300px', transition: 'transform 0.2s, box-shadow 0.2s', display: 'flex', flexDirection: 'column' }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = 'var(--shadow-hardware-bevel-active)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow-hardware-bevel)'; }}
              >
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>💥</div>
                <h3 className="pdf-text-heading-24 pdf-mb-100">알까기 (Alkkagi)</h3>
                <p className="pdf-text-copy-14 pdf-text-muted pdf-mb-200" style={{ flex: 1 }}>
                  바둑알을 튕겨 상대방의 돌을 모두 떨어뜨리는 슬링샷 물리 게임입니다. 가볍게 즐겨보세요!
                </p>
                <button className="pdf-btn-primary pdf-w-full">
                  플레이 하기
                </button>
              </div>
            </div>
          </div>
        ) : (
        <div className="pdf-main-content">
          <div className="pdf-mb-400">
            <h1 className="pdf-text-heading-32 pdf-mb-050">{gameMode === 'omok' ? '오목' : '알까기'}</h1>
            <p className="pdf-text-copy-14 pdf-text-muted">
              {gameMode === 'omok' ? '컴퓨터와 오목을 플레이하세요' : '돌을 튕겨서 상대방의 돌을 모두 떨어뜨리세요!'}
            </p>
          </div>

          <div className="pdf-panel pdf-flex-row pdf-items-center pdf-justify-between pdf-mb-300">
            <div className="pdf-flex-row pdf-items-center pdf-gap-100">
              <div 
                className="pdf-indicator-dot" 
                style={{ 
                  backgroundColor: gameMode === 'omok' 
                    ? (currentPlayer === 'black' ? '#1A1A1A' : '#F8F9FA') 
                    : (alkkagiCurrentPlayer === 'black' ? '#1A1A1A' : '#F8F9FA'), 
                  border: (gameMode === 'omok' ? currentPlayer === 'white' : alkkagiCurrentPlayer === 'white') ? '2px solid #C0C0C0' : 'none', 
                  width: '16px', 
                  height: '16px', 
                  borderRadius: '50%', 
                  boxShadow: (gameMode === 'omok' ? currentPlayer === 'black' : alkkagiCurrentPlayer === 'black') ? 'inset -2px -2px 4px rgba(255,255,255,0.2)' : 'inset -2px -2px 4px rgba(0,0,0,0.1)' 
                }} 
              />
              <div className="pdf-text-label-16">
                {gameMode === 'omok' ? (
                  !hasStarted ? (
                    '게임 시작 버튼을 눌러주세요'
                  ) : winner ? (
                    winner === 'draw' 
                      ? '무승부' 
                      : (omokMode === 'vs_player'
                          ? (winner === 'black' ? '흑돌 플레이어 승리!' : '백돌 플레이어 승리!')
                          : `${winner === humanColor ? 'Your' : (govatarOpponent ? govatarOpponent.name + "'s Govatar" : (profile?.govatarTrainingMode ? '알 수 없는 상대' : 'AI'))} Win!`)
                  ) : omokMode === 'vs_player' ? (
                    currentPlayer === 'black' ? '흑돌 플레이어 차례' : '백돌 플레이어 차례'
                  ) : currentPlayer === humanColor ? (
                    `Your Turn [${humanColor === 'black' ? 'Black' : 'White'}]`
                  ) : govatarOpponent ? (
                    `${govatarOpponent.name}'s Govatar is thinking...`
                  ) : profile?.govatarTrainingMode ? (
                    '알 수 없는 상대가 생각 중...'
                  ) : (
                    'AI is thinking...'
                  )
                ) : alkkagiWinner ? (
                  alkkagiMode === 'vs_player'
                    ? (alkkagiWinner === 'black' ? '흑돌 플레이어 승리!' : '백돌 플레이어 승리!')
                    : alkkagiMode === 'vs_lan'
                    ? (alkkagiWinner === networkRole ? '축하합니다! 당신의 승리!' : '아쉽네요. 상대방의 승리!')
                    : (alkkagiWinner === 'black' ? '흑돌(플레이어) 승리!' : '백돌(AI) 승리!')
                ) : alkkagiIsSimulating ? (
                  '돌들이 굴러가는 중...'
                ) : isPracticeMode ? (
                  `연습 모드 - 현재 차례: ${alkkagiCurrentPlayer === 'black' ? '흑돌' : '백돌'}`
                ) : alkkagiMode === 'vs_player' ? (
                  alkkagiCurrentPlayer === 'black' ? '흑돌 플레이어 차례' : '백돌 플레이어 차례'
                ) : alkkagiMode === 'vs_lan' ? (
                  lanPlacementTimer !== null
                    ? `돌 배치 단계 (${lanPlacementTimer}초 남음) - 내 진영(절반)에 돌을 드래그하여 배치하세요.`
                    : (alkkagiCurrentPlayer === networkRole 
                        ? '내 턴 (돌을 조준해서 날려주세요!)' 
                        : '상대방 턴 (상대방의 조준을 기다리는 중...)')
                ) : alkkagiCurrentPlayer === 'black' ? (
                  '내 턴 (흑돌을 조준해 날려주세요)'
                ) : (
                  'AI 생각 중 (백돌)...'
                )}
                {isPracticeMode && <span className="pdf-text-label-14-mono pdf-text-red" style={{ marginLeft: '8px', fontSize: '12px' }}>(연습 모드)</span>}
              </div>
            </div>
            <div className="pdf-font-mono pdf-text-label-14-mono pdf-text-muted" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
              <div>Status: {gameMode === 'omok' ? (!hasStarted ? 'WAITING' : winner ? 'GAME OVER' : 'ACTIVE') : (alkkagiWinner ? 'GAME OVER' : 'ACTIVE')}</div>
              {gameMode === 'omok' && (
                <div style={{ 
                  height: isPracticeMode ? '20px' : '0px', 
                  opacity: isPracticeMode ? 1 : 0, 
                  overflow: 'hidden', 
                  transition: 'all 0.3s ease',
                  marginTop: isPracticeMode ? '4px' : '0'
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '6px' }}>
                    <span className="pdf-text-label-14-mono" style={{ color: 'var(--color-text-primary)', fontSize: '12px' }}>AI 통계 패널 열기</span>
                    <input 
                      type="checkbox" 
                      checked={showAiStats} 
                      onChange={(e) => setShowAiStats(e.target.checked)} 
                      style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: 'var(--color-functional-red)' }}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>

          <div className="pdf-mt-400" style={{ width: '100%', paddingBottom: '16px', overflowX: 'auto' }}>
            <div style={{ display: 'flex', width: 'max-content', minWidth: '100%', padding: '0 24px', boxSizing: 'border-box' }}>
              <div style={{ flex: '1 1 0%' }}></div>
              <div className="pdf-flex-row" style={{ flexShrink: 0, alignItems: 'flex-start', flexWrap: 'nowrap', gap: (gameMode === 'omok' && showAiStats && isPracticeMode) ? '16px' : '0px', transition: 'gap 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                {gameMode === 'omok' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                    <div className="board-wrapper" style={{ margin: '0', transition: 'margin 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                      <div className="board" onMouseLeave={() => setHoverPos(null)}>
                        {/* The outer grid border */}
                        <div className="board-lines-container"></div>
                        
                        {/* Standard Omok/Go board dots */}
                        {[
                          { r: 3, c: 3 }, { r: 3, c: 11 },
                          { r: 7, c: 7 },
                          { r: 11, c: 3 }, { r: 11, c: 11 }
                        ].map((dot, i) => (
                          <div 
                            key={`dot-${i}`} 
                            className="board-dot"
                            style={{
                              top: `calc(var(--cell-size) * ${dot.r} + var(--board-padding))`,
                              left: `calc(var(--cell-size) * ${dot.c} + var(--board-padding))`
                            }}
                          />
                        ))}

                        {board.map((row, rowIndex) =>
                          row.map((cell, colIndex) => {
                            const isLastMove = lastMove?.row === rowIndex && lastMove?.col === colIndex;
                            const isWinningStone = winningLine.some(p => p.row === rowIndex && p.col === colIndex);
                            
                            return (
                              <div
                                key={`${rowIndex}-${colIndex}`}
                                className="cell"
                                onClick={() => {
                                  if (cursorPos.row === rowIndex && cursorPos.col === colIndex) {
                                    if (hasStarted && !winner && currentPlayer === humanColor && !isAiThinking && !isColorDeciding) {
                                      playMove(rowIndex, colIndex);
                                    }
                                  } else {
                                    setCursorPos({ row: rowIndex, col: colIndex });
                                  }
                                }}
                                onMouseEnter={() => setHoverPos({ row: rowIndex, col: colIndex })}
                              >
                                {cell && (
                                  <div className={`stone ${cell} ${isLastMove ? 'last-move' : ''} ${isWinningStone ? 'winning-stone' : ''}`}></div>
                                )}
                              </div>
                            );
                          })
                        )}

                        {/* Keyboard Cursor */}
                        {hasStarted && !winner && currentPlayer === humanColor && !isAiThinking && !isColorDeciding && (
                          <div 
                            style={{
                              position: 'absolute',
                              width: 'var(--cell-size)',
                              height: 'var(--cell-size)',
                              top: `calc(var(--cell-size) * ${cursorPos.row} + var(--board-padding))`,
                              left: `calc(var(--cell-size) * ${cursorPos.col} + var(--board-padding))`,
                              transform: 'translate(-50%, -50%)',
                              border: '2px solid var(--color-functional-red)',
                              borderRadius: '4px',
                              zIndex: 6,
                              pointerEvents: 'none',
                              boxShadow: 'var(--shadow-functional-glow)'
                            }}
                          />
                        )}

                        {/* Mouse Hover Cursor */}
                        {hasStarted && !winner && currentPlayer === humanColor && !isAiThinking && !isColorDeciding && hoverPos && (hoverPos.row !== cursorPos.row || hoverPos.col !== cursorPos.col) && (
                          <div 
                            style={{
                              position: 'absolute',
                              width: 'var(--cell-size)',
                              height: 'var(--cell-size)',
                              top: `calc(var(--cell-size) * ${hoverPos.row} + var(--board-padding))`,
                              left: `calc(var(--cell-size) * ${hoverPos.col} + var(--board-padding))`,
                              transform: 'translate(-50%, -50%)',
                              border: '2px solid rgba(128, 128, 128, 0.5)',
                              borderRadius: '4px',
                              zIndex: 5,
                              pointerEvents: 'none'
                            }}
                          />
                        )}

                        {/* Tutorial Hint Cursor */}
                        {tutorialMode && tutorialHint && (
                          <div 
                            style={{
                              position: 'absolute',
                              width: 'var(--cell-size)',
                              height: 'var(--cell-size)',
                              top: `calc(var(--cell-size) * ${tutorialHint.row} + var(--board-padding))`,
                              left: `calc(var(--cell-size) * ${tutorialHint.col} + var(--board-padding))`,
                              transform: 'translate(-50%, -50%)',
                              border: '2px solid rgba(128, 128, 128, 0.5)',
                              borderRadius: '4px',
                              zIndex: 5,
                              pointerEvents: 'none'
                            }}
                          />
                        )}

                        {isColorDeciding && (
                          <div className="pdf-absolute pdf-inset-0 pdf-flex-col pdf-items-center pdf-justify-center pdf-modal-overlay" style={{ zIndex: 10 }}>
                            <div className="pdf-animate-fade-in pdf-radius-lg pdf-modal-container pdf-flex-col pdf-items-center pdf-justify-center" style={{ width: 'auto', padding: 'var(--space-400)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
                              <div className="pdf-text-heading-24 pdf-mb-200" style={{ color: 'var(--color-text-primary)' }}>색상 결정 중...</div>
                              <div className={`coin-container ${decidedColor ? 'decided' : ''}`}>
                                <div className={`coin ${decidedColor || ''}`}>
                                  <div className="coin-face front black"></div>
                                  <div className="coin-face back white"></div>
                                </div>
                              </div>
                              <div className="pdf-text-label-16 pdf-mt-200" style={{ color: 'var(--color-text-primary)' }}>
                                {decidedColor 
                                  ? (decidedColor === 'black' ? '흑돌 당첨! (선공)' : '백돌 당첨! (후공)')
                                  : '돌 색상을 섞는 중...'}
                              </div>
                            </div>
                          </div>
                        )}

                        {showOverlay && winner && (
                          <div className="pdf-absolute pdf-inset-0 pdf-flex-col pdf-items-center pdf-justify-center pdf-modal-overlay" style={{ zIndex: 10 }}>
                            <div className="pdf-animate-fade-in pdf-radius-lg pdf-modal-container pdf-flex-col pdf-items-center pdf-justify-center" style={{ width: 'auto', padding: 'var(--space-400)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
                              <div className="pdf-text-heading-32 pdf-mb-300" style={{ color: 'var(--color-text-primary)', textAlign: 'center' }}>
                                {winner === humanColor ? 'YOU WIN!' : winner === 'draw' ? 'DRAW!' : (govatarOpponent ? `${govatarOpponent.name} WINS!` : 'COMPUTER WINS!')}
                              </div>
                              <button className="pdf-btn-primary" onClick={() => {
                                if (profile?.govatarTrainingMode) {
                                  handleNewGame();
                                } else {
                                  resetGame();
                                }
                              }}>
                                {profile?.govatarTrainingMode ? '다음 평가 진행' : 'RESTART SYSTEM'}
                              </button>
                            </div>
                          </div>
                        )}

                        {!hasStarted && (
                          <div className="pdf-absolute pdf-inset-0 pdf-flex-col pdf-items-center pdf-justify-center pdf-modal-overlay" style={{ zIndex: 10, backdropFilter: 'blur(4px)' }}>
                            <div className="pdf-animate-fade-in pdf-radius-lg pdf-modal-container pdf-flex-col pdf-items-center pdf-justify-center" style={{ width: 'auto', padding: 'var(--space-300)', backgroundColor: 'var(--color-bg-primary)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
                              <div className="pdf-text-heading-24" style={{ color: 'var(--color-text-primary)' }}>
                                대기 중
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    {tutorialMode && hasStarted && !winner && (
                      <div className="pdf-panel pdf-mt-200 pdf-flex-col pdf-gap-100" style={{ margin: '16px 0 0 0', backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)' }}>
                        <div className="pdf-flex-row pdf-items-center pdf-justify-between">
                          <div className="pdf-text-label-14-mono pdf-font-bold" style={{ color: 'var(--color-text-primary)' }}>💡 튜토리얼 힌트</div>
                          <div className="pdf-flex-row pdf-gap-100">
                            <button 
                              className="pdf-secondary-btn" 
                              onClick={() => {
                                setTutorialMode(false);
                                setTimeout(resetGame, 100);
                              }}
                              style={{ padding: '4px 12px', fontSize: '12px', height: '28px' }}
                            >
                              종료
                            </button>
                            <button 
                              className="pdf-btn-primary" 
                              onClick={requestHint}
                              disabled={isCalculatingHint || currentPlayer !== humanColor}
                              style={{ padding: '4px 12px', fontSize: '12px', height: '28px' }}
                            >
                              {isCalculatingHint ? '계산 중...' : '힌트 받기'}
                            </button>
                          </div>
                        </div>
                        {tutorialHint ? (
                          <div className="pdf-text-label-14-mono pdf-text-primary" style={{ marginTop: '8px', padding: '12px', backgroundColor: 'var(--color-bg-primary)', borderRadius: '4px', borderLeft: '3px solid var(--color-functional-blue)' }}>
                            {tutorialHint.reason}
                          </div>
                        ) : (
                          <div className="pdf-text-label-14-mono pdf-text-muted" style={{ marginTop: '8px', padding: '12px', fontSize: '12px' }}>
                            우측 상단의 '힌트 받기' 버튼을 눌러보세요.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'relative' }}>
                    <AlkkagiBoard
                      stones={alkkagiStones}
                      currentPlayer={alkkagiCurrentPlayer}
                      humanColor={
                        alkkagiMode === 'vs_lan'
                          ? networkRole || 'black'
                          : alkkagiMode === 'vs_player'
                          ? alkkagiCurrentPlayer
                          : 'black'
                      }
                      isSimulating={alkkagiIsSimulating}
                      winner={alkkagiWinner}
                      shoot={alkkagiShoot}
                      isPlacementPhase={alkkagiMode === 'vs_lan' && lanPlacementTimer !== null}
                      setStones={setAlkkagiStones}
                      collisionEvents={alkkagiCollisionEvents}
                      onDragStateChange={(dragging) => {
                        isAlkkagiDraggingRef.current = dragging;
                        if (!dragging) {
                          syncGameStateToNetwork('alkkagi');
                        }
                      }}
                    />

                    {alkkagiWinner && (
                      <div className="pdf-absolute pdf-inset-0 pdf-flex-col pdf-items-center pdf-justify-center pdf-modal-overlay" style={{ zIndex: 10, borderRadius: '8px' }}>
                        <div className="pdf-animate-fade-in pdf-radius-lg pdf-modal-container pdf-flex-col pdf-items-center pdf-justify-center" style={{ width: 'auto', padding: 'var(--space-400)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
                          <div className="pdf-text-heading-32 pdf-mb-300" style={{ color: 'var(--color-text-primary)', textAlign: 'center' }}>
                            {alkkagiMode === 'vs_player' 
                              ? (alkkagiWinner === 'black' ? '흑돌 플레이어 승리!' : '백돌 플레이어 승리!')
                              : alkkagiMode === 'vs_lan'
                              ? (alkkagiWinner === networkRole ? '축하합니다! 당신의 승리!' : '아쉽네요. 상대방의 승리!')
                              : (alkkagiWinner === 'black' ? 'YOU WIN (BLACK)!' : 'AI WINS (WHITE)!')}
                          </div>
                          <button className="pdf-btn-primary" onClick={() => {
                            if (alkkagiMode === 'vs_lan') {
                              handleLANReset('alkkagi');
                            } else {
                              alkkagiResetGame();
                            }
                          }}>
                            RESTART GAME
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

            {/* Pinned AI Stats Panel */}
              <div style={{
                flex: (showAiStats && isPracticeMode) ? '0 0 250px' : '0 0 0px',
                maxWidth: '250px',
                minWidth: (showAiStats && isPracticeMode) ? '250px' : '0px',
                opacity: (showAiStats && isPracticeMode) ? 1 : 0,
                transform: (showAiStats && isPracticeMode) ? 'translateY(0)' : 'translateY(24px)',
                margin: '0px',
                overflow: 'hidden',
                transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
              }}>
                <div className="pdf-panel" style={{ width: '100%', margin: 0, boxSizing: 'border-box' }}>
                  <div className="pdf-flex-row pdf-items-center pdf-justify-between pdf-mb-200">
                    <div className="pdf-text-heading-20">AI 연산 정보</div>
                  </div>
                  {latestAiStats ? (
                    <div className="pdf-flex-col pdf-gap-100">
                      <div className="pdf-flex-row pdf-justify-between">
                        <span className="pdf-text-label-14-mono pdf-text-muted">탐색 노드</span>
                        <span className="pdf-text-label-14-mono pdf-font-bold">{latestAiStats.nodesEvaluated.toLocaleString()}</span>
                      </div>
                      <div className="pdf-flex-row pdf-justify-between">
                        <span className="pdf-text-label-14-mono pdf-text-muted">소요 시간</span>
                        <span className="pdf-text-label-14-mono pdf-font-bold">{latestAiStats.timeTakenMs.toFixed(0)} ms</span>
                      </div>
                      <div className="pdf-flex-row pdf-justify-between">
                        <span className="pdf-text-label-14-mono pdf-text-muted">탐색 깊이</span>
                        <span className="pdf-text-label-14-mono pdf-font-bold">{latestAiStats.searchDepth}</span>
                      </div>
                      
                      <div className="pdf-mt-200">
                        <div className="pdf-text-label-14-mono pdf-mb-050">현재 성향: {latestAiStats.playStyle > 0.6 ? '공격적' : latestAiStats.playStyle < 0.4 ? '방어적' : '균형'} ({(latestAiStats.playStyle * 100).toFixed(0)}%)</div>
                        <div style={{ height: '8px', width: '100%', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                           <div style={{ height: '100%', backgroundColor: 'var(--color-functional-red)', width: `${latestAiStats.playStyle * 100}%`, transition: 'width 0.3s' }}></div>
                           <div style={{ height: '100%', backgroundColor: 'var(--color-functional-blue)', flex: 1, transition: 'flex 0.3s' }}></div>
                        </div>
                        <div className="pdf-flex-row pdf-justify-between pdf-text-muted pdf-mt-050" style={{ fontSize: '10px' }}>
                          <span>방어성</span>
                          <span>공격성</span>
                        </div>
                      </div>

                      <div className="pdf-mt-200">
                        <div className="pdf-text-label-14-mono pdf-mb-050">형세(Advantage) 흐름</div>
                        <div style={{ width: '100%', height: '110px', border: '1px solid var(--color-border-default)', borderRadius: '4px', position: 'relative', backgroundColor: 'var(--color-bg-secondary)', overflow: 'hidden' }}>
                          <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 300 100">
                            <defs>
                              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
                                <stop offset="0%" stopColor="var(--color-functional-red)" stopOpacity="0.4" />
                                <stop offset="50%" stopColor="var(--color-functional-red)" stopOpacity="0.0" />
                                <stop offset="50%" stopColor="var(--color-functional-blue)" stopOpacity="0.0" />
                                <stop offset="100%" stopColor="var(--color-functional-blue)" stopOpacity="0.4" />
                              </linearGradient>
                              <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
                                <stop offset="0%" stopColor="var(--color-functional-red)" />
                                <stop offset="50%" stopColor="var(--color-functional-red)" />
                                <stop offset="50%" stopColor="var(--color-functional-blue)" />
                                <stop offset="100%" stopColor="var(--color-functional-blue)" />
                              </linearGradient>
                            </defs>
                            <line x1="0" y1="50" x2="300" y2="50" stroke="var(--color-border-default)" strokeWidth="1.5" />
                            <line x1="0" y1="25" x2="300" y2="25" stroke="var(--color-border-default)" strokeWidth="1" strokeDasharray="2 4" opacity="0.5" />
                            <line x1="0" y1="75" x2="300" y2="75" stroke="var(--color-border-default)" strokeWidth="1" strokeDasharray="2 4" opacity="0.5" />
                            
                            {aiStatsHistory.length > 0 && (() => {
                              const pts = aiStatsHistory.map((s, i) => {
                                const maxS = 200000;
                                const clamped = Math.max(-maxS, Math.min(maxS, s.evalScore));
                                const x = aiStatsHistory.length <= 1 ? 150 : (i / (aiStatsHistory.length - 1)) * 300;
                                const y = 50 - (clamped / maxS) * 45;
                                return {x, y};
                              });
                              const linePath = `M ${pts.map(p => `${p.x},${p.y}`).join(' L ')}`;
                              const firstX = pts[0].x;
                              const lastX = pts[pts.length - 1].x;
                              const areaPath = `${linePath} L ${lastX},50 L ${firstX},50 Z`;

                              return (
                                <>
                                  <path d={areaPath} fill="url(#areaGradient)" />
                                  <path 
                                    d={linePath} 
                                    fill="none" 
                        stroke="url(#lineGradient)" 
                                    strokeWidth="2" 
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                  <circle cx={lastX} cy={pts[pts.length - 1].y} r="3" fill="var(--color-bg-primary)" stroke="url(#lineGradient)" strokeWidth="2" />
                                </>
                              );
                            })()}
                          </svg>
                          <div style={{ position: 'absolute', top: '4px', left: '6px', fontSize: '10px', color: 'var(--color-functional-red)', fontWeight: 'bold' }}>AI 유리</div>
                          <div style={{ position: 'absolute', bottom: '4px', left: '6px', fontSize: '10px', color: 'var(--color-functional-blue)', fontWeight: 'bold' }}>Player 유리</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                     <div className="pdf-text-label-14-mono pdf-text-muted pdf-p-200 pdf-text-center">데이터 수집 대기 중...</div>
                  )}
                </div>
              </div>
            </div>
            <div style={{ flex: '1 1 0%' }}></div>
          </div>
        </div>
      </div>
        )}
    </main>
      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <div className="pdf-fixed pdf-inset-0 pdf-flex-row pdf-items-center pdf-justify-center pdf-modal-overlay" onClick={() => setShowLeaderboard(false)}>
          <div className="pdf-animate-fade-in pdf-radius-lg pdf-modal-container" style={{ width: '400px', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="pdf-flex-row pdf-items-center pdf-justify-between pdf-panel-header" style={{ marginBottom: '12px' }}>
              <h2 className="pdf-text-heading-24">🏆 글로벌 랭킹 Top 100</h2>
              <button className="pdf-secondary-btn pdf-btn-xs" onClick={() => setShowLeaderboard(false)}>닫기</button>
            </div>

            {/* Category Tabs */}
            <div className="pdf-flex-row" style={{ display: 'inline-flex', backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', borderRadius: '8px', padding: '4px', gap: '4px', width: '100%', marginBottom: '16px' }}>
              <button
                onClick={() => handleOpenLeaderboard('omok')}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: '6px',
                  backgroundColor: leaderboardTab === 'omok' ? 'var(--color-bg-primary)' : 'transparent',
                  color: leaderboardTab === 'omok' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  boxShadow: leaderboardTab === 'omok' ? 'var(--shadow-hardware-bevel)' : 'none',
                  transition: 'all 0.2s',
                  fontSize: '12px',
                  fontWeight: leaderboardTab === 'omok' ? '700' : '400',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                오목 랭킹
              </button>
              <button
                onClick={() => handleOpenLeaderboard('alkkagi')}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: '6px',
                  backgroundColor: leaderboardTab === 'alkkagi' ? 'var(--color-bg-primary)' : 'transparent',
                  color: leaderboardTab === 'alkkagi' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  boxShadow: leaderboardTab === 'alkkagi' ? 'var(--shadow-hardware-bevel)' : 'none',
                  transition: 'all 0.2s',
                  fontSize: '12px',
                  fontWeight: leaderboardTab === 'alkkagi' ? '700' : '400',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                알까기 랭킹
              </button>
            </div>
            
            <div className="pdf-flex-col pdf-gap-150">
              {leaderboardData.length === 0 ? (
                <div className="pdf-text-label-14-mono pdf-text-center pdf-text-muted pdf-p-200">
                  등록된 랭킹이 없습니다.
                </div>
              ) : (
                leaderboardData.map((entry, idx) => (
                  <div key={entry.uid} className="pdf-flex-row pdf-items-center pdf-gap-100 pdf-border-bottom" style={{ paddingBottom: '12px' }}>
                    <div className="pdf-text-label-16 pdf-font-bold" style={{ width: '24px', color: idx < 3 ? 'var(--color-functional-red)' : 'var(--color-text-primary)' }}>
                      {idx + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="pdf-flex-row pdf-items-center" style={{ gap: '8px' }}>
                        <div className="pdf-text-label-14-mono pdf-text-primary">{entry.displayName}</div>
                        {leaderboardTab === 'omok' && entry.govatarPlayStyle !== undefined && entry.govatarDifficulty && (
                          <button 
                            onClick={() => {
                              setPendingGovatarChallenge({ 
                                uid: entry.uid, 
                                name: entry.displayName, 
                                playStyle: entry.govatarPlayStyle as number, 
                                difficulty: entry.govatarDifficulty as Difficulty 
                              });
                            }}
                            title={`Govatar (${entry.govatarDifficulty}) - 클릭하여 대결`}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', opacity: 0.8 }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.8')}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-functional-blue)' }}>
                              <rect x="3" y="11" width="18" height="10" rx="2" ry="2"></rect>
                              <circle cx="12" cy="5" r="2"></circle>
                              <path d="M12 7v4"></path>
                              <line x1="8" y1="16" x2="8" y2="16"></line>
                              <line x1="16" y1="16" x2="16" y2="16"></line>
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="pdf-text-right">
                      <div className="pdf-text-label-14-mono pdf-font-bold">{entry.points} pts</div>
                      <div className="pdf-text-label-14-mono pdf-text-muted" style={{ fontSize: '11px' }}>{entry.rankBadge}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Govatar Challenge Modal */}
      {pendingGovatarChallenge && (
        <div className="pdf-fixed pdf-inset-0 pdf-flex-row pdf-items-center pdf-justify-center pdf-modal-overlay" style={{ zIndex: 10000 }} onClick={() => setPendingGovatarChallenge(null)}>
          <div className="pdf-animate-fade-in pdf-radius-lg pdf-modal-container pdf-flex-col pdf-gap-200" style={{ width: '350px' }} onClick={e => e.stopPropagation()}>
            <div className="pdf-text-heading-24 pdf-text-center">Govatar 대결</div>
            <div className="pdf-text-label-14-mono pdf-text-center pdf-text-muted pdf-mt-100">
              <span style={{ color: 'var(--color-text-primary)', fontWeight: 'bold' }}>{pendingGovatarChallenge.name}</span>님의 Govatar({pendingGovatarChallenge.difficulty})와<br />대결하시겠습니까?
            </div>
            <div className="pdf-flex-row pdf-gap-100 pdf-justify-center pdf-mt-200">
              <button className="pdf-secondary-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setPendingGovatarChallenge(null)}>취소</button>
              <button className="pdf-btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => {
                setGovatarOpponent(pendingGovatarChallenge);
                setShowLeaderboard(false);
                setPendingGovatarChallenge(null);
                setTimeout(resetGame, 100);
              }}>대결 시작</button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Settings Modal */}
      {showProfileModal && profile && (
        <div className="pdf-fixed pdf-inset-0 pdf-flex-row pdf-items-center pdf-justify-center pdf-modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="pdf-animate-fade-in pdf-radius-lg pdf-modal-container" style={{ width: '350px' }} onClick={e => e.stopPropagation()}>
            <div className="pdf-flex-row pdf-items-center pdf-justify-between pdf-panel-header">
              <h2 className="pdf-text-heading-24">프로필 설정</h2>
              <button className="pdf-secondary-btn pdf-btn-xs" onClick={() => setShowProfileModal(false)}>닫기</button>
            </div>
            
            <div className="pdf-flex-col pdf-gap-200">
              <div>
                <label className="pdf-text-label-14-mono pdf-font-bold pdf-mb-050" style={{ display: 'block', color: 'var(--color-text-primary)' }}>닉네임 변경</label>
                <div className="pdf-flex-row pdf-gap-100">
                  <input 
                    type="text" 
                    id="nicknameInput"
                    defaultValue={profile.displayName}
                    className="pdf-text-label-14-mono"
                    style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border-default)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', outline: 'none' }}
                  />
                  <button className="pdf-btn-primary" style={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => {
                    const input = document.getElementById('nicknameInput') as HTMLInputElement;
                    if (input.value && input.value.trim() !== '' && input.value !== profile.displayName) {
                      updateNickname(input.value.trim());
                      alert('닉네임이 변경되었습니다.');
                    }
                  }}>저장</button>
                </div>
              </div>

              <div style={{ height: '1px', backgroundColor: 'var(--color-border-default)' }} />
              
              <div className="pdf-flex-col pdf-gap-100">
                <div className="pdf-text-label-14-mono pdf-font-bold" style={{ color: 'var(--color-text-primary)' }}>오목 전적</div>
                <div className="pdf-text-label-14-mono pdf-text-muted" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{profile.wins}승 {profile.losses}패</span>
                  <span>{rankBadge} ({profile.points} pts)</span>
                </div>
              </div>

              <div style={{ height: '1px', backgroundColor: 'var(--color-border-default)' }} />

              <div className="pdf-flex-col pdf-gap-100">
                <div className="pdf-text-label-14-mono pdf-font-bold" style={{ color: 'var(--color-text-primary)' }}>알까기 전적</div>
                <div className="pdf-text-label-14-mono pdf-text-muted" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{(profile.alkkagiWins || 0)}승 {(profile.alkkagiLosses || 0)}패</span>
                  <span>{(profile.alkkagiPoints || 0)} pts</span>
                </div>
              </div>

              <div style={{ height: '1px', backgroundColor: 'var(--color-border-default)' }} />

              <div className="pdf-flex-col pdf-gap-100">
                <div className="pdf-flex-row pdf-items-center pdf-justify-between">
                  <div className="pdf-text-label-14-mono pdf-font-bold" style={{ color: 'var(--color-text-primary)' }}>튜토리얼 모드</div>
                  {tutorialMode ? (
                    <button className="pdf-secondary-btn pdf-btn-xs" onClick={() => {
                      setTutorialMode(false);
                      setShowProfileModal(false);
                      setTimeout(resetGame, 100);
                    }}>진행 중 (종료하기)</button>
                  ) : (
                    <button className="pdf-btn-primary pdf-btn-xs" onClick={() => {
                      setTutorialMode(true);
                      setShowProfileModal(false);
                      setTimeout(resetGame, 100);
                    }}>시작하기</button>
                  )}
                </div>
                <div className="pdf-flex-row pdf-items-center pdf-justify-between" style={{ marginTop: '4px' }}>
                  <div className="pdf-text-label-14-mono pdf-text-muted" style={{ fontSize: '12px' }}>AI 난이도 선택</div>
                  <select 
                    value={tutorialDifficulty} 
                    onChange={(e) => setTutorialDifficulty(e.target.value as 'normal' | 'hard')}
                    className="pdf-text-label-14-mono"
                    style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--color-bg-primary)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)', outline: 'none' }}
                    disabled={tutorialMode}
                  >
                    <option value="normal">중수</option>
                    <option value="hard">고수</option>
                  </select>
                </div>
              </div>
              
              <div style={{ height: '1px', backgroundColor: 'var(--color-border-default)' }} />
              
              <div className="pdf-flex-col pdf-gap-100">
                <div className="pdf-text-label-14-mono pdf-font-bold" style={{ color: 'var(--color-text-primary)' }}>나의 Govatar</div>
                {profile.govatarTrainingMode ? (
                  <div className="pdf-panel pdf-flex-col pdf-p-150 pdf-gap-100" style={{ margin: 0, border: '1px solid var(--color-functional-red)' }}>
                    <div className="pdf-text-label-14-mono pdf-text-red pdf-font-bold pdf-text-center">
                      평가 진행 중... ({profile.govatarGamesPlayed || 0}/5판)
                    </div>
                    <div className="pdf-text-label-14-mono pdf-text-muted pdf-text-center" style={{ fontSize: '11px', lineHeight: '1.4' }}>
                      무작위 난이도와 5연전을 치러 나만의 고바타를 완성하세요.
                    </div>
                    <button className="pdf-secondary-btn pdf-w-full pdf-justify-center" onClick={() => {
                      if (window.confirm('평가를 취소하면 진행도가 모두 초기화됩니다. 취소하시겠습니까?')) {
                        cancelGovatarTraining();
                        setGovatarOpponent(null);
                        resetGame();
                      }
                    }}>
                      평가 취소하기
                    </button>
                  </div>
                ) : (
                  <div className="pdf-panel pdf-flex-col pdf-p-150 pdf-gap-100" style={{ margin: 0 }}>
                    {profile.govatarDifficulty ? (
                      <>
                        <div className="pdf-flex-row pdf-items-center pdf-justify-between">
                          <div className="pdf-text-label-14-mono pdf-text-primary">현재 난이도</div>
                          <div className="pdf-text-label-14-mono pdf-font-bold" style={{ color: 'var(--color-functional-blue)' }}>{profile.govatarDifficulty}</div>
                        </div>
                        <button className="pdf-btn-primary pdf-w-full pdf-justify-center" onClick={() => {
                          if (window.confirm('기존 데이터를 지우고 다시 5연전 평가를 시작하시겠습니까?')) {
                            startGovatarTraining();
                            setGovatarOpponent(null);
                            handleNewGame(); // triggers random silent difficulty and reset
                            setShowProfileModal(false);
                          }
                        }}>
                          재평가하기
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="pdf-text-label-14-mono pdf-text-muted pdf-text-center" style={{ fontSize: '11px', lineHeight: '1.4' }}>
                          나의 실력과 플레이 성향을 가진 고바타를 생성하세요.
                        </div>
                        <button className="pdf-btn-primary pdf-w-full pdf-justify-center" onClick={() => {
                          startGovatarTraining();
                          setGovatarOpponent(null);
                          handleNewGame(); // triggers random silent difficulty and reset
                          setShowProfileModal(false);
                        }}>
                          Govatar 평가 시작 (5연전)
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div style={{ height: '1px', backgroundColor: 'var(--color-border-default)' }} />
              
              <button className="pdf-text-label-14-mono pdf-text-muted pdf-w-full" style={{ textAlign: 'center', background: 'none', border: 'none', padding: '8px', cursor: 'pointer' }} onClick={() => {
                logout();
                setShowProfileModal(false);
              }}>
                로그아웃
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
    </>
  );
}

export default App;
