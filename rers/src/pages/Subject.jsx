import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getSubject } from '../api/reputation.js';
import { Tag, ScoreGauge, ScoreBar } from '../components/shared.jsx';

const COMP_COLORS = ['#1a6abf', '#7a5abf', '#2a7a6a'];

export default function Subject() {
  const { party }              = useParams();
  const [subject, setSubject]  = useState(null);
  const [loading, setLoading]  = useState(true);
  const [error, setError]      = useState(null);

  useEffect(() => {
    getSubject(decodeURIComponent(party))
      .then(setSubject)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [party]);

  if (loading)  return <p className="muted">Loading...</p>;
  if (error)    return <p className="error">{error}</p>;
  if (!subject) return <p className="muted">Not found.</p>;

  const displayName = typeof subject.party === 'string' ? subject.party.split('::')[0] : String(subject.party ?? '');

  return (
    <>
      <h1>{displayName}</h1>
      <div style={{ fontSize: 11, color: '#bbb', marginBottom: 20, wordBreak: 'break-all' }}>{subject.party}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <ScoreGauge score={subject.overallScore ?? 0} size={64} />
        <div>
          <Tag>{subject.roleType || '—'}</Tag>
          <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>Overall score</div>
        </div>
      </div>

      {subject.components?.length > 0 && (
        <>
          <h2>Components</h2>
          <div style={{ maxWidth: 480 }}>
            {subject.components.map((c, i) => (
              <div key={c.componentId} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: '#555' }}>{c.componentId}</span>
                  <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#888' }}>
                    <span>weight {typeof c.weight === 'number' ? c.weight.toFixed(2) : '—'}</span>
                    <span style={{ color: '#333', fontWeight: 600 }}>
                      {typeof c.score === 'number' ? (c.score * 100).toFixed(1) : '—'}
                    </span>
                    <span>{c.count ?? 0} obs</span>
                  </div>
                </div>
                <ScoreBar value={c.score ?? 0} color={COMP_COLORS[i % COMP_COLORS.length]} height={6} />
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
