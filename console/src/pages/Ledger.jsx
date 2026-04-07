import { useState, useEffect } from 'react';
import { useLedger } from '../LedgerContext.jsx';

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function PartyList({ items }) {
  if (!items?.length) return <span className="muted">—</span>;
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {items.map((p) => <li key={p} className="party">{p}</li>)}
    </ul>
  );
}

function ContractDetail({ c }) {
  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      <section>
        <h4 style={{ margin: '0 0 8px' }}>CONTRACT INFO</h4>
        <table style={{ width: 'auto' }}>
          <tbody>
            <tr><td style={{ paddingRight: 24, color: '#666', whiteSpace: 'nowrap' }}>Template</td><td className="party">{c.rawTemplateId}</td></tr>
            <tr><td style={{ paddingRight: 24, color: '#666', whiteSpace: 'nowrap' }}>Contract ID</td><td className="party">{c.contractId}</td></tr>
            <tr><td style={{ paddingRight: 24, color: '#666', whiteSpace: 'nowrap' }}>Created At</td><td>{fmt(c.createdAt)}</td></tr>
            <tr><td style={{ paddingRight: 24, color: '#666', whiteSpace: 'nowrap' }}>Offset</td><td>{c.offset ?? '—'}</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h4 style={{ margin: '0 0 8px' }}>SIGNATORIES</h4>
        <PartyList items={c.signatories} />
      </section>

      <section>
        <h4 style={{ margin: '0 0 8px' }}>OBSERVERS</h4>
        <PartyList items={c.observers} />
      </section>

      <section>
        <h4 style={{ margin: '0 0 8px' }}>PAYLOAD (JSON)</h4>
        <pre style={{ margin: 0 }}>{JSON.stringify(c.payload, null, 2)}</pre>
      </section>

      <section>
        <h4 style={{ margin: '0 0 8px' }}>FULL CONTRACT (JSON)</h4>
        <pre style={{ margin: 0 }}>{JSON.stringify(c.raw, null, 2)}</pre>
      </section>

    </div>
  );
}

export default function Ledger() {
  const ledger = useLedger();
  const [tab, setTab]           = useState('contracts');
  const [parties, setParties]   = useState([]);
  const [contracts, setContracts] = useState([]);
  const [offset, setOffset]     = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [{ parties: ps }, cs, off] = await Promise.all([
        ledger.listAllParties(),
        ledger.queryAll(),
        ledger.ledgerEnd(),
      ]);
      setParties(ps);
      setContracts(cs);
      setOffset(off);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [ledger]);

  function toggleExpand(contractId) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(contractId) ? next.delete(contractId) : next.add(contractId);
      return next;
    });
  }

  if (loading) return <p className="muted">Loading...</p>;
  if (error)   return <p className="error">{error}</p>;

  return (
    <>
      <h1>Ledger</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['contracts', 'parties'].map((t) => (
            <button key={t} className={tab === t ? 'primary' : ''} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
        <button onClick={load}>Refresh</button>
        <span className="muted" style={{ marginLeft: 'auto' }}>Offset: {offset ?? '—'}</span>
      </div>

      {tab === 'contracts' && (
        <>
          <h2>Active Contracts ({contracts.length})</h2>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Template</th>
                <th>Contract ID</th>
                <th>Created At</th>
                <th>Offset</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <>
                  <tr key={c.contractId}>
                    <td>
                      <button onClick={() => toggleExpand(c.contractId)}>
                        {expanded.has(c.contractId) ? '▼' : '▶'}
                      </button>
                    </td>
                    <td><span className="tag">{c.templateId}</span></td>
                    <td className="party">{c.contractId}</td>
                    <td className="muted">{fmt(c.createdAt)}</td>
                    <td className="muted">{c.offset ?? '—'}</td>
                  </tr>
                  {expanded.has(c.contractId) && (
                    <tr key={c.contractId + '-detail'}>
                      <td colSpan={5} style={{ background: 'var(--bg-subtle, #f8f8f8)', padding: 0 }}>
                        <ContractDetail c={c} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </>
      )}

      {tab === 'parties' && (
        <>
          <h2>Parties ({parties.length})</h2>
          <table>
            <thead>
              <tr><th>Display Name</th><th>Party ID</th><th>Local</th></tr>
            </thead>
            <tbody>
              {parties.map((p) => (
                <tr key={p.party}>
                  <td>{p.displayName}</td>
                  <td className="party">{p.party}</td>
                  <td className="muted">{p.isLocal ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
