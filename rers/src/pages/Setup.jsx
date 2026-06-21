import { useState, useEffect, useCallback } from 'react';
import { useLedger } from '../LedgerContext.jsx';
import { getInterfaceIds } from '../api/reputation.js';
import { resolveTemplateIds } from '../api/contracts.js';

// ── Shared primitives ─────────────────────────────────────────────────────────

const thSt = { padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid #eee', color: '#aaa', fontWeight: 'normal', fontSize: 10, textTransform: 'uppercase' };
const tdSt = { padding: '4px 8px', borderBottom: '1px solid #f5f5f5' };

function Dot({ on }) {
  return <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: on ? '#27ae60' : '#ddd', flexShrink: 0 }} />;
}

function NInput({ value, onChange, step = 0.1, width = 64 }) {
  const [display, setDisplay] = useState(String(value));
  useEffect(() => setDisplay(String(value)), [value]);
  return (
    <input
      type="number" step={step} value={display}
      style={{ width, padding: '4px 6px', fontSize: 12 }}
      onFocus={(e) => e.target.select()}
      onChange={(e) => { setDisplay(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n)) onChange(n); }}
      onBlur={() => { if (!Number.isFinite(parseFloat(display))) { setDisplay('0'); onChange(0); } }}
    />
  );
}

function Row({ label, children }) {
  return (
    <div className="form-row">
      <label>{label}</label>
      {children}
    </div>
  );
}

function CardResult({ result }) {
  if (!result) return null;
  return result.ok
    ? <p className="success" style={{ marginTop: 10, fontSize: 11, wordBreak: 'break-all' }}>Deployed — <span className="party">{result.contractId}</span></p>
    : <p className="error"   style={{ marginTop: 10, fontSize: 11 }}>{result.error}</p>;
}

function WeightSum({ values }) {
  const sum = values.reduce((a, b) => a + b, 0);
  const ok = Math.abs(sum - 1.0) < 0.001;
  return (
    <span style={{ fontSize: 11, color: ok ? '#27ae60' : '#e74c3c', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
      {sum.toFixed(2)} / 1.00
    </span>
  );
}

function SectionLabel({ children, sum }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#999', fontSize: 11, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 }}>
      <span>{children}</span>
      {sum && <WeightSum values={sum} />}
    </div>
  );
}

// ── Status strip ──────────────────────────────────────────────────────────────

const CONFIG_KEYS = ['RoleConfiguration', 'PropertyPurchaseConfiguration', 'RentalAgreementConfiguration'];
const CONFIG_LABELS = { RoleConfiguration: 'Roles', PropertyPurchaseConfiguration: 'PP', RentalAgreementConfiguration: 'RA' };

async function loadStatus(ledger, tids) {
  const results = {};
  await Promise.all(CONFIG_KEYS.map(async (key) => {
    try { results[key] = (await ledger.query(tids[key])).length > 0; }
    catch { results[key] = false; }
  }));
  return results;
}

// ── Role Configuration card (with inline Create Role) ─────────────────────────

const ROLE_TYPES_WEIGHTS = ['Agent', 'Buyer', 'Landlord', 'Tenant'];

function CreateRoleInline({ tids, ledger, parties, onDone }) {
  const [newName,     setNewName]     = useState('');
  const [partyId,     setPartyId]     = useState('');
  const [roleType,    setRoleType]    = useState('Agent');
  const [configCid,   setConfigCid]   = useState('');
  const [roleConfigs, setRoleConfigs] = useState([]);
  const [busy,        setBusy]        = useState(false);
  const [result,      setResult]      = useState(null);

  useEffect(() => {
    if (!tids.RoleConfiguration) return;
    ledger.query(tids.RoleConfiguration).then((cs) => {
      setRoleConfigs(cs);
      if (cs.length === 1) setConfigCid(cs[0].contractId);
    }).catch(() => {});
  }, [ledger, tids.RoleConfiguration]);

  async function create() {
    setBusy(true); setResult(null);
    try {
      let pid = partyId.trim();
      if (!pid && newName.trim()) {
        const res = await ledger.allocateParty(newName.trim());
        pid = res.partyDetails?.party || res.party;
        onDone();
      }
      if (!pid) throw new Error('Enter a new party name or select an existing party.');
      if (!configCid) throw new Error('Select a Role Configuration contract.');
      await ledger.exercise(configCid, tids.RoleConfiguration, 'CreateRole', {
        party: pid, roleType, assignedAt: new Date().toISOString(),
      });
      setResult({ ok: true, contractId: `${roleType} role created for ${pid.split('::')[0]}` });
      setNewName(''); setPartyId('');
    } catch (e) { setResult({ ok: false, error: e.message }); }
    finally { setBusy(false); }
  }

  const existingParties = parties.filter((p) => !p.party.startsWith('Operator'));

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #eee' }}>
      <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Create Role</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ color: '#999', fontSize: 11, textTransform: 'uppercase', marginBottom: 5 }}>New party name</div>
          <input
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setPartyId(''); }}
            placeholder="e.g. AgentAlice"
          />
        </div>
        <div>
          <div style={{ color: '#999', fontSize: 11, textTransform: 'uppercase', marginBottom: 5 }}>Or existing party</div>
          <select value={partyId} onChange={(e) => { setPartyId(e.target.value); setNewName(''); }}>
            <option value="">— select —</option>
            {existingParties.map((p) => (
              <option key={p.party} value={p.party}>{p.displayName || p.party.split('::')[0]}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: roleConfigs.length > 1 ? '1fr 1fr auto' : '1fr auto', gap: 10, alignItems: 'end' }}>
        <div>
          <div style={{ color: '#999', fontSize: 11, textTransform: 'uppercase', marginBottom: 5 }}>Role</div>
          <select value={roleType} onChange={(e) => setRoleType(e.target.value)}>
            {ROLE_TYPES_WEIGHTS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {roleConfigs.length > 1 && (
          <div>
            <div style={{ color: '#999', fontSize: 11, textTransform: 'uppercase', marginBottom: 5 }}>Config</div>
            <select value={configCid} onChange={(e) => setConfigCid(e.target.value)}>
              <option value="">— select —</option>
              {roleConfigs.map((c) => (
                <option key={c.contractId} value={c.contractId}>{c.payload?.configId || c.contractId.slice(0, 14) + '…'}</option>
              ))}
            </select>
          </div>
        )}
        <button className="primary" disabled={busy || result} onClick={create} style={{ whiteSpace: 'nowrap' }}>
          {busy ? 'Creating…' : 'Create Role'}
        </button>
      </div>
      <CardResult result={result} />
    </div>
  );
}

