import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getSubject } from '../api/reputation.js';

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

  const displayName = subject.party.split('::')[0];

  return (
    <>
      <h1>{displayName}</h1>
      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">Score</div>
          <div className="stat-value">{subject.overallScore?.toFixed(1) ?? '—'}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Role</div>
          <div className="stat-value">{subject.roleType || '—'}</div>
        </div>
      </div>
      <div className="party" style={{ marginBottom: 20 }}>{subject.party}</div>

      <h2>Components</h2>
      {!(subject.components?.length) ? (
        <p className="muted">No components.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Component</th>
              <th>Weight</th>
              <th>Score</th>
              <th>Observations</th>
            </tr>
          </thead>
          <tbody>
            {subject.components.map((c) => (
              <tr key={c.componentId}>
                <td>{c.componentId}</td>
                <td className="muted">{typeof c.weight === 'number' ? c.weight.toFixed(2) : '—'}</td>
                <td>{typeof c.score === 'number' ? c.score.toFixed(3) : '—'}</td>
                <td className="muted">{c.count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
