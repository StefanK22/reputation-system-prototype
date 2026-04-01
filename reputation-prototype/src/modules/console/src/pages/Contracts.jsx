import { useState, useEffect } from 'react';
import { useLedger } from '../LedgerContext.jsx';
import { TEMPLATES } from '../api/contracts.js';
import { getConfig } from '../api/reputation.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function useDeployForm(templateName, templateIds, ledger) {
  const [busy, setBusy]     = useState(false);
  const [result, setResult] = useState(null);

  async function submit(buildPayload, { actAs = [] } = {}) {
    setResult(null);
    setBusy(true);
    try {
      const tid = templateIds[templateName];
      if (!tid) throw new Error(`No template ID for ${templateName}. Make sure at least one exists on the ledger.`);
      const payload = buildPayload();
      const event   = await ledger.create(tid, payload, { actAs });
      setResult({ ok: true, contractId: event.contractId });
    } catch (e) {
      setResult({ ok: false, error: e.message });
    } finally {
      setBusy(false);
    }
  }

  return { busy, result, submit };
}

function FormResult({ result }) {
  if (!result) return null;
  return result.ok
    ? <p className="success" style={{ marginTop: 10 }}>Created — <span className="party">{result.contractId}</span></p>
    : <p className="error"   style={{ marginTop: 10 }}>{result.error}</p>;
}

function ParticipantList({ value, onChange }) {
  return (
    <div>
      {value.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
          <input
            value={p}
            placeholder="Party ID"
            onChange={e => { const next = [...value]; next[i] = e.target.value; onChange(next); }}
          />
          <button style={{ flexShrink: 0, width: 32 }} onClick={() => onChange(value.filter((_, j) => j !== i))}>−</button>
        </div>
      ))}
      <button style={{ marginTop: 4 }} onClick={() => onChange([...value, ''])}>+ Add</button>
    </div>
  );
}

function NumberField({ label, value, onChange }) {
  const [display, setDisplay] = useState(String(value ?? 0));

  // Sync display when parent value changes (e.g. config reload resets to 0)
  useEffect(() => {
    setDisplay(String(value ?? 0));
  }, [value]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 160, flexShrink: 0, fontSize: 12, color: '#555' }}>{label}</span>
      <input
        type="number"
        value={display}
        style={{ width: 90 }}
        onFocus={e => e.target.select()}
        onChange={e => {
          setDisplay(e.target.value);
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => {
          if (!Number.isFinite(parseFloat(display))) { setDisplay('0'); onChange(0); }
        }}
      />
    </div>
  );
}

function NumberMap({ keys, values, onChange }) {
  if (!keys.length) return <p className="muted" style={{ marginTop: 4 }}>—</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {keys.map(k => (
        <NumberField
          key={k}
          label={k}
          value={values[k] ?? 0}
          onChange={v => onChange({ ...values, [k]: v })}
        />
      ))}
    </div>
  );
}

function PartySelect({ parties, value, onChange, placeholder = '— select party —' }) {
  if (!parties.length) {
    return <input value={value} onChange={e => onChange(e.target.value)} placeholder="Party ID" />;
  }
  return (
    <select value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {parties.map(p => (
        <option key={p.party} value={p.party}>{p.displayName || p.party.split('::')[0]}</option>
      ))}
    </select>
  );
}

// ─── PartyRole ────────────────────────────────────────────────────────────────

function PartyRoleCard({ templateIds, parties, ledger }) {
  const { busy, result, submit } = useDeployForm(TEMPLATES.PARTY_ROLE, templateIds, ledger);
  const [party,  setParty]  = useState('');
  const [roleId, setRoleId] = useState('');

  return (
    <div className="contract-card">
      <h2>PartyRole</h2>
      <div className="form-row">
        <label>Party</label>
        <PartySelect parties={parties} value={party} onChange={setParty} />
      </div>
      <div className="form-row">
        <label>Role ID</label>
        <input value={roleId} onChange={e => setRoleId(e.target.value)} placeholder="e.g. AGENT" />
      </div>
      <button className="primary" disabled={busy} onClick={() => submit(() => ({
        operator:   ledger.party,
        party:      party.trim(),
        roleId:     roleId.trim(),
        assignedAt: new Date().toISOString(),
      }))}>
        {busy ? 'Deploying...' : 'Deploy'}
      </button>
      <FormResult result={result} />
    </div>
  );
}

