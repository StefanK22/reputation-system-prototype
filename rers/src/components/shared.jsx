export function Tag({ children }) {
  const colors = {
    Agent:      { bg: '#e8f0fb', text: '#1a5ca8', border: '#c5d8f5' },
    Buyer:      { bg: '#f0f8ee', text: '#2a7a2a', border: '#c5e5c0' },
    Completed:  { bg: '#f0f8ee', text: '#2a7a2a', border: '#c5e5c0' },
    InProgress: { bg: '#fff8e6', text: '#8a5800', border: '#f0d98a' },
    Draft:      { bg: '#f5f5f5', text: '#666',    border: '#e0e0e0' },
    Discarded:  { bg: '#fdf0f0', text: '#a33',    border: '#f0c8c8' },
    pending:    { bg: '#f5f5f5', text: '#888',    border: '#e0e0e0' },
    processing: { bg: '#fff8e6', text: '#8a5800', border: '#f0d98a' },
    processed:  { bg: '#f0f8ee', text: '#2a7a2a', border: '#c5e5c0' },
  };
  const s = colors[children] || { bg: '#f5f5f5', text: '#666', border: '#e0e0e0' };
  return (
    <span style={{ display: 'inline-block', background: s.bg, border: `1px solid ${s.border}`, color: s.text, padding: '2px 7px', fontSize: 11, borderRadius: 2, fontFamily: 'inherit', letterSpacing: '0.02em' }}>
      {children}
    </span>
  );
}

export function ScoreBar({ value, color = '#1a6abf', height = 4 }) {
  const pct = typeof value === 'number' ? Math.max(0, Math.min(1, value)) : 0;
  return (
    <div style={{ background: '#eee', borderRadius: 2, height, width: '100%', overflow: 'hidden' }}>
      <div style={{ width: `${pct * 100}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.5s ease' }} />
    </div>
  );
}

export function ScoreGauge({ score, size = 52 }) {
  const n = typeof score === 'number' ? score : 0;
  const color = n >= 75 ? '#2a7a2a' : n >= 55 ? '#8a5800' : '#a33';
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', border: `3px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'border-color 0.4s' }}>
      <span style={{ fontSize: size * 0.26, fontWeight: 700, color, transition: 'color 0.4s' }}>{n.toFixed(0)}</span>
    </div>
  );
}

export function ScoreDelta({ delta }) {
  if (!delta || Math.abs(delta) < 0.05) return null;
  const pos = delta > 0;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: pos ? '#27ae60' : '#c0392b', marginLeft: 4 }}>
      {pos ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}
    </span>
  );
}
