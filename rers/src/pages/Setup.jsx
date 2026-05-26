import { useState, useEffect, useCallback } from 'react';
import { useLedger } from '../LedgerContext.jsx';
import { getInterfaceIds } from '../api/reputation.js';
import { KNOWN_MODULE_PATHS } from '../api/contracts.js';

// ── Template ID resolution ────────────────────────────────────────────────────

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

// ── Seed function ─────────────────────────────────────────────────────────────

function ts(base, daysOffset, hourOffset) {
  const d = new Date(base.getTime() + daysOffset * 86_400_000 + hourOffset * 3_600_000);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

async function runSeed(ledger, tids, log) {
  log('Allocating parties…');
  const { parties: existing } = await ledger.listAllParties();
  const findParty = (hint) => existing.find((p) =>
    p.displayName === hint || p.party.startsWith(hint + '::')
  )?.party;
  const alloc = async (hint) => {
    const found = findParty(hint);
    if (found) return found;
    const res = await ledger.allocateParty(hint);
    return res.partyDetails?.party || res.party;
  };
  const alice = await alloc('AgentAlice');
  const bob   = await alloc('BuyerBob');
  const carol = await alloc('AgentCarol');
  const dave  = await alloc('BuyerDave');
  const eve   = await alloc('LandlordEve');
  const frank = await alloc('TenantFrank');
  const grace = await alloc('TenantGrace');

  const base = new Date(); base.setHours(9, 0, 0, 0);
  const t0 = ts(base, -17, 0);

  log('Creating RoleConfiguration and roles…');
  const w = { reliability: '0.5', responsiveness: '0.3', accuracy: '0.2' };
  const roleConfigEvent = await ledger.create(tids.RoleConfiguration, {
    operator: ledger.party, configId: 'ROLE-CONFIG-SEED', createdAt: t0,
    agentWeights: w, buyerWeights: w, landlordWeights: w, tenantWeights: w,
    scoreFloor: '0.0', scoreCeiling: '100.0', startValue: '70.0',
  });
  const rcId = roleConfigEvent.contractId;
  const mkRole = (party, roleType) =>
    ledger.exercise(rcId, tids.RoleConfiguration, 'CreateRole', { party, roleType, assignedAt: t0 });
  await mkRole(alice, 'Agent');   await mkRole(bob,   'Buyer');
  await mkRole(carol, 'Agent');   await mkRole(dave,  'Buyer');
  await mkRole(eve,   'Landlord'); await mkRole(frank, 'Tenant'); await mkRole(grace, 'Tenant');

  log('Creating PropertyPurchaseConfiguration…');
  const ppEvent = await ledger.create(tids.PropertyPurchaseConfiguration, {
    operator: ledger.party, configId: 'PP-CONFIG-SEED', createdAt: t0,
    agentObsWeights: { reliabilityVoidedWeight: '0.3', reliabilityCompletionWeight: '0.7',
      responsivenessProposalToContractWeight: '0.6', responsivenessContractWeight: '0.4', responsivenessCapHours: '24.0' },
    buyerObsWeights: { responsivenessContractWeight: '0.6', responsivenessProposalWeight: '0.4', responsivenessCapHours: '24.0' },
    feedbackWindowDays: 30,
  });
  const ppId = ppEvent.contractId;

  log('Creating RentalAgreementConfiguration…');
  const raEvent = await ledger.create(tids.RentalAgreementConfiguration, {
    operator: ledger.party, configId: 'RA-CONFIG-SEED', createdAt: t0,
    landlordObsWeights: { responsivenessCapHours: '24.0' },
    tenantObsWeights: { responsivenessFirstUploadWeight: '0.4', responsivenessReuploadWeight: '0.6', responsivenessCapHours: '24.0' },
    feedbackWindowDays: 30,
  });
  const raId = raEvent.contractId;

  const draft = (id, type, parts, configCid, openedAt) => ledger.create(tids.DraftInteraction,
    { operator: ledger.party, initiator: ledger.party, interactionId: id, interactionType: type, participants: parts, configCid, openedAt });
  const begin = (dId, startedAt) => ledger.exercise(dId, tids.DraftInteraction, 'Begin', { startedAt });
  const rec   = (iId, event, actor, occurredAt, resourceId) =>
    ledger.exercise(iId, tids.InProgressInteraction, 'RecordEvent', { event: { event, actor, occurredAt, resourceId } });
  const complete = (iId, completedAt) =>
    ledger.exercise(iId, tids.InProgressInteraction, 'Complete', { completedAt });

  log('Scenario 1: TX-SEED-001 (Alice + Bob, completed + feedback)…');
  {
    const b = new Date(base); b.setDate(b.getDate() - 17);
    const dId = (await draft('TX-SEED-001', 'PropertyPurchase',
      [{ _1: alice, _2: 'Agent' }, { _1: bob, _2: 'Buyer' }], ppId, ts(b, 0, 9))).contractId;
    let iId = (await begin(dId, ts(b, 0, 9))).contractId;
    iId = (await rec(iId, 'ProposalSubmitted',         alice, ts(b, 0,  9), 'proposal-001')).contractId;
    iId = (await rec(iId, 'ProposalRejectedWithNotes',  bob,  ts(b, 0, 21), 'proposal-001')).contractId;
    iId = (await rec(iId, 'ProposalSubmitted',         alice, ts(b, 1,  9), 'proposal-001')).contractId;
    iId = (await rec(iId, 'ProposalApproved',           bob,  ts(b, 2,  9), 'proposal-001')).contractId;
    iId = (await rec(iId, 'ContractUploaded',          alice, ts(b, 2, 21), 'contract-001')).contractId;
    iId = (await rec(iId, 'ContractSigned',            alice, ts(b, 3,  9), 'contract-001')).contractId;
    iId = (await rec(iId, 'ContractSigned',             bob,  ts(b, 3,  9), 'contract-001')).contractId;
    iId = (await rec(iId, 'TransactionStateChanged',   alice, ts(b, 3, 14), 'SELL_CLOSED')).contractId;
    const cId = (await complete(iId, ts(b, 3, 15))).contractId;
    const evs = await ledger.exerciseMulti(ppId, tids.PropertyPurchaseConfiguration, 'CreateObservations', { completedCid: cId });
    const reqs = evs.filter((e) => e.templateId === 'PropertyPurchaseFeedbackRequest');
    const aReq = reqs.find((e) => e.payload?.from === alice);
    const bReq = reqs.find((e) => e.payload?.from === bob);
    const now = new Date().toISOString();
    if (aReq) await ledger.exercise(aReq.contractId, tids.PropertyPurchaseFeedbackRequest,
      'SubmitFeedback', { professionalism: '0.85', availability: '0.9', honesty: '0.8', submittedAt: now }, { actAs: [alice] });
    if (bReq) await ledger.exercise(bReq.contractId, tids.PropertyPurchaseFeedbackRequest,
      'SubmitFeedback', { professionalism: '0.9', availability: '0.85', honesty: '0.95', submittedAt: now }, { actAs: [bob] });
  }

  log('Scenario 2: TX-SEED-002 (Carol + Dave, completed, no feedback)…');
  {
    const b = new Date(base); b.setDate(b.getDate() - 15);
    const dId = (await draft('TX-SEED-002', 'PropertyPurchase',
      [{ _1: carol, _2: 'Agent' }, { _1: dave, _2: 'Buyer' }], ppId, ts(b, 0, 9))).contractId;
    let iId = (await begin(dId, ts(b, 0, 9))).contractId;
    iId = (await rec(iId, 'ProposalSubmitted',        carol, ts(b, 0,  9), 'proposal-001')).contractId;
    iId = (await rec(iId, 'ProposalApproved',          dave, ts(b, 2,  9), 'proposal-001')).contractId;
    iId = (await rec(iId, 'ContractUploaded',         carol, ts(b, 2, 21), 'contract-001')).contractId;
    iId = (await rec(iId, 'ContractVoided',           carol, ts(b, 3,  9), 'contract-001')).contractId;
    iId = (await rec(iId, 'ContractUploaded',         carol, ts(b, 3, 21), 'contract-002')).contractId;
    iId = (await rec(iId, 'ContractSigned',           carol, ts(b, 4,  9), 'contract-002')).contractId;
    iId = (await rec(iId, 'ContractSigned',            dave, ts(b, 4,  9), 'contract-002')).contractId;
    iId = (await rec(iId, 'TransactionStateChanged',  carol, ts(b, 4, 12), 'SELL_CLOSED')).contractId;
    const cId = (await complete(iId, ts(b, 4, 13))).contractId;
    await ledger.exerciseMulti(ppId, tids.PropertyPurchaseConfiguration, 'CreateObservations', { completedCid: cId });
  }

  log('Scenario 3: RA-SEED-001 (Eve + Frank, completed + landlord feedback)…');
  {
    const b = new Date(base); b.setDate(b.getDate() - 13);
    const dId = (await draft('RA-SEED-001', 'RentalAgreement',
      [{ _1: eve, _2: 'Landlord' }, { _1: frank, _2: 'Tenant' }], raId, ts(b, 0, 9))).contractId;
    let iId = (await begin(dId, ts(b, 0, 9))).contractId;
    iId = (await rec(iId, 'DocumentUploaded',           frank, ts(b, 0, 11), 'doc-001')).contractId;
    iId = (await rec(iId, 'DocumentRejectedWithNotes',    eve, ts(b, 0, 23), 'doc-001')).contractId;
    iId = (await rec(iId, 'DocumentUploaded',           frank, ts(b, 1,  5), 'doc-001')).contractId;
    iId = (await rec(iId, 'DocumentApproved',             eve, ts(b, 1, 17), 'doc-001')).contractId;
    iId = (await rec(iId, 'DocumentUploaded',           frank, ts(b, 2,  9), 'doc-002')).contractId;
    iId = (await rec(iId, 'DocumentApproved',             eve, ts(b, 3,  9), 'doc-002')).contractId;
    iId = (await rec(iId, 'TransactionStateChanged',      eve, ts(b, 3, 14), 'LEASE_SIGNED')).contractId;
    const cId = (await complete(iId, ts(b, 3, 15))).contractId;
    const evs = await ledger.exerciseMulti(raId, tids.RentalAgreementConfiguration, 'CreateObservations', { completedCid: cId });
    const reqs = evs.filter((e) => e.templateId === 'RentalAgreementFeedbackRequest');
    const eReq = reqs.find((e) => e.payload?.from === eve);
    if (eReq) await ledger.exercise(eReq.contractId, tids.RentalAgreementFeedbackRequest,
      'SubmitFeedbackAsLandlord',
      { documentHonesty: '0.9', communicationTimeliness: '0.8', requirementCompliance: '0.85', submittedAt: new Date().toISOString() },
      { actAs: [eve] });
  }

  log('Scenario 4: TX-SEED-003 (Alice + Dave, in-progress)…');
  {
    const b = new Date(base); b.setDate(b.getDate() - 4);
    const dId = (await draft('TX-SEED-003', 'PropertyPurchase',
      [{ _1: alice, _2: 'Agent' }, { _1: dave, _2: 'Buyer' }], ppId, ts(b, 0, 9))).contractId;
    const iId = (await begin(dId, ts(b, 0, 9))).contractId;
    await rec(iId, 'ProposalSubmitted', alice, ts(b, 0, 9), 'proposal-001');
  }

  log('Scenario 5: RA-SEED-002 (Eve + Grace, draft)…');
  {
    const b = new Date(base); b.setDate(b.getDate() - 3);
    await draft('RA-SEED-002', 'RentalAgreement',
      [{ _1: eve, _2: 'Landlord' }, { _1: grace, _2: 'Tenant' }], raId, ts(b, 0, 9));
  }

  log('Done.');
}

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
  const [busy,       setBusy]       = useState(false);
  const [result,     setResult]     = useState(null);

  const setW = (role, field, val) =>
    setWeights((prev) => ({ ...prev, [role]: { ...prev[role], [field]: val } }));

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
  const [seedBusy,  setSeedBusy]  = useState(false);
  const [seedLog,   setSeedLog]   = useState([]);
  const [seedError, setSeedError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const t = await resolveTemplateIds();
      const [st, { parties: pts }] = await Promise.all([
        loadStatus(ledger, t),
        ledger.listAllParties().catch(() => ({ parties: [] })),
      ]);
      setTids(t); setStatus(st); setParties(pts);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [ledger]);

  useEffect(() => { reload(); }, [reload]);

  async function handleSeed() {
    setSeedBusy(true); setSeedLog([]); setSeedError(null);
    try {
      await runSeed(ledger, tids, (msg) => setSeedLog((l) => [...l, msg]));
      await reload();
    } catch (e) { setSeedError(e.message); }
    finally { setSeedBusy(false); }
  }

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

      {/* Seed section */}
      <div style={{ background: '#fafafa', border: '1px solid #e8e8e8', borderRadius: 3, padding: '18px 20px', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Seed Demo Data</div>
            <p style={{ fontSize: 12, color: '#555', lineHeight: 1.6, margin: 0 }}>
              Allocates 7 parties, deploys all 3 configuration contracts, assigns roles, and creates
              5 sample interactions (completed with feedback, in-progress, and draft).
            </p>
          </div>
          <div style={{ flexShrink: 0, paddingTop: 2 }}>
            <button className="primary" disabled={seedBusy || !hasTids} onClick={handleSeed} style={{ minWidth: 130 }}>
              {seedBusy ? 'Seeding…' : 'Seed Demo Data'}
            </button>
          </div>
        </div>
        {(seedLog.length > 0 || seedError) && (
          <div style={{ marginTop: 14, borderTop: '1px solid #eee', paddingTop: 12 }}>
            {seedLog.map((msg, i) => (
              <div key={i} style={{ fontSize: 11, color: '#555', lineHeight: 1.8 }}>
                <span style={{ color: '#27ae60', marginRight: 6 }}>✓</span>{msg}
              </div>
            ))}
            {seedBusy && <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>Working…</div>}
            {seedError && <div style={{ fontSize: 11, color: '#c0392b', marginTop: 4 }}>✗ {seedError}</div>}
          </div>
        )}
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