// ─── CompletedInteraction ─────────────────────────────────────────────────────

function CompletedInteractionCard({ templateIds, config, ledger }) {
  const { busy, result, submit } = useDeployForm(TEMPLATES.INTERACTION, templateIds, ledger);
  const interactionTypes = config?.interactionTypes ?? [];

  const [interactionId,  setInteractionId]  = useState(() => `int-${Date.now()}`);
  const [itype,          setItype]          = useState(interactionTypes[0]?.interactionTypeId ?? '');
  const [participants,   setParticipants]   = useState(['', '']);
  const [outcome,        setOutcome]        = useState({});
  const [processed,      setProcessed]      = useState(false);

  // Rebuild outcome keys from ratingRules whenever interaction type changes
  useEffect(() => {
    const def    = interactionTypes.find(t => t.interactionTypeId === itype);
    const fields = def
      ? [...new Set((def.ratingRules ?? []).map(r => r.conditionField).filter(Boolean))]
      : [];
    setOutcome(prev => Object.fromEntries(fields.map(f => [f, prev[f] ?? 0])));
  }, [itype, config]);

  return (
    <div className="contract-card">
      <h2>CompletedInteraction</h2>
      <div className="form-row">
        <label>Interaction ID</label>
        <input value={interactionId} onChange={e => setInteractionId(e.target.value)} />
      </div>
      <div className="form-row">
        <label>Interaction Type</label>
        {interactionTypes.length > 0
          ? <select value={itype} onChange={e => setItype(e.target.value)}>
              {interactionTypes.map(t => (
                <option key={t.interactionTypeId} value={t.interactionTypeId}>{t.interactionTypeId}</option>
              ))}
            </select>
          : <input value={itype} onChange={e => setItype(e.target.value)} placeholder="e.g. SELL" />
        }
      </div>
      <div className="form-row">
        <label>Participants</label>
        <ParticipantList value={participants} onChange={setParticipants} />
      </div>
      <div className="form-row">
        <label>Outcome {Object.keys(outcome).length === 0 && <span className="muted">(select a type to see fields)</span>}</label>
        <NumberMap keys={Object.keys(outcome)} values={outcome} onChange={setOutcome} />
      </div>
      <div className="form-row">
        <label className="toggle-label">
          <input type="checkbox" style={{ width: 'auto' }} checked={processed} onChange={e => setProcessed(e.target.checked)} />
          Processed
        </label>
      </div>
      <button className="primary" disabled={busy} onClick={() => submit(() => ({
        operator:        ledger.party,
        interactionId:   interactionId.trim(),
        interactionType: itype,
        participants:    participants.filter(Boolean),
        outcome,
        completedAt:     new Date().toISOString(),
        processed,
      }))}>
        {busy ? 'Deploying...' : 'Deploy'}
      </button>
      <FormResult result={result} />
    </div>
  );
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

function FeedbackCard({ templateIds, config, parties, ledger }) {
  const { busy, result, submit } = useDeployForm(TEMPLATES.FEEDBACK, templateIds, ledger);
  const components = config?.components ?? [];

  const [interactionId,  setInteractionId]  = useState(() => `int-${Date.now()}`);
  const [from,           setFrom]           = useState('');
  const [to,             setTo]             = useState('');
  const [ratings,        setRatings]        = useState({});
  const [comments,       setComments]       = useState('');
  const [publicFeedback, setPublicFeedback] = useState(false);

  useEffect(() => {
    setRatings(Object.fromEntries(components.map(c => [c.componentId, 0])));
  }, [config]);

  return (
    <div className="contract-card">
      <h2>Feedback</h2>
      <div className="form-row">
        <label>Interaction ID</label>
        <input value={interactionId} onChange={e => setInteractionId(e.target.value)} placeholder="int-..." />
      </div>
      <div className="form-row">
        <label>From (Party)</label>
        <PartySelect parties={parties} value={from} onChange={setFrom} />
      </div>
      <div className="form-row">
        <label>To (Party)</label>
        <PartySelect parties={parties} value={to} onChange={setTo} />
      </div>
      <div className="form-row">
        <label>Ratings</label>
        <NumberMap keys={Object.keys(ratings)} values={ratings} onChange={setRatings} />
      </div>
      <div className="form-row">
        <label>Comments (optional)</label>
        <input value={comments} onChange={e => setComments(e.target.value)} placeholder="Leave blank for none" />
      </div>
      <div className="form-row">
        <label className="toggle-label">
          <input type="checkbox" style={{ width: 'auto' }} checked={publicFeedback} onChange={e => setPublicFeedback(e.target.checked)} />
          Public Feedback
        </label>
      </div>
      <button className="primary" disabled={busy} onClick={() => submit(() => {
        if (!interactionId.trim()) throw new Error('Interaction ID is required.');
        if (!from.trim())          throw new Error('From party is required.');
        if (!to.trim())            throw new Error('To party is required.');
        return {
          operator:      ledger.party,
          interactionId: interactionId.trim(),
          from:          from.trim(),
          to:            to.trim(),
          ratings,
          comments:      comments.trim() || null,
          submittedAt:   new Date().toISOString(),
          publicFeedback,
        };
      }, { actAs: [from.trim()] })}>
        {busy ? 'Deploying...' : 'Deploy'}
      </button>
      <FormResult result={result} />
    </div>
  );
}

// ─── ReputationToken ──────────────────────────────────────────────────────────

function ReputationTokenCard({ templateIds, config, parties, ledger }) {
  const { busy, result, submit } = useDeployForm(TEMPLATES.TOKEN, templateIds, ledger);
  const components = config?.components ?? [];

  const [owner,      setOwner]      = useState('');
  const [score,      setScore]      = useState(70);
  const [compValues, setCompValues] = useState({});

  useEffect(() => {
    setCompValues(Object.fromEntries(components.map(c => [c.componentId, c.initialValue ?? 70])));
  }, [config]);

  return (
    <div className="contract-card">
      <h2>ReputationToken</h2>
      <div className="form-row">
        <label>Owner (Party)</label>
        <PartySelect parties={parties} value={owner} onChange={setOwner} />
      </div>
      <div className="form-row">
        <label>Score</label>
        <NumberField label="" value={score} onChange={setScore} />
      </div>
      <div className="form-row">
        <label>Component Values</label>
        <NumberMap keys={components.map(c => c.componentId)} values={compValues} onChange={setCompValues} />
      </div>
      <button className="primary" disabled={busy} onClick={() => submit(() => {
        const now = new Date().toISOString();
        return {
          operator:   ledger.party,
          owner:      owner.trim(),
          score,
          components: Object.fromEntries(
            components.map(c => [
              c.componentId,
              { componentId: c.componentId, value: compValues[c.componentId] ?? c.initialValue ?? 70, interactionCount: 0 },
            ])
          ),
          issuedAt: now,
          updateAt: now,
        };
      })}>
        {busy ? 'Deploying...' : 'Deploy'}
      </button>
      <FormResult result={result} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Contracts() {
  const ledger = useLedger();
  const [templateIds, setTemplateIds] = useState({});
  const [config,      setConfig]      = useState(null);
  const [parties,     setParties]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);

  function reload() {
    setLoading(true);
    setError(null);
    Promise.all([
      ledger.queryAll().then(cs => {
        const ids = {};
        cs.forEach(c => { if (c.rawTemplateId) ids[c.templateId] = c.rawTemplateId; });
        return ids;
      }),
      getConfig().catch(() => null),
      ledger.listAllParties().then(r => r.parties || []).catch(() => []),
    ])
      .then(([ids, cfg, pts]) => { setTemplateIds(ids); setConfig(cfg); setParties(pts); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [ledger]);

  if (loading) return <p className="muted">Loading...</p>;
  if (error)   return <p className="error">{error}</p>;

  const shared = { templateIds, config, parties, ledger };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ marginBottom: 0 }}>Deploy Contracts</h1>
        <button onClick={reload}>Refresh</button>
      </div>
      {!config && (
        <p className="muted" style={{ marginBottom: 16 }}>
          No active config found — party selects and ratings will be empty until the config is deployed.
        </p>
      )}
      <div className="contracts-grid">
        <PartyRoleCard              {...shared} />
        <CompletedInteractionCard   {...shared} />
        <FeedbackCard               {...shared} />
        <ReputationTokenCard        {...shared} />
      </div>
    </>
  );
}
