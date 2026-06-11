import { useState, useEffect, useCallback } from 'react';
import { useLedger, usePartyCtx } from '../LedgerContext.jsx';
import { KNOWN_MODULE_PATHS } from '../api/contracts.js';
import { getInterfaceIds } from '../api/reputation.js';

const CONFIG_TYPES = [
  { value: 'RoleConfig',             label: 'Role Config'              },
  { value: 'PropertyPurchaseConfig', label: 'Property Purchase Config'  },
  { value: 'RentalAgreementConfig',  label: 'Rental Agreement Config'   },
];

const tdSt = { padding: '8px 12px', borderBottom: '1px solid #f0f0f0', color: '#333', verticalAlign: 'top' };
const thSt = { padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #eee', color: '#999', fontWeight: 'normal', fontSize: 11, textTransform: 'uppercase' };

async function resolveTemplateIds() {
  const interfaceIds = await getInterfaceIds().catch(() => ({}));
  const pkgId = Object.values(interfaceIds)[0]?.split(':')[0];
  if (!pkgId) throw new Error('Could not resolve package ID from backend.');
  const map = {};
  for (const [key, modEntity] of Object.entries(KNOWN_MODULE_PATHS)) {
    map[key] = `${pkgId}:${modEntity}`;
  }
  return map;
}

function fmt(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

function DetailCell({ contractId, payload }) {
  const data = { contractId, ...payload };
  return (
    <details>
      <summary style={{ fontSize: 11, color: '#555', cursor: 'pointer' }}>show</summary>
      <pre style={{ fontSize: 10, color: '#777', margin: '6px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#f5f5f5', padding: 8, borderRadius: 3 }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}

export default function Disclosures() {
  const ledger                        = useLedger();
  const { activeParty }               = usePartyCtx();
  const [tids,        setTids]        = useState(null);
  const [tidError,    setTidError]    = useState(null);
  const [configType,  setConfigType]  = useState('RoleConfig');
  const [submitting,  setSubmitting]  = useState(false);
  const [status,      setStatus]      = useState(null);
  const [disclosures, setDisclosures] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [loadError,   setLoadError]   = useState(null);

  useEffect(() => {
    resolveTemplateIds()
      .then(setTids)
      .catch(e => setTidError(e.message));
  }, []);

  const loadDisclosures = useCallback(async () => {
    if (!activeParty || !tids) return;
    setLoading(true);
    setLoadError(null);
    try {
      const contracts = await ledger.queryAsParty(activeParty, tids.ConfigurationDisclosure);
      setDisclosures(contracts.sort((a, b) => (b.payload?.issuedAt ?? '') > (a.payload?.issuedAt ?? '') ? 1 : -1));
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, [ledger, activeParty, tids]);

  useEffect(() => { loadDisclosures(); }, [loadDisclosures]);

  async function submitRequest() {
    if (!activeParty || !tids) return;
    setSubmitting(true);
    setStatus(null);
    try {
      await ledger.create(tids.DisclosureRequest, {
        requester:   activeParty,
        operator:    ledger.party,
        configType:  configType,
        requestedAt: new Date().toISOString(),
      }, { actAs: [activeParty] });
      setStatus({ ok: true, msg: 'Request submitted' });
      setTimeout(() => loadDisclosures(), 3000);
    } catch (e) {
      setStatus({ ok: false, msg: e.message });
    } finally {
      setSubmitting(false);
    }
  }

  if (!activeParty) {
    return (
      <div className="page-scroll" style={{ padding: 24 }}>
        <h1>Disclosures</h1>
        <p className="muted">Select a party in the top bar to request or view disclosures.</p>
      </div>
    );
  }

  return (
    <div className="page-scroll" style={{ padding: 24 }}>
      <h1>Disclosures</h1>

      {tidError && <p className="error" style={{ marginBottom: 16 }}>Template resolution failed: {tidError}</p>}

      {/* ── Request form ─────────────────────────────────────────────────── */}
      <div style={{ background: '#f9f9f9', border: '1px solid #e8e8e8', borderRadius: 6, padding: 16, marginBottom: 28, maxWidth: 500 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#333', marginBottom: 12 }}>
          Request a Configuration Disclosure
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={configType}
            onChange={e => setConfigType(e.target.value)}
            disabled={submitting || !tids}
            style={{ fontSize: 12, fontFamily: 'inherit', padding: '5px 10px', border: '1px solid #ddd', borderRadius: 3, background: '#fff', flex: 1 }}
          >
            {CONFIG_TYPES.map(ct => (
              <option key={ct.value} value={ct.value}>{ct.label}</option>
            ))}
          </select>
          <button onClick={submitRequest} disabled={submitting || !tids}>
            {submitting ? 'Requesting…' : 'Request Disclosure'}
          </button>
        </div>
        {status && (
          <div style={{ marginTop: 10, fontSize: 11, color: status.ok ? '#2a7a6a' : '#c0392b' }}>
            {status.msg}
          </div>
        )}
      </div>

      {/* ── Disclosures table ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#333' }}>Your Disclosures</div>
        <button onClick={loadDisclosures} disabled={loading}>Refresh</button>
      </div>

      {loadError && <p className="error">{loadError}</p>}
      {loading   && <p className="muted">Loading…</p>}

      {!loading && disclosures.length === 0 && !loadError && (
        <p className="muted">No disclosures yet.</p>
      )}

      {!loading && disclosures.length > 0 && (
        <table>
          <thead>
            <tr>
              <th style={thSt}>Config ID</th>
              <th style={thSt}>Issued At</th>
              <th style={thSt}>Source Created At</th>
              <th style={thSt}>Details</th>
            </tr>
          </thead>
          <tbody>
            {disclosures.map(d => (
              <tr key={d.contractId}>
                <td style={tdSt}>{d.payload?.configId || '—'}</td>
                <td style={{ ...tdSt, whiteSpace: 'nowrap' }}>{fmt(d.payload?.issuedAt)}</td>
                <td style={{ ...tdSt, whiteSpace: 'nowrap' }}>{fmt(d.payload?.createdAt)}</td>
                <td style={tdSt}><DetailCell contractId={d.contractId} payload={d.payload} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
