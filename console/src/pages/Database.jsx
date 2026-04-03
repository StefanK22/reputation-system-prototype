import { useState, useEffect } from 'react';
import { useLedger } from '../LedgerContext.jsx';
import { getRankings, getConfig } from '../api/reputation.js';

export default function Database() {
  const ledger = useLedger();
  const [tab, setTab]         = useState('subjects');
  const [subjects, setSubjects] = useState([]);
  const [config, setConfig]   = useState(null);
  const [tokens, setTokens]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    Promise.all([
      getRankings(100),
      getConfig(),
      ledger.queryAll().then((cs) => cs.filter((c) => c.templateId === 'ReputationToken')),
    ])
      .then(([s, c, t]) => { setSubjects(s); setConfig(c); setTokens(t); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [ledger]);

  if (loading) return <p className="muted">Loading...</p>;
  if (error)   return <p className="error">{error}</p>;

  return (
    <>
      <h1>Database</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['subjects', 'config', 'tokens'].map((t) => (
          <button key={t} className={tab === t ? 'primary' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'subjects' && (
        <>
          <h2>Subjects ({subjects.length})</h2>
          <table>
            <thead>
              <tr><th>Party</th><th>Role</th><th>Score</th><th>Components</th></tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.party}>
                  <td>
                    <div>{s.party.split('::')[0]}</div>
                    <div className="party">{s.party}</div>
                  </td>
                  <td><span className="tag">{s.roleId || '—'}</span></td>
                  <td>{typeof s.overallScore === 'number' ? s.overallScore.toFixed(2) : '—'}</td>
                  <td className="muted">{Object.keys(s.components || {}).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {tab === 'config' && (
        <>
          <h2>Active Configuration</h2>
          {config
            ? <pre>{JSON.stringify(config, null, 2)}</pre>
            : <p className="muted">No active config.</p>
          }
        </>
      )}

      {tab === 'tokens' && (
        <>
          <h2>Reputation Tokens ({tokens.length})</h2>
          <table>
            <thead>
              <tr><th>Owner</th><th>Score</th><th>Contract ID</th></tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.contractId}>
                  <td>{t.payload?.owner || '—'}</td>
                  <td>{t.payload?.score ?? '—'}</td>
                  <td className="party">{t.contractId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
