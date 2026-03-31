import { useState, useEffect } from 'react';
import { useLedger } from '../LedgerContext.jsx';
import { getSubject, requestVC } from '../api/reputation.js';

export default function Credentials() {
  const ledger = useLedger();
  const [parties, setParties]     = useState([]);
  const [party, setParty]         = useState('');
  const [subject, setSubject]     = useState(null);
  const [disclosed, setDisclosed] = useState([]);
  const [vc, setVc]               = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  useEffect(() => {
    ledger.listAllParties()
      .then(({ parties: ps }) => setParties(ps))
      .catch(() => {});
  }, [ledger]);

  async function handlePartyChange(p) {
    setParty(p);
    setSubject(null);
    setDisclosed([]);
    setVc(null);
    setError(null);
    if (!p) return;
    try {
      setSubject(await getSubject(p));
    } catch (e) {
      setError(e.message);
    }
  }

  function toggleComponent(id) {
    setDisclosed((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleIssue() {
    setLoading(true);
    setVc(null);
    setError(null);
    try {
      setVc(await requestVC(party, disclosed));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1>Issue Verifiable Credential</h1>

      <div className="form-row">
        <label>Party</label>
        <select value={party} onChange={(e) => handlePartyChange(e.target.value)}>
          <option value="">— select party —</option>
          {parties.map((p) => (
            <option key={p.party} value={p.party}>{p.displayName}</option>
          ))}
        </select>
      </div>

      {error && <p className="error">{error}</p>}

      {subject && (
        <>
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

          <h2>Components to disclose (empty = all)</h2>
          <table>
            <thead>
              <tr><th>Disclose</th><th>Component</th><th>Value</th></tr>
            </thead>
            <tbody>
              {Object.entries(subject.components || {}).map(([id, c]) => (
                <tr key={id} onClick={() => toggleComponent(id)} style={{ cursor: 'pointer' }}>
                  <td>
                    <input
                      type="checkbox"
                      checked={disclosed.includes(id)}
                      onChange={() => toggleComponent(id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td>{id}</td>
                  <td>{typeof c.value === 'number' ? c.value.toFixed(2) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <button className="primary" onClick={handleIssue} disabled={loading}>
            {loading ? 'Issuing...' : 'Issue VC'}
          </button>
        </>
      )}

      {vc && (
        <>
          <p className="success">Credential issued.</p>
          <pre>{JSON.stringify(vc, null, 2)}</pre>
        </>
      )}
    </>
  );
}
