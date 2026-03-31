import { useState, useEffect } from 'react';
import { useLedger } from '../LedgerContext.jsx';

export default function Ledger() {
  const ledger = useLedger();
  const [state, setState]         = useState(null);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [ledgerState, allContracts, offset] = await Promise.all([
        ledger.getFullLedgerState(),
        ledger.queryAll(),
        ledger.ledgerEnd(),
      ]);
      setState({ ...ledgerState, offset });
      setContracts(allContracts);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [ledger]);

  if (loading) return <p className="muted">Loading...</p>;
  if (error)   return <p className="error">{error}</p>;

  return (
    <>
      <h1>Ledger</h1>
      <div style={{ marginBottom: 20 }}>
        <button onClick={load}>Refresh</button>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">Offset</div>
          <div className="stat-value">{state?.offset ?? '—'}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Parties</div>
          <div className="stat-value">{state?.parties?.length ?? 0}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Packages</div>
          <div className="stat-value">{state?.packages?.length ?? 0}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Active Contracts</div>
          <div className="stat-value">{contracts.length}</div>
        </div>
      </div>

      <h2>Parties</h2>
      <table>
        <thead>
          <tr><th>Display Name</th><th>Party ID</th><th>Local</th></tr>
        </thead>
        <tbody>
          {state?.parties?.map((p) => (
            <tr key={p.party}>
              <td>{p.displayName}</td>
              <td className="party">{p.party}</td>
              <td className="muted">{p.isLocal ? 'yes' : 'no'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Active Contracts ({contracts.length})</h2>
      <table>
        <thead>
          <tr><th>Template</th><th>Contract ID</th><th>Signatories</th></tr>
        </thead>
        <tbody>
          {contracts.map((c) => (
            <tr key={c.contractId}>w
              <td><span className="tag">{c.templateId}</span></td>
              <td className="party">{c.contractId}</td>
              <td className="muted">{c.signatories?.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
