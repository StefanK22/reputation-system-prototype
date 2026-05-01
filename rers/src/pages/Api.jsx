import { useState } from 'react';
import { getRankings, getSubject } from '../api/reputation.js';

function ApiCard({ title, params, onCall }) {
  const [values,  setValues]  = useState(() => Object.fromEntries(params.map(p => [p.name, p.default ?? ''])));
  const [busy,    setBusy]    = useState(false);
  const [result,  setResult]  = useState(null);

  function set(name, value) {
    setValues(prev => ({ ...prev, [name]: value }));
  }

  async function call() {
    setBusy(true);
    setResult(null);
    try {
      const data = await onCall(values);
      setResult({ ok: true, data });
    } catch (e) {
      setResult({ ok: false, error: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="contract-card">
      <h2>{title}</h2>
      {params.map(p => (
        <div className="form-row" key={p.name}>
          <label>{p.label}</label>
          <input
            value={values[p.name]}
            onChange={e => set(p.name, e.target.value)}
            placeholder={p.placeholder ?? ''}
            type={p.type ?? 'text'}
          />
        </div>
      ))}
      <button className="primary" disabled={busy} onClick={call}>
        {busy ? 'Loading...' : 'Call'}
      </button>
      {result && (
        result.ok
          ? <pre style={{ marginTop: 12, fontSize: 11, overflowX: 'auto', background: 'var(--bg-subtle, #f8f8f8)', padding: 10, borderRadius: 4 }}>
              {JSON.stringify(result.data, null, 2)}
            </pre>
          : <p className="error" style={{ marginTop: 10 }}>{result.error}</p>
      )}
    </div>
  );
}

export default function Api() {
  return (
    <>
      <h1>API</h1>
      <div className="contracts-grid">

        <ApiCard
          title="GET /rankings"
          params={[{ name: 'limit', label: 'Limit', type: 'number', default: 10, placeholder: '10' }]}
          onCall={({ limit }) => getRankings(Number(limit) || 10)}
        />

        <ApiCard
          title="GET /reputation/:party"
          params={[{ name: 'party', label: 'Party', placeholder: 'Party ID' }]}
          onCall={({ party }) => {
            if (!party.trim()) throw new Error('Party is required.');
            return getSubject(party.trim());
          }}
        />

      </div>
    </>
  );
}
