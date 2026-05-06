import { useState, useEffect } from 'react';
import { getRankings, getAllSubjects, getSubject } from '../api/reputation.js';
import { Tag, ScoreBar, ScoreGauge } from '../components/shared.jsx';

const COMP_IDS    = ['Reliability', 'Responsiveness', 'Accuracy'];
const COMP_COLORS = ['#1a6abf', '#7a5abf', '#2a7a6a'];

const tdSt = { padding: '8px 12px', borderBottom: '1px solid #f0f0f0', color: '#333', verticalAlign: 'middle' };
const thSt = { padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #eee', color: '#999', fontWeight: 'normal', fontSize: 11, textTransform: 'uppercase' };

// Build a map: party → { comps: { Reliability: 0-1, ... }, interactions: number }
function buildCompMap(subjects) {
  const map = {};
  if (!Array.isArray(subjects)) return map;
  subjects.forEach(s => {
    if (!s.party) return;
    const comps = {};
    let maxCount = 0;
    (s.components || []).forEach(c => {
      comps[c.componentId] = c.score;
      if (c.count > maxCount) maxCount = c.count;
    });
    map[s.party] = { comps, interactions: maxCount };
  });
  return map;
}

function SubjectPanel({ party, onClose }) {
  const [subject, setSubject] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getSubject(party)
      .then(setSubject)
      .catch(() => setSubject(null))
      .finally(() => setLoading(false));
  }, [party]);

  const displayName = typeof party === 'string' ? party.split('::')[0] : String(party ?? '');

  return (
    <div className="detail-panel" style={{ width: 300, borderLeft: '1px solid #e8e8e8', padding: 20, overflowY: 'auto', flexShrink: 0, background: '#fafafa' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 13, fontWeight: 'normal', margin: 0, textTransform: 'none', letterSpacing: 0, color: '#1a1a1a' }}>{displayName}</h2>
        <button onClick={onClose} style={{ background: '#f5f5f5', border: '1px solid #ddd', color: '#333', padding: '3px 9px', fontSize: 11, cursor: 'pointer', borderRadius: 3, fontFamily: 'inherit' }}>✕</button>
      </div>
      <div style={{ fontSize: 11, color: '#bbb', marginBottom: 16, wordBreak: 'break-all' }}>{party}</div>

      {loading && <p className="muted">Loading...</p>}

      {!loading && subject && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <ScoreGauge score={subject.overallScore ?? 0} />
            <div>
              <Tag>{subject.roleType || '—'}</Tag>
              {subject.components?.length > 0 && (
                <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
                  {Math.max(...(subject.components.map(c => c.count ?? 0)))} observations
                </div>
              )}
            </div>
          </div>

          {subject.components?.length > 0 && (
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#999', letterSpacing: '0.08em', marginBottom: 10 }}>Components</div>
              {subject.components.map((c, i) => (
                <div key={c.componentId} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: '#555' }}>{c.componentId}</span>
                    <span style={{ fontSize: 11, color: '#333', fontWeight: 600 }}>
                      {((c.score ?? 0) * 100).toFixed(1)}
                    </span>
                  </div>
                  <ScoreBar value={c.score ?? 0} color={COMP_COLORS[i % COMP_COLORS.length]} height={6} />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!loading && !subject && <p className="muted">No data found.</p>}
    </div>
  );
}

export default function Rankings() {
  const [rankings,  setRankings]  = useState([]);
  const [compMap,   setCompMap]   = useState({});
  const [selected,  setSelected]  = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([
      getRankings(50),
      getAllSubjects().catch(() => []),
    ])
      .then(([rows, subjects]) => {
        setRankings(rows ?? []);
        setCompMap(buildCompMap(subjects));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  if (loading) return <div className="page-scroll"><p className="muted">Loading...</p></div>;
  if (error)   return <div className="page-scroll"><p className="error">{error}</p></div>;

  const sorted      = [...rankings].sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0));
  const hasCompData = Object.keys(compMap).length > 0;

  return (
    <div className="page-with-panel">
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1 style={{ marginBottom: 0 }}>Rankings</h1>
          <button onClick={load}>Refresh</button>
        </div>

        {sorted.length === 0 ? (
          <p className="muted">No subjects found.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={thSt}>#</th>
                <th style={thSt}>Party</th>
                <th style={thSt}>Role</th>
                <th style={thSt}>Score</th>
                {hasCompData && <>
                  <th style={thSt}>Reliability</th>
                  <th style={thSt}>Responsiveness</th>
                  <th style={thSt}>Accuracy</th>
                  <th style={thSt}>Interactions</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const data = compMap[r.party];
                const isSelected = selected === r.party;
                return (
                  <tr
                    key={r.party}
                    onClick={() => setSelected(isSelected ? null : r.party)}
                    style={{ cursor: 'pointer', background: isSelected ? '#f0f6ff' : 'transparent' }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f7f7f7'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={tdSt}><span style={{ color: '#aaa' }}>{i + 1}</span></td>
                    <td style={tdSt}>
                      <div style={{ fontWeight: 500 }}>{typeof r.party === 'string' ? r.party.split('::')[0] : r.party}</div>
                      <div className="party">{r.party}</div>
                    </td>
                    <td style={tdSt}><Tag>{r.roleType || '—'}</Tag></td>
                    <td style={tdSt}>
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#1a6abf' }}>
                          {r.overallScore?.toFixed(1) ?? '—'}
                        </span>
                      </div>
                      {typeof r.overallScore === 'number' && (
                        <ScoreBar value={r.overallScore / 100} height={3} />
                      )}
                    </td>
                    {hasCompData && <>
                      {COMP_IDS.map((id, ci) => {
                        const val = data?.comps?.[id] ?? null;
                        return (
                          <td key={id} style={{ ...tdSt, minWidth: 100 }}>
                            {val !== null ? (
                              <>
                                <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>{(val * 100).toFixed(0)}%</div>
                                <ScoreBar value={val} color={COMP_COLORS[ci]} />
                              </>
                            ) : <span className="muted">—</span>}
                          </td>
                        );
                      })}
                      <td style={{ ...tdSt, color: '#888' }}>{data?.interactions ?? '—'}</td>
                    </>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <SubjectPanel party={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
