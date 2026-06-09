import { useOmok } from './hooks/useOmok';
import { useEffect, useState } from 'react';
import { useFirebase } from './hooks/useFirebase';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import './omok.css';

function App() {
  const { profile, loginWithGoogle, logout, updateGameResult, rankBadge, isLoading } = useFirebase();
  const { board, currentPlayer, winner, showOverlay, winningLine, lastMove, isAiThinking, humanColor, isColorDeciding, decidedColor, difficulty, setDifficulty, playMove, resetGame, hasStarted } = useOmok((isWin, diff) => {
    updateGameResult(diff, isWin);
  });
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showDiffInfo, setShowDiffInfo] = useState(false);
  const [showRankInfo, setShowRankInfo] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [cursorPos, setCursorPos] = useState({ row: 7, col: 7 });

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

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
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
                    <div className="pdf-text-label-14-mono">{profile.displayName}</div>
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
                    <div className="pdf-text-label-14-mono pdf-text-muted" style={{ fontSize: '11px', marginTop: '2px' }}>
                      전적: {profile.wins}승 {profile.losses}패
                    </div>
                  </div>
                </div>
                <div className="pdf-flex-row pdf-items-center pdf-gap-050">
                  <button onClick={handleOpenLeaderboard} className="pdf-text-label-14-mono pdf-font-bold pdf-text-red">
                    🏆 글로벌 랭킹
                  </button>
                  <div style={{ flex: 1 }} />
                  <button onClick={logout} className="pdf-text-label-14-mono pdf-text-muted" style={{ fontSize: '11px' }}>
                    Logout
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
            <button className="pdf-btn-primary pdf-w-full pdf-justify-center" onClick={resetGame}>
              New Game
            </button>
            <button 
              className="pdf-secondary-btn pdf-w-full pdf-justify-center pdf-mt-100"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            >
              Toggle Theme
            </button>
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
                  </ul>
                  <p>높은 난이도일수록 탐색 깊이가 크게 증가하여 전략적인 수를 계산합니다.</p>
                </div>
              </div>
            )}
          </div>
          <div className="pdf-mt-100">
            <div className="pdf-flex-row" style={{ display: 'inline-flex', backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-default)', borderRadius: '10px', padding: '4px', gap: '4px', width: '100%', overflowX: 'auto' }}>
              {(['easy', 'normal', 'hard', 'expert', 'god'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setDifficulty(level)}
                  style={{
                    flex: 1,
                    padding: '6px 4px',
                    borderRadius: '6px',
                    backgroundColor: difficulty === level ? 'var(--color-bg-primary)' : 'transparent',
                    color: difficulty === level ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    boxShadow: difficulty === level ? 'var(--shadow-hardware-bevel)' : 'none',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <span className="pdf-text-label-14-mono" style={{ fontSize: '12px', fontWeight: difficulty === level ? '700' : '400' }}>
                    {level === 'easy' ? '하수' : level === 'normal' ? '중수' : level === 'hard' ? '고수' : level === 'expert' ? '초고수' : '신'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="pdf-nav-group-header">GAME INFO</div>
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
              <div className="pdf-indicator-dot" style={{ backgroundColor: currentPlayer === 'black' ? 'var(--color-text-primary)' : 'var(--color-bg-primary)', border: currentPlayer === 'white' ? '2px solid var(--color-border-hover)' : 'none', width: '16px', height: '16px', borderRadius: '50%' }} />
              <div className="pdf-text-label-16">
                {!hasStarted ? '게임 시작 버튼을 눌러주세요' : winner ? (winner === 'draw' ? '무승부' : `${winner === humanColor ? 'Your' : 'AI'} Win!`) : 
                 (currentPlayer === humanColor ? `Your Turn [${humanColor === 'black' ? 'Black' : 'White'}]` : 'AI is thinking...')}
              </div>
            </div>
            <div className="pdf-font-mono pdf-text-label-14-mono pdf-text-muted">
              Status: {!hasStarted ? 'WAITING' : winner ? 'GAME OVER' : 'ACTIVE'}
            </div>
          </div>

          <div className="pdf-flex-col pdf-items-center pdf-mt-400">
              <div className="board-wrapper">
                <div className="board">
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
                        top: `${dot.r * 36 + 18}px`,
                        left: `${dot.c * 36 + 18}px`
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
                            setCursorPos({ row: rowIndex, col: colIndex });
                            playMove(rowIndex, colIndex);
                          }}
                          onMouseEnter={() => setCursorPos({ row: rowIndex, col: colIndex })}
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
                        width: '36px',
                        height: '36px',
                        top: `${cursorPos.row * 36 + 18}px`,
                        left: `${cursorPos.col * 36 + 18}px`,
                        transform: 'translate(-50%, -50%)',
                        border: '2px solid var(--color-functional-red)',
                        borderRadius: '4px',
                        zIndex: 6,
                        pointerEvents: 'none',
                        boxShadow: 'var(--shadow-functional-glow)'
                      }}
                    />
                  )}

                  {isColorDeciding && (
                    <div className="color-decider-overlay">
                      <div className={`coin-container ${decidedColor ? 'decided' : ''}`}>
                        <div className={`coin ${decidedColor || ''}`}>
                          <div className="coin-face front black"></div>
                          <div className="coin-face back white"></div>
                        </div>
                      </div>
                      <div className="pdf-text-heading-24" style={{ color: 'var(--color-text-primary)' }}>
                        {decidedColor 
                          ? (decidedColor === 'black' ? '흑돌 당첨! (선공)' : '백돌 당첨! (후공)')
                          : '돌 색상을 섞는 중...'}
                      </div>
                    </div>
                  )}

                  {showOverlay && winner && (
                    <div className="winner-overlay">
                      <div className="pdf-text-heading-32 pdf-mb-200" style={{ color: 'var(--color-text-primary)' }}>
                        {winner === humanColor ? 'YOU WIN!' : winner === 'draw' ? 'DRAW!' : 'COMPUTER WINS!'}
                      </div>
                      <button className="pdf-btn-primary" onClick={resetGame}>RESTART SYSTEM</button>
                    </div>
                  )}

                  {!hasStarted && (
                    <div className="color-decider-overlay" style={{ background: 'rgba(255,255,255,0.4)', backdropFilter: 'blur(4px)' }}>
                      <div className="pdf-text-heading-24" style={{ color: 'var(--color-text-primary)' }}>
                        대기 중
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
      </main>
      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <div className="overlay" style={{ zIndex: 100 }} onClick={() => setShowLeaderboard(false)}>
          <div className="pdf-panel pdf-p-400" style={{ width: '400px', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto', margin: 0 }} onClick={e => e.stopPropagation()}>
            <div className="pdf-flex-row pdf-mb-300 pdf-items-center pdf-justify-between">
              <div className="pdf-text-heading-24">🏆 글로벌 랭킹 Top 100</div>
              <button onClick={() => setShowLeaderboard(false)} className="pdf-text-muted" style={{ fontSize: '20px' }}>×</button>
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
                      <div className="pdf-text-label-14-mono pdf-text-primary">{entry.displayName}</div>
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
    </div>
  );
}

export default App;
