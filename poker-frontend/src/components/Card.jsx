import React from 'react';

const RANK_DISPLAY = { T: '10' };

export default function Card({ card, hidden = false, delay = 0 }) {
  if (hidden) {
    return (
      <div style={{
        ...styles.card,
        background: 'linear-gradient(135deg, #1a3a52 0%, #0d2035 50%, #1a3a52 100%)',
        border: '1px solid #2a5070',
        animationDelay: `${delay}s`,
      }} className="card-deal" />
    );
  }

  const isRed = card.suit === '♥' || card.suit === '♦';
  const rank = RANK_DISPLAY[card.rank] || card.rank;
  const color = isRed ? '#d63031' : '#111';

  return (
    <div style={{ ...styles.card, animationDelay: `${delay}s` }} className="card-deal card-hover">
      <div style={{ ...styles.corner, color }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1 }}>{rank}</div>
        <div style={{ fontSize: '0.75rem', lineHeight: 1 }}>{card.suit}</div>
      </div>
      <div style={{ ...styles.center, color }}>{card.suit}</div>
      <div style={{ ...styles.corner, color, transform: 'rotate(180deg)', alignSelf: 'flex-end' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1 }}>{rank}</div>
        <div style={{ fontSize: '0.75rem', lineHeight: 1 }}>{card.suit}</div>
      </div>
    </div>
  );
}

const styles = {
  card: {
    width: 58, height: 86,
    background: '#f8f4ec',
    borderRadius: 6,
    border: '1px solid #ccc',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '5px 6px',
    boxShadow: '0 4px 14px #00000066, inset 0 1px 0 #ffffffaa',
    cursor: 'default',
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 600,
  },
  corner: { display: 'flex', flexDirection: 'column', lineHeight: 1 },
  center: { fontSize: '1.3rem', textAlign: 'center' },
};