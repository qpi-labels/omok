import { useOmok } from './hooks/useOmok';
import { useEffect, useState } from 'react';
import './omok.css';

function App() {
  const { board, currentPlayer, winner, showOverlay, winningLine, lastMove, isAiThinking, playMove, resetGame } = useOmok();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <div className="pdf-app">
      {/* Sidebar for navigation / controls */}
      <aside className="pdf-sidebar">
        <div className="pdf-p-300">
          <div className="pdf-text-heading-24 pdf-mb-400">오목</div>
          
          <div className="pdf-nav-group-header">CONTROLS</div>
          <div className="pdf-mt-100">
            <button className="pdf-btn-primary pdf-w-full pdf-mb-200" onClick={resetGame}>
              New Game
            </button>
            <button className="pdf-secondary-btn pdf-w-full pdf-justify-center" onClick={toggleTheme}>
              Toggle Theme
            </button>
          </div>

          <div className="pdf-nav-group-header pdf-mt-400">GAME INFO</div>
          <div className="pdf-p-150 pdf-bg-secondary pdf-radius-md pdf-mt-100 pdf-text-copy-13-mono">
            <p className="pdf-mb-100">15x15 Gomoku</p>
            <p className="pdf-mb-100">Pure Logic Heuristic AI</p>
            <p>Freestyle (No Restrictions)</p>
          </div>
        </div>
      </aside>

      {/* Main View */}
      <main className="pdf-main-view">
        <div className="pdf-main-content">
          <h1 className="pdf-text-heading-32 pdf-mb-100">오목</h1>
          <p className="pdf-text-muted pdf-mb-400 pdf-text-copy-14">컴퓨터와 오목을 플레이하세요</p>

          <div className="pdf-panel">
            <div className="pdf-panel-header pdf-flex-row pdf-justify-between pdf-items-center">
              <div className="pdf-flex-row pdf-items-center pdf-gap-150">
                <div className={`stone-preview ${currentPlayer === 'black' ? 'black' : 'white'}`}></div>
                <span className="pdf-text-label-16">
                  {winner
                    ? 'Game Over'
                    : currentPlayer === 'black'
                    ? 'Your Turn [Black]'
                    : isAiThinking
                    ? 'Computer is thinking...'
                    : "Computer's Turn [White]"}
                </span>
              </div>
              <div className="pdf-text-copy-13-mono pdf-text-muted">Status: {winner ? 'HALTED' : 'ACTIVE'}</div>
            </div>

            <div className="pdf-flex-row pdf-justify-center pdf-py-200">
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
                          onClick={() => playMove(rowIndex, colIndex)}
                        >
                          {cell && (
                            <div className={`stone ${cell} ${isLastMove ? 'last-move' : ''} ${isWinningStone ? 'winning-stone' : ''}`}></div>
                          )}
                        </div>
                      );
                    })
                  )}

                  {showOverlay && winner && (
                    <div className="winner-overlay">
                      <div className="pdf-text-heading-32 pdf-mb-200" style={{ color: 'var(--color-text-primary)' }}>
                        {winner === 'black' ? 'YOU WIN!' : winner === 'white' ? 'COMPUTER WINS!' : 'DRAW!'}
                      </div>
                      <button className="pdf-btn-primary" onClick={resetGame}>RESTART SYSTEM</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