function RoleConfigCard({ tids, ledger, deployed, parties, onDone }) {
  const dflt = () => ({ reliability: 0.5, responsiveness: 0.3, accuracy: 0.2 });
  const [configId,   setConfigId]   = useState('ROLE-CONFIG-001');
  const [floor,      setFloor]      = useState(0);
  const [ceiling,    setCeiling]    = useState(100);
  const [startValue, setStartValue] = useState(70);
  const [weights,    setWeights]    = useState({ Agent: dflt(), Buyer: dflt(), Landlord: dflt(), Tenant: dflt() });
  const [tiers,      setTiers]      = useState([{ name: 'Bronze', value: 0 }, { name: 'Silver', value: 50 }, { name: 'Gold', value: 80 }]);
  const [busy,       setBusy]       = useState(false);
  const [result,     setResult]     = useState(null);

  const setW = (role, field, val) =>
    setWeights((prev) => ({ ...prev, [role]: { ...prev[role], [field]: val } }));

  const setTier = (i, field, val) =>
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, [field]: val } : t)));
  const addTier = () => setTiers((prev) => [...prev, { name: '', value: 0 }]);
  const removeTier = (i) => setTiers((prev) => prev.filter((_, idx) => idx !== i));

  const toStr = (w) => ({ reliability: String(w.reliability), responsiveness: String(w.responsiveness), accuracy: String(w.accuracy) });

  async function deploy() {
    setBusy(true); setResult(null);
    try {
      const ev = await ledger.create(tids.RoleConfiguration, {
        operator: ledger.party, configId: configId.trim(), createdAt: new Date().toISOString(),
        agentWeights:    toStr(weights.Agent),
        buyerWeights:    toStr(weights.Buyer),
        landlordWeights: toStr(weights.Landlord),
        tenantWeights:   toStr(weights.Tenant),
        scoreFloor:  String(floor),
        scoreCeiling: String(ceiling),
        startValue:  String(startValue),
        tiers: tiers.filter((t) => t.name.trim()).map((t) => ({ _1: t.name.trim(), _2: String(t.value) })),
      });
      setResult({ ok: true, contractId: ev.contractId });
      onDone();
    } catch (e) { setResult({ ok: false, error: e.message }); }
    finally { setBusy(false); }
  }

  const showCreateRole = deployed || result?.ok;

  return (
    <div className="contract-card">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 16 }}>
        <Dot on={deployed} /> Role Configuration
      </h2>
      <Row label="Config ID"><input value={configId} onChange={(e) => setConfigId(e.target.value)} /></Row>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#999', fontSize: 11, textTransform: 'uppercase', marginBottom: 6 }}>Floor</div>
          <NInput value={floor} onChange={setFloor} step={1} width="100%" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#999', fontSize: 11, textTransform: 'uppercase', marginBottom: 6 }}>Ceiling</div>
          <NInput value={ceiling} onChange={setCeiling} step={1} width="100%" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#999', fontSize: 11, textTransform: 'uppercase', marginBottom: 6 }}>Start value</div>
          <NInput value={startValue} onChange={setStartValue} step={1} width="100%" />
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thSt}></th>
              <th style={thSt}>Reliability</th>
              <th style={thSt}>Responsiveness</th>
              <th style={thSt}>Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {ROLE_TYPES_WEIGHTS.map((role) => (
              <tr key={role}>
                <td style={{ ...tdSt, fontSize: 12, color: '#555', whiteSpace: 'nowrap' }}>{role}</td>
                <td style={tdSt}><NInput value={weights[role].reliability}    onChange={(v) => setW(role, 'reliability',    v)} step={0.05} width={56} /></td>
                <td style={tdSt}><NInput value={weights[role].responsiveness} onChange={(v) => setW(role, 'responsiveness', v)} step={0.05} width={56} /></td>
                <td style={tdSt}><NInput value={weights[role].accuracy}       onChange={(v) => setW(role, 'accuracy',       v)} step={0.05} width={56} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SectionLabel>Tiers</SectionLabel>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
        <tbody>
          {tiers.map((t, i) => (
            <tr key={i}>
              <td style={tdSt}>
                <input value={t.name} onChange={(e) => setTier(i, 'name', e.target.value)} placeholder="Tier name" style={{ width: '100%' }} />
              </td>
              <td style={tdSt}><NInput value={t.value} onChange={(v) => setTier(i, 'value', v)} step={1} width={80} /></td>
              <td style={tdSt}>
                <button type="button" onClick={() => removeTier(i)} style={{ fontSize: 11 }}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={addTier} style={{ fontSize: 11, marginBottom: 14 }}>+ Add tier</button>

      <button className="primary" disabled={busy || result} onClick={deploy}>{busy ? 'Deploying…' : 'Deploy'}</button>
      <CardResult result={result} />

      {showCreateRole && (
        <CreateRoleInline tids={tids} ledger={ledger} parties={parties} onDone={onDone} />
      )}
    </div>
  );
}

// ── PP Configuration card ─────────────────────────────────────────────────────

function PPConfigCard({ tids, ledger, deployed, onDone }) {
  const [configId,  setConfigId]  = useState('PP-CONFIG-001');
  const [fbDays,    setFbDays]    = useState(30);
  // Agent reliability weights (must sum to 1.0)
  const [aRelVoided, setARelVoided] = useState(0.3);
  const [aRelCompl,  setARelCompl]  = useState(0.7);
  // Agent responsiveness weights (must sum to 1.0)
  const [aRespP2C,  setARespP2C]  = useState(0.6);
  const [aRespCont, setARespCont] = useState(0.4);
  const [aCapHours, setACapHours] = useState(24);
  // Buyer responsiveness weights (must sum to 1.0)
  const [bRespCont, setBRespCont] = useState(0.6);
  const [bRespProp, setBRespProp] = useState(0.4);
  const [bCapHours, setBCapHours] = useState(24);
  const [busy,   setBusy]   = useState(false);
  const [result, setResult] = useState(null);

  async function deploy() {
    setBusy(true); setResult(null);
    try {
      const ev = await ledger.create(tids.PropertyPurchaseConfiguration, {
        operator: ledger.party, configId: configId.trim(), createdAt: new Date().toISOString(),
        agentObsWeights: {
          reliabilityVoidedWeight:               String(aRelVoided),
          reliabilityCompletionWeight:            String(aRelCompl),
          responsivenessProposalToContractWeight: String(aRespP2C),
          responsivenessContractWeight:           String(aRespCont),
          responsivenessCapHours:                 String(aCapHours),
        },
        buyerObsWeights: {
          responsivenessContractWeight: String(bRespCont),
          responsivenessProposalWeight: String(bRespProp),
          responsivenessCapHours:       String(bCapHours),
        },
        feedbackWindowDays: fbDays,
      });
      setResult({ ok: true, contractId: ev.contractId });
      onDone();
    } catch (e) { setResult({ ok: false, error: e.message }); }
    finally { setBusy(false); }
  }

  return (
    <div className="contract-card">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 16 }}>
        <Dot on={deployed} /> Property Purchase Config
      </h2>
      <Row label="Config ID"><input value={configId} onChange={(e) => setConfigId(e.target.value)} /></Row>
      <Row label="Feedback window (days)">
        <input type="number" value={fbDays} onChange={(e) => setFbDays(parseInt(e.target.value) || 30)} />
      </Row>

      <div style={{ marginTop: 18, paddingLeft: 10, borderLeft: '3px solid #4a7fcb', marginBottom: 2 }}>
        <div style={{ color: '#4a7fcb', fontSize: 12, fontWeight: 700, letterSpacing: '0.02em' }}>Agent</div>
        <div style={{ color: '#aaa', fontSize: 10, textTransform: 'uppercase' }}>represents the selling agent</div>
      </div>

      <SectionLabel sum={[aRelVoided, aRelCompl]}>Reliability</SectionLabel>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ ...tdSt, fontSize: 12, color: '#666' }}>Deal closed successfully</td>
            <td style={tdSt}><NInput value={aRelCompl}  onChange={setARelCompl}  step={0.05} width={64} /></td>
          </tr>
          <tr>
            <td style={{ ...tdSt, fontSize: 12, color: '#666' }}>Did not void contracts</td>
            <td style={tdSt}><NInput value={aRelVoided} onChange={setARelVoided} step={0.05} width={64} /></td>
          </tr>
        </tbody>
      </table>

      <SectionLabel sum={[aRespP2C, aRespCont]}>Responsiveness</SectionLabel>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ ...tdSt, fontSize: 12, color: '#666' }}>Speed to upload contract after approval</td>
            <td style={tdSt}><NInput value={aRespP2C}  onChange={setARespP2C}  step={0.05} width={64} /></td>
          </tr>
          <tr>
            <td style={{ ...tdSt, fontSize: 12, color: '#666' }}>Speed to sign the contract</td>
            <td style={tdSt}><NInput value={aRespCont} onChange={setARespCont} step={0.05} width={64} /></td>
          </tr>
          <tr>
            <td style={{ ...tdSt, fontSize: 12, color: '#666' }}>Cap hours</td>
            <td style={tdSt}><NInput value={aCapHours} onChange={setACapHours} step={1}    width={64} /></td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 20, paddingLeft: 10, borderLeft: '3px solid #2e9e6b', marginBottom: 2 }}>
        <div style={{ color: '#2e9e6b', fontSize: 12, fontWeight: 700, letterSpacing: '0.02em' }}>Buyer</div>
        <div style={{ color: '#aaa', fontSize: 10, textTransform: 'uppercase' }}>represents the property buyer</div>
      </div>

      <SectionLabel sum={[bRespCont, bRespProp]}>Responsiveness</SectionLabel>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
        <tbody>
          <tr>
            <td style={{ ...tdSt, fontSize: 12, color: '#666' }}>Speed to sign the contract</td>
            <td style={tdSt}><NInput value={bRespCont} onChange={setBRespCont} step={0.05} width={64} /></td>
          </tr>
          <tr>
            <td style={{ ...tdSt, fontSize: 12, color: '#666' }}>Speed to respond to proposals</td>
            <td style={tdSt}><NInput value={bRespProp} onChange={setBRespProp} step={0.05} width={64} /></td>
          </tr>
          <tr>
            <td style={{ ...tdSt, fontSize: 12, color: '#666' }}>Cap hours</td>
            <td style={tdSt}><NInput value={bCapHours} onChange={setBCapHours} step={1}    width={64} /></td>
          </tr>
        </tbody>
      </table>

      <button className="primary" disabled={busy || result} onClick={deploy}>{busy ? 'Deploying…' : 'Deploy'}</button>
      <CardResult result={result} />
    </div>
  );
}

