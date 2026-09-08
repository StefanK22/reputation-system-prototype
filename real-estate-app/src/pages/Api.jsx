import { useState } from 'react';
import { getRankings, getSubject, getTiers, issueVc, verifyVc } from '../api/reputation.js';

function formatResult(data) {
  if (typeof data !== 'string') return JSON.stringify(data, null, 2);
  try {
    return JSON.stringify(JSON.parse(data), null, 2);
  } catch {
    return data;
  }
}

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
          ? <pre style={{ marginTop: 12, fontSize: 11, overflowX: 'auto', background: 'var(--bg-subtle, #f8f8f8)', padding: 10, borderRadius: 4, whiteSpace: 'pre-wrap' }}>
              {formatResult(result.data)}
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
          onCall={({ limit }) => getRankings().then(rows => rows.slice(0, Number(limit) || 10))}
        />

        <ApiCard
          title="GET /reputation/:party"
          params={[{ name: 'party', label: 'Party', placeholder: 'Party ID' }]}
          onCall={({ party }) => {
            if (!party.trim()) throw new Error('Party is required.');
            return getSubject(party.trim());
          }}
        />

        <ApiCard
          title="GET /tiers"
          params={[]}
          onCall={() => getTiers()}
        />

        <ApiCard
          title="GET /vc/issue/:party"
          params={[{ name: 'party', label: 'Party', placeholder: 'Party ID' }]}
          onCall={({ party }) => {
            if (!party.trim()) throw new Error('Party is required.');
            return issueVc(party.trim());
          }}
        />

        <ApiCard
          title="GET /vc/verify"
          params={[
            { name: 'party', label: 'Party', placeholder: 'Party ID' },
            { name: 'tier', label: 'Tier', placeholder: 'Tier name' },
            { name: 'issuanceDate', label: 'Issuance Date', placeholder: 'issuanceDate from the VC' },
            { name: 'jws', label: 'JWS', placeholder: 'proof.jws from the VC' },
          ]}
          onCall={({ party, tier, issuanceDate, jws }) => {
            if (!party.trim() || !tier.trim() || !issuanceDate.trim() || !jws.trim()) {
              throw new Error('All fields are required.');
            }
            return verifyVc({ party: party.trim(), tier: tier.trim(), issuanceDate: issuanceDate.trim(), jws: jws.trim() });
          }}
        />

      </div>
    </>
  );
}
