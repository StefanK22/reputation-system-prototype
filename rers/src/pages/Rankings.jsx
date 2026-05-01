import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRankings } from '../api/reputation.js';

export default function Rankings() {
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getRankings(50)
      .then(setRankings)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="muted">Loading...</p>;
  if (error)   return <p className="error">{error}</p>;

  return (
    <>
      <h1>Rankings</h1>
      {rankings.length === 0 ? (
        <p className="muted">No subjects found.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Party</th>
              <th>Role</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((r, i) => (
              <tr key={r.party} onClick={() => navigate(`/subject/${encodeURIComponent(r.party)}`)}>
                <td className="muted">{i + 1}</td>
                <td>
                  <div>{r.party.split('::')[0]}</div>
                  <div className="party">{r.party}</div>
                </td>
                <td><span className="tag">{r.roleType || '—'}</span></td>
                <td className="score">{r.overallScore?.toFixed(1) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