// ── RA Configuration card ─────────────────────────────────────────────────────

function RAConfigCard({ tids, ledger, deployed, onDone }) {
  const [configId,  setConfigId]  = useState('RA-CONFIG-001');
  const [fbDays,    setFbDays]    = useState(30);
  const [lCapHours, setLCapHours] = useState(24);
  // Tenant responsiveness weights (must sum to 1.0)
  const [tFirst,    setTFirst]    = useState(0.4);
  const [tReupload, setTReupload] = useState(0.6);
  const [tCapHours, setTCapHours] = useState(24);
  const [busy,   setBusy]   = useState(false);
  const [result, setResult] = useState(null);

  async function deploy() {
    setBusy(true); setResult(null);
    try {
      const ev = await ledger.create(tids.RentalAgreementConfiguration, {
        operator: ledger.party, configId: configId.trim(), createdAt: new Date().toISOString(),
        landlordObsWeights: { responsivenessCapHours: String(lCapHours) },
        tenantObsWeights: {
          responsivenessFirstUploadWeight: String(tFirst),
          responsivenessReuploadWeight:    String(tReupload),
          responsivenessCapHours:          String(tCapHours),
        },
        feedbackWindowDays: fbDays,
      });
      setResult({ ok: true, contractId: ev.contractId });
      onDone();
    } catch (e) { setResult({ ok: false, error: e.message }); }
    finally { setBusy(false); }
  }

  return (
    <div className="contract-card">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 16 }}>
        <Dot on={deployed} /> Rental Agreement Config
      </h2>
      <Row label="Config ID"><input value={configId} onChange={(e) => setConfigId(e.target.value)} /></Row>
      <Row label="Feedback window (days)">
        <input type="number" value={fbDays} onChange={(e) => setFbDays(parseInt(e.target.value) || 30)} />
      </Row>

      <div style={{ marginTop: 14, marginBottom: 2, color: '#777', fontSize: 12, fontWeight: 600 }}>Landlord Observation</div>
      <SectionLabel>Responsiveness</SectionLabel>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ ...tdSt, fontSize: 12, color: '#666' }}>Cap hours</td>
            <td style={tdSt}><NInput value={lCapHours} onChange={setLCapHours} step={1} width={64} /></td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 16, marginBottom: 2, color: '#777', fontSize: 12, fontWeight: 600 }}>Tenant Observation</div>
      <SectionLabel sum={[tFirst, tReupload]}>Responsiveness</SectionLabel>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
        <tbody>
          <tr>
            <td style={{ ...tdSt, fontSize: 12, color: '#666' }}>First upload weight</td>
            <td style={tdSt}><NInput value={tFirst}    onChange={setTFirst}    step={0.05} width={64} /></td>
          </tr>
          <tr>
            <td style={{ ...tdSt, fontSize: 12, color: '#666' }}>Reupload weight</td>
            <td style={tdSt}><NInput value={tReupload} onChange={setTReupload} step={0.05} width={64} /></td>
          </tr>
          <tr>
            <td style={{ ...tdSt, fontSize: 12, color: '#666' }}>Cap hours</td>
            <td style={tdSt}><NInput value={tCapHours} onChange={setTCapHours} step={1}    width={64} /></td>
          </tr>
        </tbody>
      </table>

      <button className="primary" disabled={busy || result} onClick={deploy}>{busy ? 'Deploying…' : 'Deploy'}</button>
      <CardResult result={result} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Setup() {
  const ledger = useLedger();
  const [tids,      setTids]      = useState({});
  const [status,    setStatus]    = useState({});
  const [parties,   setParties]   = useState([]);
  const [loading,   setLoading]   = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const t = await resolveTemplateIds(getInterfaceIds);
      const [st, { parties: pts }] = await Promise.all([
        loadStatus(ledger, t),
        ledger.listAllParties().catch(() => ({ parties: [] })),
      ]);
      setTids(t); setStatus(st); setParties(pts);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [ledger]);

  useEffect(() => { reload(); }, [reload]);

  const hasTids = Object.keys(tids).length > 0;

  return (
    <div className="page-scroll">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ marginBottom: 0 }}>Setup & Configuration</h1>
        <button onClick={reload} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      {/* Status strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '10px 16px', background: '#fafafa', border: '1px solid #e8e8e8', borderRadius: 3, marginBottom: 24 }}>
        <span style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</span>
        {CONFIG_KEYS.map((key) => (
          <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <Dot on={status[key]} />
            <span style={{ color: status[key] ? '#333' : '#bbb' }}>{CONFIG_LABELS[key]}</span>
          </span>
        ))}
      </div>

      {/* Manual config section label */}
      <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
        Manual Configuration
      </div>

      {/* 2-col config grid */}
      {hasTids ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <RoleConfigCard tids={tids} ledger={ledger} deployed={status.RoleConfiguration}             parties={parties} onDone={reload} />
          <PPConfigCard   tids={tids} ledger={ledger} deployed={status.PropertyPurchaseConfiguration} onDone={reload} />
          <RAConfigCard   tids={tids} ledger={ledger} deployed={status.RentalAgreementConfiguration}  onDone={reload} />
        </div>
      ) : (
        <p className="muted">{loading ? 'Resolving template IDs…' : 'Could not resolve template IDs from backend.'}</p>
      )}
    </div>
  );
}
