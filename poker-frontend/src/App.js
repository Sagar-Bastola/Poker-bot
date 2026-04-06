import React, { useState, useEffect, useCallback, useRef } from 'react';
import Card from './components/Card';

const API = 'http://localhost:5000/api';

const post = async (endpoint, body = {}) => {
  const r = await fetch(API + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
};

export default function App() {
  const [state, setState] = useState(null);
  const [raiseAmt, setRaiseAmt] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    { from: 'bot', text: "I'm ready. Are you? 🃏" }
  ]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);

  const startGame = useCallback(async () => {
    setLoading(true);
    const s = await post('/new_game');
    setState(s);
    setLoading(false);
    setMessages([{ from: 'bot', text: "New game. 1000 chips each. Don't lose them all. 😏" }]);
  }, []);

  useEffect(() => { startGame(); }, [startGame]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const act = async (action, amount = 0) => {
    if (loading) return;
    setLoading(true);
    const s = await post('/action', { action, amount });
    setState(s);
    setLoading(false);

    // Bot auto-comments on big moments
    if (action === 'fold') {
      addBotMessage("Smart fold. Or was it? 😏");
    } else if (action === 'raise' && amount >= 200) {
      addBotMessage(`${amount} chip raise?? Okay. I see you. 👀`);
    } else if (s.winner === 'bot') {
      addBotMessage(randomFrom(["Mine. 💰", "Thank you for the chips. 🙏", "Too easy. 😎", "Gg. Sort of."]));
    } else if (s.winner === 'player') {
      addBotMessage(randomFrom(["Lucky. 😤", "Fine. You got me this time.", "Recalculating... 🤖", "I let you win. Obviously."]));
    }
  };

  const newHand = async () => {
    setLoading(true);
    const s = await post('/new_hand');
    setState(s);
    setRaiseAmt('');
    setLoading(false);
    addBotMessage(randomFrom([
      "New hand. Fresh start. Same result. 😏",
      "Shuffling... 🃏",
      "Let's go again.",
      "I've already calculated my odds. Have you? 🤖",
    ]));
  };

  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg) return;
    setMessages(m => [...m, { from: 'player', text: msg }]);
    setChatInput('');
    const data = await post('/chat', { message: msg });
    setTimeout(() => {
      setMessages(m => [...m, { from: 'bot', text: data.response }]);
    }, 400);
  };

  const addBotMessage = (text) => {
    setTimeout(() => {
      setMessages(m => [...m, { from: 'bot', text }]);
    }, 600);
  };

  const randomFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];

  if (!state) return (
    <div style={styles.loading}>
      <div style={styles.loadingText}>Shuffling deck...</div>
    </div>
  );

  const isPlayerTurn = state.phase === 'player';
  const isOver = state.phase === 'hand_over' || state.phase === 'showdown';
  const gameOver = state.player_chips <= 0 || state.bot_chips <= 0;
  const minRaise = Math.max((state.current_bet || 0) * 2, 40);
  const eqPct = state.player_equity ? Math.round(state.player_equity * 100) : null;

  return (
    <div style={styles.appWrap}>
      <style>{`
        @keyframes dealIn {
          from { opacity: 0; transform: translateY(-18px) scale(0.82) rotate(-4deg); }
          to   { opacity: 1; transform: translateY(0) scale(1) rotate(0); }
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.7); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes pulseRed {
          0%,100% { box-shadow: 0 0 0 0 #ff000033; }
          50%      { box-shadow: 0 0 0 8px #ff000000; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .card-deal { animation: dealIn 0.32s cubic-bezier(0.34,1.56,0.64,1) both; }
        .card-hover { transition: transform 0.15s, box-shadow 0.15s; }
        .card-hover:hover { transform: translateY(-5px); box-shadow: 0 10px 28px #00000099 !important; }
        .btn-hover { transition: all 0.13s; }
        .btn-hover:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.15); }
        .btn-hover:active:not(:disabled) { transform: translateY(1px); }
        .btn-hover:disabled { opacity: 0.32; cursor: not-allowed; }
        .allin-pulse { animation: pulseRed 2s infinite; }
        .msg-bubble { animation: slideUp 0.25s ease both; }
        .chat-input:focus { border-color: var(--gold) !important; outline: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0a1e10; }
        ::-webkit-scrollbar-thumb { background: #2a6e3a; border-radius: 2px; }
      `}</style>

      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>♠ POKER BOT ♥</h1>
        <p style={styles.subtitle}>TEXAS HOLD'EM · HEADS-UP · INTERMEDIATE AI</p>
      </div>

      {/* Main layout: game + chat side by side */}
      <div style={styles.mainLayout}>

        {/* ── Game Column ── */}
        <div style={styles.gameCol}>
          <div style={styles.table}>

            {/* Bot Zone */}
            <div style={styles.playerZone}>
              <ChipsDisplay label="Bot Chips" value={state.bot_chips} color="#c0392b" accent="#e05252" tag="BOT" />
              <div style={styles.handCol}>
                <div style={styles.handLabel}>BOT'S HAND</div>
                <div style={styles.cardsRow}>
                  {state.bot_hand
                    ? state.bot_hand.map((c, i) => <Card key={i} card={c} delay={i * 0.07} />)
                    : [0,1].map(i => <Card key={i} hidden delay={i * 0.07} />)
                  }
                </div>
                {state.bot_hand_name && (
                  <div style={{ ...styles.handBadge, background: '#2a0a0a', borderColor: '#6a1818', color: '#f07070' }}>
                    {state.bot_hand_name}
                  </div>
                )}
              </div>
              <div style={{ width: 90 }} />
            </div>

            {/* Felt */}
            <div style={styles.felt}>
              <div style={styles.streetBadge}>{state.street_name?.toUpperCase() || 'PREFLOP'}</div>
              <div style={styles.handCol}>
                <div style={styles.handLabel}>COMMUNITY CARDS</div>
                <div style={styles.cardsRow}>
                  {[0,1,2,3,4].map(i =>
                    state.community?.[i]
                      ? <Card key={i} card={state.community[i]} delay={i * 0.08} />
                      : <div key={i} style={styles.cardPlaceholder} />
                  )}
                </div>
              </div>
              <div style={styles.potDisplay}>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem', letterSpacing: '0.1em' }}>POT</span>
                <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '1.1rem' }}>{state.pot}</span>
              </div>
              {eqPct !== null && state.street > 0 && (
                <div style={styles.equityRow}>
                  <span style={styles.eqLabel}>YOUR EQUITY</span>
                  <div style={styles.eqBarWrap}>
                    <div style={{ ...styles.eqFill, width: `${eqPct}%`,
                      background: eqPct > 55 ? 'linear-gradient(90deg,#1a7a30,#2dbe50)'
                        : eqPct < 40 ? 'linear-gradient(90deg,#8a1010,#c02020)'
                        : 'linear-gradient(90deg,#8a6000,#c09000)' }} />
                  </div>
                  <span style={{ color: 'var(--gold)', fontSize: '0.75rem', width: 40 }}>{eqPct}%</span>
                </div>
              )}
              <div style={styles.actionLog}>{state.last_action}</div>
              {state.winner && (
                <div style={{
                  ...styles.winnerBanner,
                  ...(state.winner === 'player' ? styles.winnerPlayer
                    : state.winner === 'bot' ? styles.winnerBot : styles.winnerSplit),
                  animation: 'popIn 0.4s cubic-bezier(0.34,1.56,0.64,1)',
                }}>
                  {state.winner === 'player' ? '🏆 You Win!'
                    : state.winner === 'bot' ? '🤖 Bot Wins!' : '🤝 Split Pot!'}
                </div>
              )}
            </div>

            {/* Player Zone */}
            <div style={{ ...styles.playerZone, borderRadius: '0 0 12px 12px', borderTop: 'none', borderBottom: '1px solid #1e4d2b' }}>
              <ChipsDisplay label="Your Chips" value={state.player_chips} color="#2d6be4" accent="#5a9ff7" tag="YOU" />
              <div style={styles.handCol}>
                <div style={styles.handLabel}>YOUR HAND</div>
                <div style={styles.cardsRow}>
                  {state.player_hand?.map((c, i) => <Card key={i} card={c} delay={i * 0.07} />)}
                </div>
                {state.player_hand_name && (
                  <div style={{ ...styles.handBadge, background: '#0a2a5a', borderColor: '#2a60b0', color: '#8ab4f8' }}>
                    {state.player_hand_name}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', minWidth: 90 }}>
                <div style={styles.handLabel}>TO CALL</div>
                <div style={{ color: '#f0a040', fontWeight: 700, fontSize: '1.1rem' }}>{state.to_call || 0}</div>
              </div>
            </div>

            {/* Controls */}
            <div style={styles.controls}>
              {isPlayerTurn && !gameOver && (
                <div style={styles.btnRow}>
                  <Btn onClick={() => act('fold')} style={styles.btnFold} disabled={loading}>Fold</Btn>
                  {state.can_check
                    ? <Btn onClick={() => act('check')} style={styles.btnCheck} disabled={loading}>Check</Btn>
                    : <Btn onClick={() => act('call', state.to_call)} style={styles.btnCall} disabled={loading}>
                        Call {state.to_call}
                      </Btn>
                  }
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="number"
                      value={raiseAmt}
                      onChange={e => setRaiseAmt(e.target.value)}
                      placeholder={`Min ${minRaise}`}
                      min={minRaise}
                      style={styles.raiseInput}
                    />
                    <Btn
                      onClick={() => { if (raiseAmt) { act('raise', parseInt(raiseAmt)); setRaiseAmt(''); } }}
                      style={styles.btnRaise}
                      disabled={loading || !raiseAmt}
                    >Raise</Btn>
                  </div>
                  <Btn
                    onClick={() => act('raise', state.player_chips + (state.p_bet || 0))}
                    style={styles.btnAllIn}
                    className="allin-pulse"
                    disabled={loading}
                  >ALL IN 🔥</Btn>
                </div>
              )}
              {isOver && !gameOver && (
                <div style={styles.btnRow}>
                  <Btn onClick={newHand} style={styles.btnNew} disabled={loading}>Next Hand ▶</Btn>
                  <Btn onClick={startGame} style={styles.btnGhost} disabled={loading}>New Game</Btn>
                </div>
              )}
              {gameOver && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ ...styles.winnerBanner, ...(state.player_chips <= 0 ? styles.winnerBot : styles.winnerPlayer), marginBottom: 14 }}>
                    {state.player_chips <= 0 ? '💀 Bot wins the game!' : '🏆 You win the game!'}
                  </div>
                  <Btn onClick={startGame} style={styles.btnNew}>Play Again</Btn>
                </div>
              )}
              <div style={styles.statsBar}>
                <span>HAND <b style={{ color: 'var(--gold)' }}>{state.hand_num}</b></span>
                <span>YOU <b style={{ color: 'var(--gold)' }}>{state.player_chips}</b></span>
                <span>BOT <b style={{ color: 'var(--gold)' }}>{state.bot_chips}</b></span>
              </div>
            </div>

          </div>
        </div>

        {/* ── Chat Column ── */}
        <div style={styles.chatCol}>
          <div style={styles.chatHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={styles.botAvatar}>🤖</div>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--cream)' }}>Poker Bot</div>
                <div style={{ fontSize: '0.6rem', color: '#4dbb65' }}>● Online</div>
              </div>
            </div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>TRASH TALK ENABLED</div>
          </div>

          <div style={styles.chatMessages}>
            {messages.map((m, i) => (
              <div key={i} className="msg-bubble" style={{
                display: 'flex',
                justifyContent: m.from === 'player' ? 'flex-end' : 'flex-start',
                marginBottom: 8,
              }}>
                {m.from === 'bot' && (
                  <div style={styles.botAvatarSmall}>🤖</div>
                )}
                <div style={{
                  maxWidth: '78%',
                  padding: '8px 12px',
                  borderRadius: m.from === 'player' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  fontSize: '0.78rem',
                  lineHeight: 1.5,
                  ...(m.from === 'player'
                    ? { background: '#1a4a8a', color: '#c8dcf8', border: '1px solid #2a60b0' }
                    : { background: '#0f2e18', color: 'var(--cream)', border: '1px solid #1e4d2b' }
                  )
                }}>
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div style={styles.chatInputRow}>
            <input
              className="chat-input"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChat()}
              placeholder="Talk trash..."
              style={styles.chatInputField}
            />
            <button
              onClick={sendChat}
              style={styles.chatSendBtn}
              className="btn-hover"
            >↑</button>
          </div>

          {/* Quick phrases */}
          <div style={styles.quickPhrases}>
            {["bluffing?", "your odds?", "nice hand", "I'll win", "scared?"].map(p => (
              <button key={p} className="btn-hover" onClick={() => {
                setChatInput(p);
                setTimeout(() => {
                  setMessages(m => [...m, { from: 'player', text: p }]);
                  post('/chat', { message: p }).then(d => {
                    setTimeout(() => setMessages(m => [...m, { from: 'bot', text: d.response }]), 400);
                  });
                  setChatInput('');
                }, 10);
              }} style={styles.quickBtn}>{p}</button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

function Btn({ onClick, style, disabled, children, className = '' }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`btn-hover ${className}`}
      style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.78rem', fontWeight: 600,
        letterSpacing: '0.05em', border: 'none', borderRadius: 6, padding: '10px 20px',
        cursor: 'pointer', textTransform: 'uppercase', ...style }}
    >{children}</button>
  );
}

function ChipsDisplay({ label, value, color, accent, tag }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 38, height: 38, borderRadius: '50%', background: color,
        border: `3px solid ${accent}`, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: '0.55rem', fontWeight: 700, color: '#fff' }}>{tag}</div>
      <div>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--gold)' }}>{value}</div>
      </div>
    </div>
  );
}

