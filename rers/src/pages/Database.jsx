import { useState, useEffect } from 'react';
import { useLedger } from '../LedgerContext.jsx';
import { getAllSubjects } from '../api/reputation.js';

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function shortId(id) {
  if (!id) return '—';
  return id.length > 16 ? id.substring(0, 16) + '…' : id;
}

function ComponentsTable({ components }) {
  if (!components?.length) return <p className="muted">No components yet.</p>;
  return (
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
        {components.map((c) => (
          <tr key={c.id}>
            <td>{c.componentId}</td>
            <td className="muted">{c.weight}</td>
            <td>{c.count > 0 ? c.score.toFixed(2) : '—'}</td>
            <td className="muted">{c.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Database() {
  const ledger = useLedger();
  const [subjects, setSubjects] = useState([]);
  const [expanded, setExpanded] = useState(new Set());
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    getAllSubjects()
      .then((s) => setSubjects(s ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [ledger]);

  function toggleExpand(party) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(party) ? next.delete(party) : next.add(party);
      return next;
    });
  }

  if (loading) return <p className="muted">Loading...</p>;
  if (error)   return <p className="error">{error}</p>;

  return (
    <>
      <h1>Database</h1>

      <h2>Subjects ({subjects.length})</h2>
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Party</th>
            <th>Role</th>
            <th>Score</th>
            <th>Components</th>
            <th>Contract ID</th>
            <th>Config Contract ID</th>
            <th>Created</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((s) => (
            <>
              <tr key={s.party}>
                <td>
                  <button onClick={() => toggleExpand(s.party)}>
                    {expanded.has(s.party) ? '▼' : '▶'}
                  </button>
                </td>
                <td>
                  <div>{s.party.split('::')[0]}</div>
                  <div className="party">{s.party}</div>
                </td>
                <td><span className="tag">{s.roleType || '—'}</span></td>
                <td>{typeof s.overallScore === 'number' ? s.overallScore.toFixed(2) : '—'}</td>
                <td className="muted">{s.components?.length ?? 0}</td>
                <td className="party" title={s.contractId}>{shortId(s.contractId)}</td>
                <td className="party" title={s.configContractId}>{shortId(s.configContractId)}</td>
                <td className="muted">{fmt(s.createdAt)}</td>
                <td className="muted">{fmt(s.updatedAt)}</td>
              </tr>
              {expanded.has(s.party) && (
                <tr key={s.party + '-components'}>
                  <td colSpan={9} style={{ paddingLeft: 32, background: 'var(--bg-subtle, #f8f8f8)' }}>
                    <ComponentsTable components={s.components} />
                  </td>
                </tr>
              )}
            </>
          ))}
          {!subjects.length && (
            <tr><td colSpan={9} className="muted">No subjects.</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}
