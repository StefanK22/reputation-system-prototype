import { useState, useEffect } from 'react';
import { useLedger } from '../LedgerContext.jsx';
import { TEMPLATES, CHOICES } from '../api/contracts.js';
import { getConfig } from '../api/reputation.js';

// ─── NumberField ──────────────────────────────────────────────────────────────
// Internal string display so users can clear and retype without snap-back.

function NumberField({ value, onChange, style }) {
  const [display, setDisplay] = useState(String(value ?? 0));
  useEffect(() => { setDisplay(String(value ?? 0)); }, [value]);
  return (
    <input
      type="number"
      value={display}
      style={style}
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
  );
}

const COMPARATORS = ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE'];

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, open, onToggle, children }) {
  return (
    <div className="config-section">
      <div className="config-section-header" onClick={onToggle}>
        <h2>{title}</h2>
        <span>{open ? '▾' : '▸'}</span>
      </div>
      {open && <div className="config-section-body">{children}</div>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Config() {
  const ledger = useLedger();

  const [contractId, setContractId] = useState(null);
  const [templateId, setTemplateId] = useState(null);
  const [active,     setActive]     = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [busy,       setBusy]       = useState(false);
  const [result,     setResult]     = useState(null);

  // Form state
  const [sysParams,   setSysParams]   = useState({ reputationScoreFloor: 0, reputationScoreCeiling: 100 });
  const [components,  setComponents]  = useState([]);
  const [roleWeights, setRoleWeights] = useState([]);
  const [iTypes,      setITypes]      = useState([]);
  const [open,        setOpen]        = useState({ sys: true, comp: true, roles: true, types: false });

  const toggle = k => setOpen(prev => ({ ...prev, [k]: !prev[k] }));

  function loadFromConfig(cfg, cid, tid) {
    setContractId(cid);
    setTemplateId(tid);
    setActive(cfg);
    setSysParams({ ...cfg.systemParameters });
    setComponents(cfg.components.map(c => ({ ...c })));
    setRoleWeights(cfg.roleWeights.map(r => ({ ...r, componentWeights: { ...r.componentWeights } })));
    setITypes(cfg.interactionTypes.map(t => ({ ...t, ratingRules: t.ratingRules.map(r => ({ ...r })) })));
  }

  function reload() {
    setLoading(true);
    setError(null);
    Promise.all([
      getConfig().catch(() => null),
      ledger.queryAll().then(cs => cs.find(c => c.templateId === TEMPLATES.CONFIG)).catch(() => null),
    ])
      .then(([cfg, contract]) => {
        if (cfg && contract) loadFromConfig(cfg, contract.contractId, contract.rawTemplateId);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [ledger]);

  async function handleUpdate() {
    if (!contractId || !templateId) {
      setResult({ ok: false, error: 'No active config contract found on ledger.' });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const event = await ledger.exercise(contractId, templateId, CHOICES.CONFIG.UPDATE, {
        newActivatedAt:      new Date().toISOString(),
        newSystemParameters: sysParams,
        newComponents:       components,
        newRoleWeights:      roleWeights,
        newInteractionTypes: iTypes,
      });
      // Reload to pick up the new contractId (exercise archives the old contract)
      const [cfg, contract] = await Promise.all([
        getConfig().catch(() => null),
        ledger.queryAll().then(cs => cs.find(c => c.templateId === TEMPLATES.CONFIG)).catch(() => null),
      ]);
      if (cfg && contract) loadFromConfig(cfg, contract.contractId, contract.rawTemplateId);
      setResult({ ok: true, contractId: event.contractId });
    } catch (e) {
      setResult({ ok: false, error: e.message });
    } finally {
      setBusy(false);
    }
  }

  // ── Component helpers (cascade renames/removes to roles and rules) ────────────

  const componentIds = components.map(c => c.componentId);

  function renameComponent(i, oldId, newId) {
    setComponents(prev => prev.map((c, j) => j === i ? { ...c, componentId: newId } : c));
    if (oldId === newId) return;
    setRoleWeights(prev => prev.map(r => {
      const cw = { ...r.componentWeights };
      if (oldId in cw) { cw[newId] = cw[oldId]; delete cw[oldId]; }
      return { ...r, componentWeights: cw };
    }));
    setITypes(prev => prev.map(t => ({
      ...t,
      ratingRules: t.ratingRules.map(r => r.componentId === oldId ? { ...r, componentId: newId } : r),
    })));
  }

  function removeComponent(i) {
    const removed = components[i]?.componentId;
    setComponents(prev => prev.filter((_, j) => j !== i));
    if (!removed) return;
    setRoleWeights(prev => prev.map(r => {
      const cw = { ...r.componentWeights };
      delete cw[removed];
      return { ...r, componentWeights: cw };
    }));
    setITypes(prev => prev.map(t => ({
      ...t,
      ratingRules: t.ratingRules.filter(r => r.componentId !== removed),
    })));
  }

  function addComponent() {
    const id = `Component${components.length + 1}`;
    setComponents(prev => [...prev, { componentId: id, description: '', initialValue: 70 }]);
    setRoleWeights(prev => prev.map(r => ({
      ...r,
      componentWeights: { ...r.componentWeights, [id]: 0 },
    })));
  }

  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) return <p className="muted">Loading...</p>;
  if (error)   return <p className="error">{error}</p>;
  if (!active) return <p className="muted">No active configuration found.</p>;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ marginBottom: 0 }}>Configuration</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={reload}>Reset</button>
          <button className="primary" onClick={handleUpdate} disabled={busy}>
            {busy ? 'Updating...' : 'Update Config'}
          </button>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">Config ID</div>
          <div className="stat-value">{active.configId}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Version</div>
          <div className="stat-value">{active.version}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Activated</div>
          <div className="stat-value" style={{ fontSize: 12 }}>{new Date(active.activatedAt).toLocaleString()}</div>
        </div>
      </div>

      {result && (
        result.ok
          ? <p className="success" style={{ margin: '12px 0' }}>Updated to v{active.version + 1} — contract {result.contractId}</p>
          : <p className="error"   style={{ margin: '12px 0' }}>{result.error}</p>
      )}

      {/* ── System Parameters ── */}
      <Section title="System Parameters" open={open.sys} onToggle={() => toggle('sys')}>
        <div style={{ display: 'flex', gap: 24 }}>
          <div className="form-row" style={{ flex: 1 }}>
            <label>Score Floor</label>
            <NumberField
              value={sysParams.reputationScoreFloor}
              onChange={v => setSysParams(p => ({ ...p, reputationScoreFloor: v }))}
            />
          </div>
          <div className="form-row" style={{ flex: 1 }}>
            <label>Score Ceiling</label>
            <NumberField
              value={sysParams.reputationScoreCeiling}
              onChange={v => setSysParams(p => ({ ...p, reputationScoreCeiling: v }))}
            />
          </div>
        </div>
      </Section>

      {/* ── Components ── */}
      <Section title={`Components (${components.length})`} open={open.comp} onToggle={() => toggle('comp')}>
        {components.map((comp, i) => (
          <div key={i} className="config-sub">
            <div style={{ display: 'flex', gap: 10, flex: 1, flexWrap: 'wrap' }}>
              <div className="form-row" style={{ flex: '1 1 120px' }}>
                <label>ID</label>
                <input
                  value={comp.componentId}
                  onChange={e => renameComponent(i, comp.componentId, e.target.value)}
                />
              </div>
              <div className="form-row" style={{ flex: '2 1 200px' }}>
                <label>Description</label>
                <input
                  value={comp.description}
                  onChange={e => setComponents(prev => prev.map((c, j) => j === i ? { ...c, description: e.target.value } : c))}
                />
              </div>
              <div className="form-row" style={{ flex: '0 0 110px' }}>
                <label>Initial Value</label>
                <NumberField
                  value={comp.initialValue}
                  onChange={v => setComponents(prev => prev.map((c, j) => j === i ? { ...c, initialValue: v } : c))}
                />
              </div>
            </div>
            <button onClick={() => removeComponent(i)} style={{ alignSelf: 'flex-end' }}>Remove</button>
          </div>
        ))}
        <button onClick={addComponent} style={{ marginTop: 6 }}>+ Add Component</button>
      </Section>

      {/* ── Role Weights ── */}
      <Section title={`Role Weights (${roleWeights.length})`} open={open.roles} onToggle={() => toggle('roles')}>
        {roleWeights.map((role, ri) => (
          <div key={ri} className="config-sub">
            <div className="form-row" style={{ marginBottom: 10, maxWidth: 240 }}>
              <label>Role ID</label>
              <input
                value={role.roleId}
                onChange={e => setRoleWeights(prev => prev.map((r, j) => j === ri ? { ...r, roleId: e.target.value } : r))}
              />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {componentIds.map(cid => (
                <div key={cid} className="form-row" style={{ width: 130 }}>
                  <label>{cid}</label>
                  <NumberField
                    value={role.componentWeights?.[cid] ?? 0}
                    onChange={v => setRoleWeights(prev => prev.map((r, j) =>
                      j === ri ? { ...r, componentWeights: { ...r.componentWeights, [cid]: v } } : r
                    ))}
                  />
                </div>
              ))}
            </div>
            <button onClick={() => setRoleWeights(prev => prev.filter((_, j) => j !== ri))} style={{ marginTop: 8 }}>
              Remove Role
            </button>
          </div>
        ))}
        <button onClick={() => setRoleWeights(prev => [
          ...prev,
          { roleId: `ROLE_${prev.length + 1}`, componentWeights: Object.fromEntries(componentIds.map(id => [id, 0])) },
        ])} style={{ marginTop: 6 }}>+ Add Role</button>
      </Section>

      {/* ── Interaction Types ── */}
      <Section title={`Interaction Types (${iTypes.length})`} open={open.types} onToggle={() => toggle('types')}>
        {iTypes.map((itype, ti) => (
          <div key={ti} className="config-sub">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div className="form-row" style={{ flex: '1 1 120px' }}>
                <label>Type ID</label>
                <input
                  value={itype.interactionTypeId}
                  onChange={e => setITypes(prev => prev.map((t, j) => j === ti ? { ...t, interactionTypeId: e.target.value } : t))}
                />
              </div>
              <div className="form-row" style={{ flex: '2 1 200px' }}>
                <label>Description</label>
                <input
                  value={itype.description}
                  onChange={e => setITypes(prev => prev.map((t, j) => j === ti ? { ...t, description: e.target.value } : t))}
                />
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <span style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rating Rules</span>
              {itype.ratingRules.map((rule, ri) => (
                <div key={ri} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                  <select
                    value={rule.componentId}
                    style={{ width: 150 }}
                    onChange={e => setITypes(prev => prev.map((t, j) => j === ti
                      ? { ...t, ratingRules: t.ratingRules.map((r, k) => k === ri ? { ...r, componentId: e.target.value } : r) }
                      : t))}
                  >
                    <option value="">(none)</option>
                    {componentIds.map(cid => <option key={cid} value={cid}>{cid}</option>)}
                  </select>
                  <input
                    value={rule.conditionField}
                    placeholder="field"
                    style={{ width: 130 }}
                    onChange={e => setITypes(prev => prev.map((t, j) => j === ti
                      ? { ...t, ratingRules: t.ratingRules.map((r, k) => k === ri ? { ...r, conditionField: e.target.value } : r) }
                      : t))}
                  />
                  <select
                    value={rule.conditionComparator}
                    style={{ width: 70 }}
                    onChange={e => setITypes(prev => prev.map((t, j) => j === ti
                      ? { ...t, ratingRules: t.ratingRules.map((r, k) => k === ri ? { ...r, conditionComparator: e.target.value } : r) }
                      : t))}
                  >
                    {COMPARATORS.map(op => <option key={op} value={op}>{op}</option>)}
                  </select>
                  <NumberField
                    value={rule.conditionValue}
                    style={{ width: 70 }}
                    onChange={v => setITypes(prev => prev.map((t, j) => j === ti
                      ? { ...t, ratingRules: t.ratingRules.map((r, k) => k === ri ? { ...r, conditionValue: v } : r) }
                      : t))}
                  />
                  <span className="muted" style={{ fontSize: 11 }}>→</span>
                  <NumberField
                    value={rule.ratingValue}
                    style={{ width: 70 }}
                    onChange={v => setITypes(prev => prev.map((t, j) => j === ti
                      ? { ...t, ratingRules: t.ratingRules.map((r, k) => k === ri ? { ...r, ratingValue: v } : r) }
                      : t))}
                  />
                  <button onClick={() => setITypes(prev => prev.map((t, j) => j === ti
                    ? { ...t, ratingRules: t.ratingRules.filter((_, k) => k !== ri) }
                    : t))}>−</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => setITypes(prev => prev.map((t, j) => j === ti ? {
                  ...t,
                  ratingRules: [...t.ratingRules, {
                    componentId:         componentIds[0] || '',
                    conditionField:      '',
                    conditionComparator: 'EQ',
                    conditionValue:      0,
                    ratingValue:         70,
                  }],
                } : t))}>+ Add Rule</button>
                <button onClick={() => setITypes(prev => prev.filter((_, j) => j !== ti))}>Remove Type</button>
              </div>
            </div>
          </div>
        ))}
        <button onClick={() => setITypes(prev => [
          ...prev,
          { interactionTypeId: `TYPE_${prev.length + 1}`, description: '', ratingRules: [] },
        ])} style={{ marginTop: 6 }}>+ Add Interaction Type</button>
      </Section>
    </>
  );
}
