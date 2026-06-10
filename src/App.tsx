import { useOmok, Difficulty } from './hooks/useOmok';
import { useEffect, useState } from 'react';
import { useFirebase } from './hooks/useFirebase';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import './omok.css';

function App() {
  const [isPracticeMode, setIsPracticeMode] = useState(() => {
    return localStorage.getItem('omokPracticeMode') === 'true';
  });
  const [govatarOpponent, setGovatarOpponent] = useState<{ uid: string; name: string; playStyle: number; difficulty: Difficulty } | null>(null);
  const { profile, loginWithGoogle, logout, updateGameResult, updateNickname, startGovatarTraining, cancelGovatarTraining, rankBadge, isLoading } = useFirebase();
  const { board, currentPlayer, winner, showOverlay, winningLine, lastMove, isAiThinking, humanColor, isColorDeciding, decidedColor, difficulty, setDifficulty, playMove, resetGame, hasStarted, aiStatsHistory, latestAiStats, tutorialMode, setTutorialMode, tutorialDifficulty, setTutorialDifficulty, tutorialHint, isCalculatingHint, requestHint } = useOmok((isWin, diff, turnsPlayed) => {
    if (!isPracticeMode || profile?.govatarTrainingMode) {
      updateGameResult(diff, isWin, turnsPlayed, govatarOpponent);
    }
  }, govatarOpponent);
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
    if (hasStarted && !winner && !isColorDeciding && stoneCount >= 2) {
      localStorage.setItem('omokOngoingGame', difficulty);
      localStorage.setItem('omokOngoingPractice', String(isPracticeMode));
    } else {
      localStorage.removeItem('omokOngoingGame');
      localStorage.removeItem('omokOngoingPractice');
    }
  }, [hasStarted, winner, isColorDeciding, difficulty, isPracticeMode, stoneCount]);

  const handleNewGame = () => {
    if (hasStarted && !winner && !isColorDeciding && stoneCount >= 2) {
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

  const handleOpenLeaderboard = async () => {
    if (!profile) {
      alert("로그인이 필요합니다.");
      return;
    }
    setShowLeaderboard(true);
    try {
      if (db) {
        const docSnap = await getDoc(doc(db, 'leaderboard', 'global'));
        if (docSnap.exists()) {
          setLeaderboardData(docSnap.data().topPlayers || []);
        }
      }
    } catch (e) {
      console.error("Failed to load leaderboard:", e);
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
        {/* Sidebar for navigation / controls */}
      <aside className="pdf-sidebar">
        <div className="pdf-p-300">
          <div className="pdf-flex-col pdf-mb-300">
            <div className="pdf-text-heading-24 pdf-font-bold">오목</div>
          </div>

          <div className="pdf-nav-group-header">PROFILE</div>
          <div className="pdf-mt-100 pdf-mb-400">
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
                      {showRankInfo && (
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
                <div className="pdf-flex-row pdf-items-center pdf-gap-050">
                  <button onClick={handleOpenLeaderboard} className="pdf-text-label-14-mono pdf-font-bold pdf-text-red">
                    🏆 글로벌 랭킹
                  </button>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => setShowProfileModal(true)} className="pdf-text-label-14-mono pdf-text-muted" style={{ fontSize: '11px' }}>
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
          

          <div className="pdf-nav-group-header">CONTROLS</div>
          <div className="pdf-mt-100">
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
              <button className="pdf-secondary-btn pdf-w-full pdf-justify-center pdf-mt-100" onClick={handleNewGame}>
                Restart vs {govatarOpponent.name}
              </button>
            )}
            <button 
              className="pdf-secondary-btn pdf-w-full pdf-justify-center pdf-mt-100"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            >
              Toggle Theme
            </button>
            <div className="pdf-flex-row pdf-items-center pdf-justify-between pdf-mt-100" style={{ padding: '8px 12px', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '6px', border: '1px solid var(--color-border-default)', opacity: (hasStarted && !winner) || profile?.govatarTrainingMode ? 0.6 : 1 }}>
              <span className="pdf-text-label-14-mono" style={{ color: 'var(--color-text-primary)' }}>연습 모드</span>
              <label style={{ display: 'flex', alignItems: 'center', cursor: (hasStarted && !winner) || profile?.govatarTrainingMode ? 'not-allowed' : 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={isPracticeMode} 
                  onChange={(e) => setIsPracticeMode(e.target.checked)} 
                  disabled={(hasStarted && !winner) || profile?.govatarTrainingMode}
                  style={{ cursor: 'inherit', width: '16px', height: '16px', accentColor: 'var(--color-functional-red)' }}
                />
              </label>
            </div>

            {((hasStarted && !winner) || profile?.govatarTrainingMode) && (
              <div className="pdf-text-label-14-mono pdf-text-muted pdf-mt-050" style={{ fontSize: '10px', textAlign: 'right' }}>
                게임 중이거나 평가 중에는 변경할 수 없습니다
              </div>
            )}
          </div>

          <div className="pdf-nav-group-header pdf-mt-400" style={{ position: 'relative', justifyContent: 'flex-start', gap: '6px' }}>
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
                width: '260px', 
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
                  <p>높은 난이도일수록 탐색 깊이가 크게 증가하여 전략적인 수를 계산합니다.</p>
                </div>
              </div>
            )}
          </div>
          <div className="pdf-mt-100">
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

          <div className="pdf-nav-group-header" style={{ position: 'relative', justifyContent: 'flex-start', gap: '6px' }}>
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
                width: '260px', 
                padding: '12px',
                pointerEvents: 'none'
              }}>
                <div className="pdf-text-label-14-mono pdf-font-bold pdf-mb-050" style={{ color: 'var(--color-text-primary)' }}>오목 게임 룰 (자유 룰)</div>
                <div className="pdf-text-label-14-mono pdf-text-muted" style={{ fontSize: '12px', lineHeight: '1.4' }}>
                  <p className="pdf-mb-050">이 게임은 금수가 없는 <b>자유 룰(Freestyle)</b>입니다:</p>
                  <ul className="pdf-mb-050" style={{ paddingLeft: '16px', margin: '4px 0' }}>
                    <li><b>3-3 허용</b>: 흑과 백 모두 쌍삼을 만들 수 있습니다.</li>
                    <li><b>4-4 허용</b>: 흑과 백 모두 4-4를 만들 수 있습니다.</li>
                    <li><b>장목 허용</b>: 6개 이상의 돌을 이어도 승리로 인정합니다.</li>
                  </ul>
                  <p>누구든 먼저 가로, 세로, 대각선으로 5개 이상의 돌을 연속으로 놓으면 승리합니다.</p>
                </div>
              </div>
            )}
          </div>
          <div className="pdf-panel pdf-mt-100" style={{ margin: 0 }}>
            <ul className="pdf-text-copy-13-mono pdf-text-muted" style={{ listStyleType: 'none', padding: 0 }}>
              <li style={{ marginBottom: '8px' }}>15x15 Gomoku</li>
              <li style={{ marginBottom: '8px' }}>Pure Logic Heuristic AI</li>
              <li>Freestyle (No Restrictions)</li>
            </ul>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="pdf-main-view">
        <div className="pdf-main-content">
          <div className="pdf-mb-400">
            <h1 className="pdf-text-heading-32 pdf-mb-050">오목</h1>
            <p className="pdf-text-copy-14 pdf-text-muted">컴퓨터와 오목을 플레이하세요</p>
          </div>

          <div className="pdf-panel pdf-flex-row pdf-items-center pdf-justify-between pdf-mb-300">
            <div className="pdf-flex-row pdf-items-center pdf-gap-100">
              <div className="pdf-indicator-dot" style={{ backgroundColor: currentPlayer === 'black' ? '#1A1A1A' : '#F8F9FA', border: currentPlayer === 'white' ? '2px solid #C0C0C0' : 'none', width: '16px', height: '16px', borderRadius: '50%', boxShadow: currentPlayer === 'black' ? 'inset -2px -2px 4px rgba(255,255,255,0.2)' : 'inset -2px -2px 4px rgba(0,0,0,0.1)' }} />
              <div className="pdf-text-label-16">
                {!hasStarted ? '게임 시작 버튼을 눌러주세요' : winner ? (winner === 'draw' ? '무승부' : `${winner === humanColor ? 'Your' : (govatarOpponent ? govatarOpponent.name + "'s Govatar" : (profile?.govatarTrainingMode ? '알 수 없는 상대' : 'AI'))} Win!`) : 
                 (currentPlayer === humanColor ? `Your Turn [${humanColor === 'black' ? 'Black' : 'White'}]` : (govatarOpponent ? `${govatarOpponent.name}'s Govatar is thinking...` : (profile?.govatarTrainingMode ? '알 수 없는 상대가 생각 중...' : 'AI is thinking...')))}
                {isPracticeMode && <span className="pdf-text-label-14-mono pdf-text-red" style={{ marginLeft: '8px', fontSize: '12px' }}>(연습 모드)</span>}
              </div>
            </div>
            <div className="pdf-font-mono pdf-text-label-14-mono pdf-text-muted" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
              <div>Status: {!hasStarted ? 'WAITING' : winner ? 'GAME OVER' : 'ACTIVE'}</div>
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
            </div>
          </div>

          <div className="pdf-mt-400" style={{ width: '100%', paddingBottom: '16px', overflowX: 'auto' }}>
            <div style={{ display: 'flex', width: 'max-content', minWidth: '100%', padding: '0 24px', boxSizing: 'border-box' }}>
              <div style={{ flex: '1 1 0%' }}></div>
              <div className="pdf-flex-row" style={{ flexShrink: 0, alignItems: 'flex-start', flexWrap: 'nowrap', gap: (showAiStats && isPracticeMode) ? '16px' : '0px', transition: 'gap 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}>
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
    </main>
      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <div className="pdf-fixed pdf-inset-0 pdf-flex-row pdf-items-center pdf-justify-center pdf-modal-overlay" onClick={() => setShowLeaderboard(false)}>
          <div className="pdf-animate-fade-in pdf-radius-lg pdf-modal-container" style={{ width: '400px', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="pdf-flex-row pdf-items-center pdf-justify-between pdf-panel-header">
              <h2 className="pdf-text-heading-24">🏆 글로벌 랭킹 Top 100</h2>
              <button className="pdf-secondary-btn pdf-btn-xs" onClick={() => setShowLeaderboard(false)}>닫기</button>
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
                        {entry.govatarPlayStyle !== undefined && entry.govatarDifficulty && (
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
                <div className="pdf-text-label-14-mono pdf-font-bold" style={{ color: 'var(--color-text-primary)' }}>계정 전적</div>
                <div className="pdf-text-label-14-mono pdf-text-muted" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{profile.wins}승 {profile.losses}패</span>
                  <span>{rankBadge} ({profile.points} pts)</span>
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
