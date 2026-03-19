import React, { useEffect, useState } from 'https://esm.sh/react@18.2.0';
import { createRoot } from 'https://esm.sh/react-dom@18.2.0/client';
import {
  html, pretty, clone, toNum, api, CONDITION_OPS,
  fieldState, buildPayload, initDraft, reconcile, serializeDraft,
} from './shared.js';

const NAV = [
  { id: 'dashboard',   label: 'Dashboard' },
  { id: 'config',      label: 'Configuration' },
  { id: 'deploy',      label: 'Deploy' },
  { id: 'events',      label: 'Events' },
  { id: 'database',    label: 'Database' },
  { id: 'credentials', label: 'Credentials' },
];

// ─── App ─────────────────────────────────────────────────────────────────────

function App() {
  const [page, setPage]           = useState('dashboard');
  const [contracts, setContracts] = useState([]);
  const [toasts, setToasts]       = useState([]);

  const notify = (msg, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  };

  useEffect(() => { api.contracts().then(setContracts).catch((e) => notify(e.message, 'error')); }, []);

  const pages = { dashboard: Dashboard, config: ConfigPage, deploy: DeployPage, events: EventsPage, database: DatabasePage, credentials: CredentialsPage };
  const Page  = pages[page] || Dashboard;

  return html`
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-brand">Reputation${' '}Prototype</div>
        ${NAV.map((n) => html`
          <button key=${n.id} className=${`nav-item${page === n.id ? ' active' : ''}`} onClick=${() => setPage(n.id)}>${n.label}</button>
        `)}
      </nav>
      <main className="content">
        <div className="toasts">
          ${toasts.map((t) => html`<div key=${t.id} className=${`toast ${t.type}`}>${t.msg}</div>`)}
        </div>
        <${Page} contracts=${contracts} notify=${notify} />
      </main>
    </div>
  `;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

function Dashboard({ notify }) {
  const [rankings, setRankings] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail]     = useState(null);

  const refresh = async () => {
    try { setRankings(await api.rankings()); }
    catch (e) { notify(e.message, 'error'); }
  };

  useEffect(() => { refresh(); }, []);

  const viewParty = async (party) => {
    if (selected === party) { setSelected(null); setDetail(null); return; }
    try { setSelected(party); setDetail(await api.reputation(party)); }
    catch (e) { notify(e.message, 'error'); setSelected(null); }
  };

  return html`
    <div className="page-header">
      <h1>Dashboard</h1>
      <div className="btn-group">
        <button className="btn-sm" onClick=${refresh}>Refresh</button>
      </div>
    </div>

    <div className="card">
      <h2>Rankings</h2>
      ${rankings.length === 0
        ? html`<p className="muted">No ranked parties yet.</p>`
        : html`
          <table>
            <thead><tr><th>#</th><th>Party</th><th>Role</th><th>Score</th><th></th></tr></thead>
            <tbody>
              ${rankings.map((r, i) => html`
                <${React.Fragment} key=${r.party}>
                  <tr className=${selected === r.party ? 'selected' : ''}>
                    <td>${i + 1}</td>
                    <td><strong>${r.party}</strong></td>
                    <td><span className="badge">${r.roleId || '-'}</span></td>
                    <td>${r.overallScore != null ? r.overallScore.toFixed(1) : '-'}</td>
                    <td><button className="btn-link" onClick=${() => viewParty(r.party)}>${selected === r.party ? 'Hide' : 'Details'}</button></td>
                  </tr>
                  ${selected === r.party && detail ? html`
                    <tr className="detail-row"><td colSpan="5">
                      <${PartyDetail} data=${detail} />
                    </td></tr>
                  ` : null}
                <//>
              `)}
            </tbody>
          </table>
        `}
    </div>
  `;
}

function PartyDetail({ data }) {
  const comps = Object.entries(data.components || {});
  return html`
    <div className="detail-panel">
      <div className="detail-header">
        <h3>${data.party}</h3>
        <span className="badge">${data.roleId}</span>
        <span className="score">${data.overallScore?.toFixed(1)}</span>
      </div>
      ${comps.length > 0 ? html`
        <table>
          <thead><tr><th>Component</th><th>Value</th><th>Interactions</th></tr></thead>
          <tbody>
            ${comps.map(([id, c]) => html`
              <tr key=${id}><td>${id}</td><td>${c.value?.toFixed(1)}</td><td>${c.interactionCount}</td></tr>
            `)}
          </tbody>
        </table>
      ` : null}
      <details><summary>Raw JSON</summary><pre>${pretty(data)}</pre></details>
    </div>
  `;
}

// ─── Configuration ───────────────────────────────────────────────────────────

