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
          <div className="stat-value">{subject.roleId || '—'}</div>
        </div>
      </div>
      <div className="party" style={{ marginBottom: 20 }}>{subject.party}</div>

      <h2>Components</h2>
      {Object.keys(subject.components || {}).length === 0 ? (
        <p className="muted">No components.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Component</th>
              <th>Value</th>
              <th>Interactions</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(subject.components).map(([id, c]) => (
              <tr key={id}>
                <td>{id}</td>
                <td>{typeof c.value === 'number' ? c.value.toFixed(2) : '—'}</td>
                <td className="muted">{c.interactionCount ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