const styles = {
  appWrap: { maxWidth: 1200, margin: '0 auto', padding: '0 12px 40px' },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' },
  loadingText: { color: 'var(--gold)', fontFamily: "'IBM Plex Mono',monospace", fontSize: '1.2rem', letterSpacing: '0.2em' },
  header: { textAlign: 'center', padding: '24px 0 10px', borderBottom: '1px solid #1e4d2b', marginBottom: 16 },
  title: { fontFamily: "'Playfair Display',serif", fontWeight: 900, fontSize: '2.2rem', color: 'var(--gold)', textShadow: '0 0 30px #c9a84c44' },
  subtitle: { fontSize: '0.72rem', color: 'var(--text-dim)', letterSpacing: '0.15em', marginTop: 4 },

  mainLayout: { display: 'flex', gap: 16, alignItems: 'flex-start' },
  gameCol: { flex: '1 1 600px', minWidth: 0 },
  table: { display: 'flex', flexDirection: 'column', alignItems: 'center' },

  chatCol: {
    width: 300, flexShrink: 0,
    background: '#060e08',
    border: '1px solid #1e4d2b',
    borderRadius: 12,
    display: 'flex', flexDirection: 'column',
    height: 600, overflow: 'hidden',
    position: 'sticky', top: 16,
  },

  chatHeader: {
    padding: '12px 16px',
    borderBottom: '1px solid #1e4d2b',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: '#0a1e10',
  },
  botAvatar: { fontSize: '1.4rem', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f2e18', borderRadius: '50%', border: '1px solid #2a6e3a' },
  botAvatarSmall: { fontSize: '1rem', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f2e18', borderRadius: '50%', border: '1px solid #1e4d2b', marginRight: 6, flexShrink: 0, alignSelf: 'flex-end' },

  chatMessages: { flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column' },

  chatInputRow: { padding: '10px 12px', borderTop: '1px solid #1e4d2b', display: 'flex', gap: 8 },
  chatInputField: {
    flex: 1, fontFamily: "'IBM Plex Mono',monospace",
    background: '#0a1e10', border: '1px solid #2a6e3a',
    borderRadius: 6, color: 'var(--cream)',
    padding: '8px 12px', fontSize: '0.78rem', outline: 'none',
  },
  chatSendBtn: {
    width: 36, height: 36, borderRadius: 6,
    background: 'var(--gold)', color: '#1a0a00',
    border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 700,
  },

  quickPhrases: { padding: '8px 12px 12px', display: 'flex', flexWrap: 'wrap', gap: 6, borderTop: '1px solid #1a3320' },
  quickBtn: {
    fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.62rem',
    background: '#0f2e18', border: '1px solid #2a6e3a',
    borderRadius: 20, color: 'var(--text-dim)',
    padding: '4px 10px', cursor: 'pointer',
  },

  playerZone: {
    width: '100%', padding: '16px 24px',
    background: 'linear-gradient(180deg,#060e08 0%,#0a1e10 100%)',
    borderRadius: '12px 12px 0 0',
    border: '1px solid #1e4d2b', borderBottom: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
  },
  felt: {
    width: '100%',
    background: 'radial-gradient(ellipse at center, #0f5029 0%, #0a3d1f 70%, #062010 100%)',
    borderLeft: '1px solid #1e4d2b', borderRight: '1px solid #1e4d2b',
    padding: '20px 16px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
  },
  streetBadge: { background: '#00000055', border: '1px solid #2a6e3a', borderRadius: 4, padding: '3px 14px', fontSize: '0.65rem', letterSpacing: '0.2em', color: '#6dbc82' },
  handCol: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 },
  handLabel: { fontSize: '0.62rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dim)' },
  cardsRow: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  cardPlaceholder: { width: 58, height: 86, borderRadius: 6, background: 'linear-gradient(135deg,#1a3a52,#0d2035,#1a3a52)', border: '1px solid #2a5070', opacity: 0.25 },
  potDisplay: { background: '#00000044', border: '1px solid var(--gold-dim)', borderRadius: 50, padding: '6px 22px', display: 'flex', alignItems: 'center', gap: 10 },
  equityRow: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 420 },
  eqLabel: { fontSize: '0.6rem', color: 'var(--text-dim)', width: 90, textAlign: 'right', whiteSpace: 'nowrap' },
  eqBarWrap: { flex: 1, height: 8, background: '#ffffff15', borderRadius: 4, overflow: 'hidden' },
  eqFill: { height: '100%', borderRadius: 4, transition: 'width 0.6s ease' },
  actionLog: { background: '#00000055', border: '1px solid #1e3d25', borderRadius: 6, padding: '10px 18px', fontSize: '0.78rem', color: 'var(--cream)', textAlign: 'center', minHeight: 38, width: '100%', maxWidth: 580 },
  handBadge: { fontSize: '0.68rem', padding: '3px 10px', borderRadius: 4, border: '1px solid', letterSpacing: '0.05em', textAlign: 'center' },
  winnerBanner: { padding: '10px 30px', borderRadius: 8, fontFamily: "'Playfair Display',serif", fontSize: '1.3rem', fontWeight: 700, letterSpacing: '0.05em', textAlign: 'center' },
  winnerPlayer: { background: 'linear-gradient(135deg,#0d3d1a,#1a6030)', border: '2px solid var(--gold)', color: 'var(--gold)' },
  winnerBot:    { background: 'linear-gradient(135deg,#3d0d0d,#601a1a)', border: '2px solid #e05252', color: '#f07070' },
  winnerSplit:  { background: 'linear-gradient(135deg,#1a1a0d,#3a3a15)', border: '2px solid #c0c030', color: '#e0e060' },
  controls: { width: '100%', padding: '16px 24px', background: 'linear-gradient(0deg,#060e08 0%,#0a1e10 100%)', borderRadius: '0 0 12px 12px', border: '1px solid #1e4d2b', borderTop: 'none', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' },
  btnRow: { display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' },
  btnFold:  { background: '#4a1010', color: '#f07070', border: '1px solid #6a1818' },
  btnCheck: { background: '#1a5c2e', color: '#7ddc96', border: '1px solid #2a8040' },
  btnCall:  { background: '#1a4a8a', color: '#8ab4f8', border: '1px solid #2a60b0' },
  btnRaise: { background: '#6b3a00', color: '#f0a040', border: '1px solid #8a5000' },
  btnAllIn: { background: 'linear-gradient(135deg,#8a0000,#c00000)', color: '#ffd0d0', border: '1px solid #e00' },
  btnNew:   { background: 'var(--gold)', color: '#1a0a00', border: '1px solid #a07020' },
  btnGhost: { background: '#111', color: '#666', border: '1px solid #333' },
  raiseInput: { fontFamily: "'IBM Plex Mono',monospace", background: '#0a1e10', border: '1px solid #2a6e3a', borderRadius: 5, color: 'var(--gold)', padding: '9px 12px', fontSize: '0.85rem', width: 110, outline: 'none' },
  statsBar: { display: 'flex', gap: 24, justifyContent: 'center', padding: '8px 0 0', fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: '0.1em', borderTop: '1px solid #1a3320', width: '100%' },
};