function ConfigPage({ contracts, notify }) {
  const configDef = contracts.find((c) => c.isConfigTemplate);
  const [active, setActive]     = useState(null);
  const [draft, setDraft]       = useState(null);
  const [busy, setBusy]         = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [open, setOpen]         = useState({ meta: true, comp: true, roles: true, parties: false, types: false });

  useEffect(() => {
    if (!configDef) return;
    api.config()
      .then((cfg) => { setActive(cfg); const d = initDraft(cfg, configDef); d.version = (cfg.version ?? 0) + 1; setDraft(d); })
      .catch(() => { const d = initDraft(null, configDef); d.version = 1; setDraft(d); });
  }, [configDef]);

  if (!configDef || !draft) return html`<div className="card"><p className="muted">Loading configuration...</p></div>`;

  const update = (fn) => setDraft((prev) => { const next = clone(prev); fn(next); reconcile(next); return next; });
  const set    = (key, val) => update((d) => { d[key] = val; });
  const setSys = (key, val) => update((d) => { d.systemParameters[key] = val; });
  const toggle = (key) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  const reload = () => { if (active && configDef) { const d = initDraft(active, configDef); d.version = (active.version ?? 0) + 1; setDraft(d); notify('Config reloaded', 'info'); } };

  const deploy = async () => {
    try {
      setBusy(true);
      const snap = clone(draft); reconcile(snap);
      await api.deploy(configDef.templateId, serializeDraft(snap), true);
      notify('Configuration deployed', 'success');
      const cfg = await api.config().catch(() => null);
      if (cfg) { setActive(cfg); setDraft((prev) => ({ ...prev, version: (cfg.version ?? 0) + 1 })); }
    } catch (e) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const roleIds      = draft.roleWeights.map((r) => r.roleId).filter(Boolean);
  const componentIds = draft.components.map((c) => c.componentId).filter(Boolean);

  return html`
    <div className="page-header">
      <h1>Configuration</h1>
      <div className="btn-group">
        <button className="btn-sm" onClick=${reload}>Reload Active</button>
        <button className="btn-sm" onClick=${() => setShowJson(!showJson)}>${showJson ? 'Hide' : 'Show'} JSON</button>
        <button className="btn" onClick=${deploy} disabled=${busy}>${busy ? 'Deploying...' : 'Deploy'}</button>
      </div>
    </div>

    ${showJson ? html`<div className="card"><pre>${pretty(serializeDraft(clone(draft)))}</pre></div>` : null}

    <!-- Metadata -->
    <div className="card">
      <div className="section-header" onClick=${() => toggle('meta')}>
        <h2>Metadata & System</h2><span>${open.meta ? '\u25BE' : '\u25B8'}</span>
      </div>
      ${open.meta ? html`
        <div className="form">
          <div className="field">
            <label>version</label>
            <div className="auto-field">v${draft.version} <span className="muted">— auto-incremented from active</span></div>
          </div>
          ${[['operator', 'text'], ['configId', 'text']].map(([key, type]) => html`
            <div key=${key} className="field">
              <label>${key}</label>
              <input type=${type} value=${draft[key]} onChange=${(e) => set(key, e.target.value)} />
            </div>
          `)}
          <div className="field">
            <label>activationTime</label>
            <div className="auto-field"><span className="muted">current date — set at deploy time</span></div>
          </div>
          <div className="field-row">
            <div className="field"><label>reputationFloor</label><input type="number" value=${draft.systemParameters.reputationFloor} onFocus=${(e) => e.target.select()} onChange=${(e) => setSys('reputationFloor', e.target.value)} /></div>
            <div className="field"><label>reputationCeiling</label><input type="number" value=${draft.systemParameters.reputationCeiling} onFocus=${(e) => e.target.select()} onChange=${(e) => setSys('reputationCeiling', e.target.value)} /></div>
          </div>
        </div>
      ` : null}
    </div>

    <!-- Components -->
    <div className="card">
      <div className="section-header" onClick=${() => toggle('comp')}>
        <h2>Components</h2><span>${open.comp ? '\u25BE' : '\u25B8'}</span>
      </div>
      ${open.comp ? html`
        <p className="hint">Renaming a component auto-updates role weights and rating rules.</p>
        ${draft.components.map((comp, i) => html`
          <div key=${i} className="sub-card">
            <div className="field-row">
              ${[['componentId', 'text'], ['description', 'text'], ['initialValue', 'number']].map(([key, type]) => html`
                <div key=${key} className="field">
                  <label>${key}</label>
                  <input type=${type} value=${comp[key]} onFocus=${type === 'number' ? (e) => e.target.select() : undefined} onChange=${(e) => update((d) => {
                    const c = d.components[i]; if (!c) return;
                    if (key === 'componentId') {
                      const oldId = c.componentId, newId = e.target.value; c.componentId = newId;
                      if (oldId !== newId) {
                        d.roleWeights.forEach((r) => { if (oldId in (r.componentWeights ?? {})) { r.componentWeights[newId] = r.componentWeights[oldId]; delete r.componentWeights[oldId]; } });
                        d.interactionTypes.forEach((t) => t.ratingRules.forEach((rule) => { if (rule.componentId === oldId) rule.componentId = newId; }));
                      }
                    } else if (key === 'initialValue') c.initialValue = e.target.value;
                    else c[key] = e.target.value;
                  })} />
                </div>
              `)}
            </div>
            <button className="btn-sm danger" onClick=${() => update((d) => {
              const [removed] = d.components.splice(i, 1); if (!removed) return;
              d.roleWeights.forEach((r) => { if (r.componentWeights) delete r.componentWeights[removed.componentId]; });
              d.interactionTypes.forEach((t) => { t.ratingRules = t.ratingRules.filter((r) => r.componentId !== removed.componentId); });
            })}>Remove</button>
          </div>
        `)}
        <button className="btn-sm" onClick=${() => update((d) => {
          const id = 'Component' + (d.components.length + 1);
          d.components.push({ componentId: id, description: '', initialValue: 70 });
          d.roleWeights.forEach((r) => { r.componentWeights = r.componentWeights || {}; if (r.componentWeights[id] == null) r.componentWeights[id] = 0; });
        })}>+ Add Component</button>
      ` : null}
    </div>

    <!-- Roles & Weights -->
    <div className="card">
      <div className="section-header" onClick=${() => toggle('roles')}>
        <h2>Roles & Weights</h2><span>${open.roles ? '\u25BE' : '\u25B8'}</span>
      </div>
      ${open.roles ? html`
        <div className="field" style=${{ marginBottom: '12px' }}>
          <label>Default Role</label>
          <select value=${draft.defaultRoleId} onChange=${(e) => set('defaultRoleId', e.target.value)}>
            <option value="">(none)</option>
            ${roleIds.map((id) => html`<option key=${id} value=${id}>${id}</option>`)}
          </select>
        </div>
        ${draft.roleWeights.map((role, ri) => html`
          <div key=${ri} className="sub-card">
            <div className="field">
              <label>Role ID</label>
              <input type="text" value=${role.roleId} onChange=${(e) => update((d) => {
                const r = d.roleWeights[ri]; if (!r) return;
                const old = r.roleId; r.roleId = e.target.value;
                if (old && old !== r.roleId) {
                  if (d.defaultRoleId === old) d.defaultRoleId = r.roleId;
                  Object.keys(d.partyRoles ?? {}).forEach((p) => { if (d.partyRoles[p] === old) d.partyRoles[p] = r.roleId; });
                }
              })} />
            </div>
            <div className="weight-grid">
              ${draft.components.map((comp) => html`
                <div key=${comp.componentId} className="weight-item">
                  <label>${comp.componentId || '?'}</label>
                  <input type="number" step="0.01" value=${role.componentWeights?.[comp.componentId] ?? 0} onFocus=${(e) => e.target.select()} onChange=${(e) => update((d) => {
                    const r = d.roleWeights[ri]; if (r) { r.componentWeights = r.componentWeights || {}; r.componentWeights[comp.componentId] = e.target.value; }
                  })} />
                </div>
              `)}
            </div>
            <button className="btn-sm danger" onClick=${() => update((d) => {
              const [removed] = d.roleWeights.splice(ri, 1); if (!removed) return;
              Object.keys(d.partyRoles ?? {}).forEach((p) => { if (d.partyRoles[p] === removed.roleId) delete d.partyRoles[p]; });
              if (d.defaultRoleId === removed.roleId) d.defaultRoleId = d.roleWeights[0]?.roleId || '';
            })}>Remove Role</button>
          </div>
        `)}
        <button className="btn-sm" onClick=${() => update((d) => {
          d.roleWeights.push({ roleId: 'ROLE_' + (d.roleWeights.length + 1), componentWeights: Object.fromEntries(d.components.map((c) => [c.componentId, 0])) });
        })}>+ Add Role</button>
      ` : null}
    </div>

    <!-- Party Roles -->
    <div className="card">
      <div className="section-header" onClick=${() => toggle('parties')}>
        <h2>Party Roles</h2><span>${open.parties ? '\u25BE' : '\u25B8'}</span>
      </div>
      ${open.parties ? html`
        ${Object.entries(draft.partyRoles ?? {}).map(([party, roleId]) => html`
          <div key=${party} className="party-row">
            <input type="text" value=${party} onChange=${(e) => update((d) => {
              if (!(party in (d.partyRoles ?? {}))) return;
              const v = d.partyRoles[party]; delete d.partyRoles[party]; d.partyRoles[e.target.value] = v;
            })} />
            <select value=${roleId} onChange=${(e) => update((d) => { if (d.partyRoles) d.partyRoles[party] = e.target.value; })}>
              <option value="">(none)</option>
              ${roleIds.map((id) => html`<option key=${id} value=${id}>${id}</option>`)}
            </select>
            <button className="btn-sm danger" onClick=${() => update((d) => { if (d.partyRoles) delete d.partyRoles[party]; })}>Remove</button>
          </div>
        `)}
        <button className="btn-sm" onClick=${() => update((d) => {
          d.partyRoles = d.partyRoles || {};
          d.partyRoles['PARTY_' + (Object.keys(d.partyRoles).length + 1)] = d.defaultRoleId || d.roleWeights[0]?.roleId || '';
        })}>+ Add Party</button>
      ` : null}
    </div>

    <!-- Interaction Types -->
    <div className="card">
      <div className="section-header" onClick=${() => toggle('types')}>
        <h2>Interaction Types & Rules</h2><span>${open.types ? '\u25BE' : '\u25B8'}</span>
      </div>
      ${open.types ? html`
        ${draft.interactionTypes.map((itype, ti) => html`
          <div key=${ti} className="sub-card">
            <div className="field-row">
              <div className="field"><label>Type ID</label><input type="text" value=${itype.interactionTypeId} onChange=${(e) => update((d) => { const t = d.interactionTypes[ti]; if (t) t.interactionTypeId = e.target.value; })} /></div>
              <div className="field"><label>Description</label><input type="text" value=${itype.description} onChange=${(e) => update((d) => { const t = d.interactionTypes[ti]; if (t) t.description = e.target.value; })} /></div>
            </div>
            <h4>Rating Rules</h4>
            ${itype.ratingRules.map((rule, ri) => html`
              <div key=${ri} className="rule-card">
                <div className="field-row">
                  <div className="field">
                    <label>Component</label>
                    <select value=${rule.componentId} onChange=${(e) => update((d) => { const r = d.interactionTypes[ti]?.ratingRules?.[ri]; if (r) r.componentId = e.target.value; })}>
                      <option value="">(none)</option>
                      ${componentIds.map((id) => html`<option key=${id} value=${id}>${id}</option>`)}
                    </select>
                  </div>
                  <div className="field"><label>Field</label><input type="text" value=${rule.conditionField} onChange=${(e) => update((d) => { const r = d.interactionTypes[ti]?.ratingRules?.[ri]; if (r) r.conditionField = e.target.value; })} /></div>
                  <div className="field">
                    <label>Operator</label>
                    <select value=${rule.conditionOperator} onChange=${(e) => update((d) => { const r = d.interactionTypes[ti]?.ratingRules?.[ri]; if (r) r.conditionOperator = e.target.value; })}>
                      ${CONDITION_OPS.map((op) => html`<option key=${op} value=${op}>${op}</option>`)}
                    </select>
                  </div>
                  <div className="field"><label>Value</label><input type="number" value=${rule.conditionValue} onFocus=${(e) => e.target.select()} onChange=${(e) => update((d) => { const r = d.interactionTypes[ti]?.ratingRules?.[ri]; if (r) r.conditionValue = e.target.value; })} /></div>
                  <div className="field"><label>Rating</label><input type="number" value=${rule.assignedRating} onFocus=${(e) => e.target.select()} onChange=${(e) => update((d) => { const r = d.interactionTypes[ti]?.ratingRules?.[ri]; if (r) r.assignedRating = e.target.value; })} /></div>
                </div>
                <button className="btn-sm danger" onClick=${() => update((d) => { d.interactionTypes[ti]?.ratingRules.splice(ri, 1); })}>Remove Rule</button>
              </div>
            `)}
            <div className="btn-group">
              <button className="btn-sm" onClick=${() => update((d) => {
                const t = d.interactionTypes[ti]; if (!t) return;
                t.ratingRules.push({ componentId: d.components[0]?.componentId || '', conditionField: '', conditionOperator: 'EQ', conditionValue: 0, assignedRating: 70 });
              })}>+ Add Rule</button>
              <button className="btn-sm danger" onClick=${() => update((d) => { d.interactionTypes.splice(ti, 1); })}>Remove Type</button>
            </div>
          </div>
        `)}
        <button className="btn-sm" onClick=${() => update((d) => {
          d.interactionTypes.push({ interactionTypeId: 'TYPE_' + (d.interactionTypes.length + 1), description: '', ratingRules: [] });
        })}>+ Add Interaction Type</button>
      ` : null}
    </div>
  `;
}

// ─── Deploy ──────────────────────────────────────────────────────────────────

function DeployPage({ contracts, notify }) {
  const [activeConfig, setActiveConfig] = useState(null);
  const defs = contracts.filter((c) => !c.isConfigTemplate);

  useEffect(() => { api.config().then(setActiveConfig).catch(() => {}); }, []);

  const autoFields = (def) =>
    def.templateId === 'CompletedInteraction' && activeConfig?.version != null
      ? { configVersion: activeConfig.version }
      : {};

  return html`
    <div className="page-header">
      <h1>Deploy Contracts</h1>
    </div>
    <div className="grid-2">
      ${defs.map((def) => html`<${ContractForm} key=${def.templateId} def=${def} notify=${notify} autoFields=${autoFields(def)} activeConfig=${activeConfig} />`)}
    </div>
  `;
}

function ContractForm({ def, notify, autoFields = {}, activeConfig = null }) {
  const [fields, setFields] = useState(() => fieldState(def));
  const [extras, setExtras] = useState({});
  const [busy, setBusy]     = useState(false);

  const set = (key, val) => setFields((prev) => ({ ...prev, [key]: val }));

  // Initialise fields and extras from the active config
  const initFromConfig = (config) => {
    const fieldUp   = { ...fieldState(def) };
    const extrasUp  = {};
    if (config) {
      const itypes   = config.interactionTypes ?? [];
      const parties  = Object.keys(config.partyRoles ?? {});
      const compIds  = (config.components ?? []).map((c) => c.componentId);

      if (def.fields.find((f) => f.key === 'interactionType') && itypes.length > 0)
        fieldUp.interactionType = itypes[0].interactionTypeId;
      if (def.fields.find((f) => f.key === 'from') && parties.length > 0) fieldUp.from = parties[0];
      if (def.fields.find((f) => f.key === 'to')   && parties.length > 1) fieldUp.to   = parties[1];
      if (def.fields.find((f) => f.key === 'participants'))
        extrasUp.participants = parties.slice(0, 2).length > 0 ? [...parties.slice(0, 2)] : ['', ''];
      if (def.fields.find((f) => f.key === 'componentRatings')) {
        extrasUp.componentRatings = Object.fromEntries(compIds.map((id) => [id, '0']));
        extrasUp.componentRatingsEnabled = Object.fromEntries(compIds.map((id) => [id, true]));
      }
    }
    setFields(fieldUp);
    setExtras(extrasUp);
  };

  useEffect(() => { initFromConfig(activeConfig); }, [activeConfig]);

  // Rebuild outcome fields whenever interactionType changes
  useEffect(() => {
    if (!activeConfig || !def.fields.find((f) => f.key === 'outcome')) return;
    const itype = (activeConfig.interactionTypes ?? []).find((t) => t.interactionTypeId === fields.interactionType);
    const condFields = itype
      ? [...new Set((itype.ratingRules ?? []).map((r) => r.conditionField).filter(Boolean))]
      : [];
    setExtras((prev) => ({
      ...prev,
      outcome: Object.fromEntries(condFields.map((f) => [f, String(prev.outcome?.[f] ?? '0')])),
      outcomeEnabled: Object.fromEntries(condFields.map((f) => [f, prev.outcomeEnabled?.[f] ?? true])),
    }));
  }, [fields.interactionType, activeConfig]);

  const submit = async () => {
    try {
      setBusy(true);
      const extrasKeys = new Set([...Object.keys(extras), ...Object.keys(autoFields)]);
      const trimmedDef = { ...def, fields: def.fields.filter((f) => !extrasKeys.has(f.key)) };
      const base       = buildPayload(trimmedDef, fields);
      const cleanExtras = { ...extras };
      if (cleanExtras.participants) cleanExtras.participants = cleanExtras.participants.filter(Boolean);
      if (cleanExtras.componentRatings && cleanExtras.componentRatingsEnabled) {
        cleanExtras.componentRatings = Object.fromEntries(
          Object.entries(cleanExtras.componentRatings)
            .filter(([id]) => cleanExtras.componentRatingsEnabled[id])
            .map(([id, v]) => [id, toNum(v, 0)])
        );
        delete cleanExtras.componentRatingsEnabled;
      }
      if (cleanExtras.outcome && cleanExtras.outcomeEnabled) {
        cleanExtras.outcome = Object.fromEntries(
          Object.entries(cleanExtras.outcome)
            .filter(([k]) => cleanExtras.outcomeEnabled[k])
            .map(([k, v]) => [k, toNum(v, 0)])
        );
        delete cleanExtras.outcomeEnabled;
      }
      const payload = { ...base, ...cleanExtras, ...autoFields };
      await api.deploy(def.templateId, payload);
      notify(`Deployed ${def.title}`, 'success');
    } catch (e) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const renderField = (f) => {
    if (f.key in autoFields) return null;

    // interactionType → select from config
    if (f.key === 'interactionType' && activeConfig?.interactionTypes?.length > 0) return html`
      <div key=${f.key} className="field">
        <label>interactionType</label>
        <select value=${fields[f.key] ?? ''} onChange=${(e) => set(f.key, e.target.value)}>
          ${activeConfig.interactionTypes.map((t) => html`
            <option key=${t.interactionTypeId} value=${t.interactionTypeId}>${t.interactionTypeId}</option>
          `)}
        </select>
      </div>`;

    // outcome → number inputs derived from selected interaction type rules (optional per-field)
    if (f.key === 'outcome') {
      const outKeys = Object.keys(extras.outcome ?? {});
      return html`
        <div key=${f.key} className="field">
          <label>outcome</label>
          ${outKeys.length === 0
            ? html`<p className="muted" style=${{ marginTop: '4px' }}>Select an interaction type to see outcome fields</p>`
            : html`
              <div className="number-map">
                ${outKeys.map((ok) => {
                  const enabled = extras.outcomeEnabled?.[ok] ?? true;
                  return html`
                    <div key=${ok} className="number-map-item">
                      <label style=${{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input type="checkbox" style=${{ width: 'auto' }} checked=${enabled}
                          onChange=${(e) => setExtras((prev) => ({ ...prev, outcomeEnabled: { ...prev.outcomeEnabled, [ok]: e.target.checked } }))} />
                        ${ok}
                      </label>
                      <input type="number" value=${extras.outcome?.[ok] ?? 0}
                        disabled=${!enabled}
                        onFocus=${(e) => e.target.select()}
                        onChange=${(e) => setExtras((prev) => ({ ...prev, outcome: { ...prev.outcome, [ok]: e.target.value } }))} />
                    </div>`;
                })}
              </div>`}
        </div>`;
    }

    // componentRatings → number inputs per component (optional per-component)
    if (f.key === 'componentRatings' && extras.componentRatings) return html`
      <div key=${f.key} className="field">
        <label>componentRatings</label>
        <div className="number-map">
          ${Object.keys(extras.componentRatings).map((id) => {
            const enabled = extras.componentRatingsEnabled?.[id] ?? true;
            return html`
              <div key=${id} className="number-map-item">
                <label style=${{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="checkbox" style=${{ width: 'auto' }} checked=${enabled}
                    onChange=${(e) => setExtras((prev) => ({ ...prev, componentRatingsEnabled: { ...prev.componentRatingsEnabled, [id]: e.target.checked } }))} />
                  ${id}
                </label>
                <input type="number" min="0" max="100" value=${extras.componentRatings[id] ?? 0}
                  disabled=${!enabled}
                  onFocus=${(e) => e.target.select()}
                  onChange=${(e) => setExtras((prev) => ({ ...prev, componentRatings: { ...prev.componentRatings, [id]: e.target.value } }))} />
              </div>`;
          })}
        </div>
      </div>`;

    // participants → dynamic text list
    if (f.key === 'participants' && extras.participants) return html`
      <div key=${f.key} className="field">
        <label>participants</label>
        ${(extras.participants ?? []).map((p, i) => html`
          <div key=${i} className="sub-field-row">
            <input type="text" value=${p} placeholder="PARTY_ID"
              onChange=${(e) => setExtras((prev) => { const next = [...(prev.participants ?? [])]; next[i] = e.target.value; return { ...prev, participants: next }; })} />
            <button className="btn-sm danger"
              onClick=${() => setExtras((prev) => ({ ...prev, participants: (prev.participants ?? []).filter((_, j) => j !== i) }))}>−</button>
          </div>
        `)}
        <button className="btn-sm" style=${{ marginTop: '6px' }}
          onClick=${() => setExtras((prev) => ({ ...prev, participants: [...(prev.participants ?? []), ''] }))}>+ Add</button>
      </div>`;

    // from / to → select from known parties
    if ((f.key === 'from' || f.key === 'to') && activeConfig?.partyRoles) {
      const parties = Object.keys(activeConfig.partyRoles);
      if (parties.length > 0) return html`
        <div key=${f.key} className="field">
          <label>${f.path}</label>
          <select value=${fields[f.key] ?? ''} onChange=${(e) => set(f.key, e.target.value)}>
            ${parties.map((p) => html`<option key=${p} value=${p}>${p}</option>`)}
          </select>
        </div>`;
    }

    // Default rendering
    const val    = fields[f.key];
    const isJson = f.type === 'object' || f.type === 'array' || f.type === 'numberMap';
    if (f.type === 'boolean') return html`
      <label key=${f.key} className="toggle-label">
        <input type="checkbox" checked=${Boolean(val)} onChange=${(e) => set(f.key, e.target.checked)} />
        ${f.path}
      </label>`;
    return html`
      <div key=${f.key} className="field">
        <label>${f.path}</label>
        ${isJson
          ? html`<textarea rows="3" value=${val} onChange=${(e) => set(f.key, e.target.value)} />`
          : html`<input type=${f.type === 'number' ? 'number' : 'text'} value=${val} onFocus=${f.type === 'number' ? (e) => e.target.select() : undefined} onChange=${(e) => set(f.key, e.target.value)} />`}
      </div>`;
  };

  return html`
    <div className="card">
      <div className="card-header">
        <h2>${def.title}</h2>
        <button className="btn-link" onClick=${() => initFromConfig(activeConfig)}>Reset</button>
      </div>
      ${Object.keys(autoFields).length > 0 ? html`
        <div className="auto-info">
          ${Object.entries(autoFields).map(([k, v]) => html`
            <span key=${k} className="auto-tag">${k}: <strong>${v}</strong></span>
          `)}
        </div>
      ` : null}
      <div className="form">
        ${def.fields.map(renderField)}
      </div>
      <button className="btn" style=${{ width: '100%', marginTop: '14px' }} onClick=${submit} disabled=${busy}>
        ${busy ? 'Deploying...' : `Deploy ${def.title}`}
      </button>
    </div>
  `;
}

// ─── Events ──────────────────────────────────────────────────────────────────

function EventsPage({ notify }) {
  const [events, setEvents]     = useState([]);
  const [expanded, setExpanded] = useState(new Set());

  const refresh = async () => {
    try { setEvents(await api.events()); } catch (e) { notify(e.message, 'error'); }
  };

  useEffect(() => { refresh(); }, []);

  const toggle = (i) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  return html`
    <div className="page-header">
      <h1>Ledger Events</h1>
      <div className="btn-group">
        <span className="muted">${events.length} event${events.length !== 1 ? 's' : ''}</span>
        <button className="btn-sm" onClick=${refresh}>Refresh</button>
      </div>
    </div>
    <div className="card">
      ${events.length === 0
        ? html`<p className="muted">No events recorded yet.</p>`
        : events.map((ev, i) => html`
          <div key=${i} className="event-item">
            <div className="event-header" onClick=${() => toggle(i)}>
              <span className="badge">${ev.templateId || 'Event'}</span>
              ${ev.archived ? html`<span className="badge badge-archived">archived</span>` : null}
              <span className="muted">Offset ${ev.offset ?? i}</span>
              ${ev.createdAt ? html`<span className="muted">${new Date(ev.createdAt).toLocaleString()}</span>` : null}
              <span className="expand-icon">${expanded.has(i) ? '\u25BE' : '\u25B8'}</span>
            </div>
            ${expanded.has(i) ? html`<pre>${pretty(ev)}</pre>` : null}
          </div>
        `)
      }
    </div>
  `;
}

// ─── Credentials ─────────────────────────────────────────────────────────────

function CredentialsPage({ notify }) {
  const [party, setParty]           = useState('AGENT_ALICE');
  const [components, setComponents] = useState('');
  const [vc, setVc]                 = useState(null);
  const [busy, setBusy]             = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    try {
      setBusy(true);
      const disc = components.split(',').map((s) => s.trim()).filter(Boolean);
      const result = await api.issueVC(party, disc);
      setVc(result); notify('Credential issued', 'success');
    } catch (e) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  };

  return html`
    <div className="page-header"><h1>Verifiable Credentials</h1></div>
    <div className="grid-2">
      <div className="card">
        <h2>Issue Credential</h2>
        <form className="form" onSubmit=${submit}>
          <div className="field">
            <label>Party</label>
            <input type="text" value=${party} onChange=${(e) => setParty(e.target.value)} />
          </div>
          <div className="field">
            <label>Disclosed Components <span className="muted">comma-separated, empty = all</span></label>
            <input type="text" value=${components} onChange=${(e) => setComponents(e.target.value)} placeholder="Reliability, Efficiency" />
          </div>
          <div style=${{ marginTop: '8px' }}>
            <button className="btn" type="submit" disabled=${busy}>${busy ? 'Issuing...' : 'Issue VC'}</button>
          </div>
        </form>
      </div>
      ${vc ? html`
        <div className="card">
          <h2>Issued Credential</h2>
          <div style=${{ marginBottom: '10px' }}>
            <span className="muted">ID:</span> ${vc.id}
          </div>
          ${vc.credentialSubject ? html`
            <table>
              <tbody>
                <tr><td className="muted">Party</td><td><strong>${vc.credentialSubject.id}</strong></td></tr>
                <tr><td className="muted">Role</td><td><span className="badge">${vc.credentialSubject.roleId}</span></td></tr>
                <tr><td className="muted">Overall Score</td><td><strong>${vc.credentialSubject.overallScore?.toFixed(1)}</strong></td></tr>
                ${Object.entries(vc.credentialSubject.components || {}).map(([id, c]) => html`
                  <tr key=${id}><td className="muted">${id}</td><td>${c.value?.toFixed(1)} (${c.interactionCount} interactions)</td></tr>
                `)}
              </tbody>
            </table>
          ` : null}
          <details><summary>Raw JSON</summary><pre>${pretty(vc)}</pre></details>
        </div>
      ` : null}
    </div>
  `;
}

// ─── Database ────────────────────────────────────────────────────────────────

function DatabasePage({ notify }) {
  const [configs, setConfigs]   = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [expanded, setExpanded] = useState({});

  const refresh = async () => {
    try {
      const [cfgs, subs] = await Promise.all([api.allConfigs(), api.allSubjects()]);
      setConfigs(cfgs); setSubjects(subs);
    } catch (e) { notify(e.message, 'error'); }
  };

  useEffect(() => { refresh(); }, []);

  const toggle = (key) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  return html`
    <div className="page-header">
      <h1>Database</h1>
      <button className="btn-sm" onClick=${refresh}>Refresh</button>
    </div>

    <!-- reputation_configurations -->
    <div className="card">
      <h2 className="db-title">reputation_configurations <span className="muted">(${configs.length})</span></h2>
      ${configs.length === 0 ? html`<p className="muted">No rows.</p>` : html`
        <div className="db-scroll">
          <table className="db-table">
            <thead>
              <tr><th>config_id</th><th>version</th><th>activation_time</th><th>ledger_offset</th><th>contract_id</th><th>created_at</th><th>payload</th></tr>
            </thead>
            <tbody>
              ${configs.map((c, i) => html`
                <${React.Fragment} key=${i}>
                  <tr>
                    <td>${c.config_id}</td>
                    <td>${c.version}</td>
                    <td>${c.activation_time}</td>
                    <td>${c.ledger_offset}</td>
                    <td className="db-mono">${c.contract_id || '—'}</td>
                    <td>${c.created_at}</td>
                    <td><button className="btn-link" onClick=${() => toggle(`cfg-${i}`)}>${expanded[`cfg-${i}`] ? 'hide' : 'show'}</button></td>
                  </tr>
                  ${expanded[`cfg-${i}`] ? html`<tr><td colSpan="7" className="db-payload"><pre>${pretty(c.payload)}</pre></td></tr>` : null}
                <//>
              `)}
            </tbody>
          </table>
        </div>
      `}
    </div>

    <!-- reputation_subjects -->
    <div className="card">
      <h2 className="db-title">reputation_subjects <span className="muted">(${subjects.length})</span></h2>
      ${subjects.length === 0 ? html`<p className="muted">No rows.</p>` : html`
        <div className="db-scroll">
          <table className="db-table">
            <thead>
              <tr><th>party</th><th>role_id</th><th>overall_score</th><th>last_ledger_offset</th><th>updated_at</th><th>payload</th></tr>
            </thead>
            <tbody>
              ${subjects.map((s, i) => html`
                <${React.Fragment} key=${i}>
                  <tr>
                    <td>${s.party}</td>
                    <td>${s.role_id}</td>
                    <td>${s.overall_score}</td>
                    <td>${s.last_ledger_offset}</td>
                    <td>${s.updated_at}</td>
                    <td><button className="btn-link" onClick=${() => toggle(`sub-${i}`)}>${expanded[`sub-${i}`] ? 'hide' : 'show'}</button></td>
                  </tr>
                  ${expanded[`sub-${i}`] ? html`<tr><td colSpan="6" className="db-payload"><pre>${pretty(s.payload)}</pre></td></tr>` : null}
                <//>
              `)}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

// ─── Mount ───────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')).render(html`<${App} />`);
