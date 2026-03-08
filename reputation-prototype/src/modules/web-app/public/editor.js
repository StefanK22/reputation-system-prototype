import React, { useEffect, useState } from 'https://esm.sh/react@18.2.0';
import { html, pretty, clone, toNum, CONDITION_OPERATORS, normalizeConfigDraft, reconcileDraft, serializeDraft } from './shared.js';

export function ConfigEditor({ definition, autoProcess, onPublish, addLog, activeConfig }) {
  const [draft, setDraft] = useState(() => { const d = normalizeConfigDraft(activeConfig, definition); reconcileDraft(d); return d; });
  const [busy,  setBusy]  = useState(false);

  useEffect(() => {
    const d = normalizeConfigDraft(activeConfig, definition);
    reconcileDraft(d);
    setDraft(d);
  }, [activeConfig, definition]);

  const update = (fn) => setDraft((prev) => { const next = clone(prev); fn(next); reconcileDraft(next); return next; });

  const set    = (key, val) => update((d) => { d[key] = val; });
  const setSys = (key, val) => update((d) => { d.systemParameters = d.systemParameters || {}; d.systemParameters[key] = toNum(val, 0); });

  const handleSubmit = async () => {
    try {
      setBusy(true);
      const snap = clone(draft); reconcileDraft(snap);
      const payload = serializeDraft(snap);
      await onPublish(definition.templateId, payload, autoProcess);
      addLog(`Published ${definition.title}`, payload);
    } catch (e) {
      addLog(`Failed to publish ${definition.title}`, { error: e.message });
    } finally {
      setBusy(false);
    }
  };

  const reload = () => { const d = normalizeConfigDraft(activeConfig, definition); reconcileDraft(d); setDraft(d); };

  const roleIds      = draft.roleWeights.map((r) => r.roleId).filter(Boolean);
  const componentIds = draft.components.map((c) => c.componentId).filter(Boolean);
  const snap         = clone(draft); reconcileDraft(snap);

  return html`
    <article className="panel">
      <div className="panel-head">
        <h2>Edit <code>${definition.title}</code></h2>
        <button className="ghost" onClick=${reload}>Reload Active Config</button>
      </div>

      <div className="form-block">

        <!-- 1. Metadata -->
        <div className="section-card">
          <h3>1. Metadata & System</h3>
          ${[['operator', 'text', draft.operator], ['configId', 'text', draft.configId], ['version', 'number', draft.version], ['activationTime', 'text', draft.activationTime]].map(([key, type, val]) => html`
            <label key=${key}>${key}</label>
            <input type=${type} value=${val} onChange=${(e) => set(key, type === 'number' ? toNum(e.target.value, val) : e.target.value)} />
          `)}
          <label>reputationFloor</label>
          <input type="number" value=${draft.systemParameters.reputationFloor}   onChange=${(e) => setSys('reputationFloor',   e.target.value)} />
          <label>reputationCeiling</label>
          <input type="number" value=${draft.systemParameters.reputationCeiling} onChange=${(e) => setSys('reputationCeiling', e.target.value)} />
        </div>

        <!-- 2. Components -->
        <div className="section-card">
          <h3>2. Components</h3>
          <p className="hint">Renaming a component auto-updates all role weights and rating rules.</p>
          ${draft.components.map((comp, i) => html`
            <div key=${`comp-${i}`} className="item-card">
              ${[['componentId', 'text'], ['description', 'text'], ['initialValue', 'number']].map(([key, type]) => html`
                <label key=${key}>${key}</label>
                <input type=${type} value=${comp[key]} onChange=${(e) => update((d) => {
                  const c = d.components[i]; if (!c) return;
                  if (key === 'componentId') {
                    const oldId = c.componentId; const newId = e.target.value; c.componentId = newId;
                    if (oldId !== newId) {
                      d.roleWeights.forEach((r) => { if (oldId in (r.componentWeights ?? {})) { r.componentWeights[newId] = r.componentWeights[oldId]; delete r.componentWeights[oldId]; } });
                      d.interactionTypes.forEach((t) => t.ratingRules.forEach((rule) => { if (rule.componentId === oldId) rule.componentId = newId; }));
                    }
                  } else if (key === 'initialValue') { c.initialValue = toNum(e.target.value, 70); }
                  else { c[key] = e.target.value; }
                })} />
              `)}
              <button className="secondary" onClick=${() => update((d) => {
                const [removed] = d.components.splice(i, 1); if (!removed) return;
                d.roleWeights.forEach((r) => { if (r.componentWeights) delete r.componentWeights[removed.componentId]; });
                d.interactionTypes.forEach((t) => { t.ratingRules = t.ratingRules.filter((r) => r.componentId !== removed.componentId); });
              })}>Remove Component</button>
            </div>
          `)}
          <button className="secondary" onClick=${() => update((d) => {
            const id = `Component${d.components.length + 1}`;
            d.components.push({ componentId: id, description: '', initialValue: 70 });
            d.roleWeights.forEach((r) => { r.componentWeights = r.componentWeights || {}; if (r.componentWeights[id] == null) r.componentWeights[id] = 0; });
          })}>Add Component</button>
        </div>

        <!-- 3. Roles -->
        <div className="section-card">
          <h3>3. Roles & Weights</h3>
          <label>defaultRoleId</label>
          <select value=${draft.defaultRoleId} onChange=${(e) => set('defaultRoleId', e.target.value)}>
            <option value="">(none)</option>
            ${roleIds.map((id) => html`<option key=${id} value=${id}>${id}</option>`)}
          </select>
          ${draft.roleWeights.map((role, ri) => html`
            <div key=${`role-${ri}`} className="item-card">
              <label>roleId</label>
              <input type="text" value=${role.roleId} onChange=${(e) => update((d) => {
                const r = d.roleWeights[ri]; if (!r) return;
                const old = r.roleId; r.roleId = e.target.value;
                if (old && old !== r.roleId) {
                  if (d.defaultRoleId === old) d.defaultRoleId = r.roleId;
                  Object.keys(d.partyRoles ?? {}).forEach((p) => { if (d.partyRoles[p] === old) d.partyRoles[p] = r.roleId; });
                }
              })} />
              ${draft.components.map((comp) => html`
                <div key=${`${ri}-${comp.componentId}`} className="weight-row">
                  <label>${comp.componentId || '(component)'} weight</label>
                  <input type="number" value=${toNum(role.componentWeights?.[comp.componentId], 0)} onChange=${(e) => update((d) => { const r = d.roleWeights[ri]; if (r) { r.componentWeights = r.componentWeights || {}; r.componentWeights[comp.componentId] = toNum(e.target.value, 0); } })} />
                </div>
              `)}
              <button className="secondary" onClick=${() => update((d) => {
                const [removed] = d.roleWeights.splice(ri, 1); if (!removed) return;
                Object.keys(d.partyRoles ?? {}).forEach((p) => { if (d.partyRoles[p] === removed.roleId) delete d.partyRoles[p]; });
                if (d.defaultRoleId === removed.roleId) d.defaultRoleId = d.roleWeights[0]?.roleId || '';
              })}>Remove Role</button>
            </div>
          `)}
          <button className="secondary" onClick=${() => update((d) => {
            d.roleWeights.push({ roleId: `ROLE_${d.roleWeights.length + 1}`, componentWeights: Object.fromEntries(d.components.map((c) => [c.componentId, 0])) });
          })}>Add Role</button>
        </div>

        <!-- 4. Party Roles -->
        <div className="section-card">
          <h3>4. Party Roles</h3>
          ${Object.entries(draft.partyRoles ?? {}).map(([party, roleId]) => html`
            <div key=${party} className="item-row">
              <input type="text" value=${party} onChange=${(e) => update((d) => {
                if (!(party in (d.partyRoles ?? {}))) return;
                const v = d.partyRoles[party]; delete d.partyRoles[party]; d.partyRoles[e.target.value] = v;
              })} />
              <select value=${roleId} onChange=${(e) => update((d) => { if (d.partyRoles) d.partyRoles[party] = e.target.value; })}>
                <option value="">(none)</option>
                ${roleIds.map((id) => html`<option key=${id} value=${id}>${id}</option>`)}
              </select>
              <button className="secondary" onClick=${() => update((d) => { if (d.partyRoles) delete d.partyRoles[party]; })}>Remove</button>
            </div>
          `)}
          <button className="secondary" onClick=${() => update((d) => {
            d.partyRoles = d.partyRoles || {};
            d.partyRoles[`PARTY_${Object.keys(d.partyRoles).length + 1}`] = d.defaultRoleId || d.roleWeights[0]?.roleId || '';
          })}>Add Party Role</button>
        </div>

        <!-- 5. Interaction Types -->
        <div className="section-card">
          <h3>5. Interaction Types & Rules</h3>
          ${draft.interactionTypes.map((itype, ti) => html`
            <div key=${`itype-${ti}`} className="item-card">
              ${[['interactionTypeId', 'text'], ['description', 'text']].map(([key, type]) => html`
                <label key=${key}>${key}</label>
                <input type=${type} value=${itype[key]} onChange=${(e) => update((d) => { const t = d.interactionTypes[ti]; if (t) t[key] = e.target.value; })} />
              `)}
              ${itype.ratingRules.map((rule, ri) => html`
                <div key=${`rule-${ti}-${ri}`} className="item-card nested-card">
                  <label>componentId</label>
                  <select value=${rule.componentId} onChange=${(e) => update((d) => { const r = d.interactionTypes[ti]?.ratingRules?.[ri]; if (r) r.componentId = e.target.value; })}>
                    <option value="">(none)</option>
                    ${componentIds.map((id) => html`<option key=${id} value=${id}>${id}</option>`)}
                  </select>
                  <label>conditionField</label>
                  <input type="text" value=${rule.conditionField} onChange=${(e) => update((d) => { const r = d.interactionTypes[ti]?.ratingRules?.[ri]; if (r) r.conditionField = e.target.value; })} />
                  <label>conditionOperator</label>
                  <select value=${rule.conditionOperator} onChange=${(e) => update((d) => { const r = d.interactionTypes[ti]?.ratingRules?.[ri]; if (r) r.conditionOperator = e.target.value; })}>
                    ${CONDITION_OPERATORS.map((op) => html`<option key=${op} value=${op}>${op}</option>`)}
                  </select>
                  <label>conditionValue</label>
                  <input type="number" value=${rule.conditionValue}  onChange=${(e) => update((d) => { const r = d.interactionTypes[ti]?.ratingRules?.[ri]; if (r) r.conditionValue  = toNum(e.target.value, 0);  })} />
                  <label>assignedRating</label>
                  <input type="number" value=${rule.assignedRating}  onChange=${(e) => update((d) => { const r = d.interactionTypes[ti]?.ratingRules?.[ri]; if (r) r.assignedRating = toNum(e.target.value, 70); })} />
                  <button className="secondary" onClick=${() => update((d) => { d.interactionTypes[ti]?.ratingRules.splice(ri, 1); })}>Remove Rule</button>
                </div>
              `)}
              <button className="secondary" onClick=${() => update((d) => {
                const t = d.interactionTypes[ti]; if (!t) return;
                t.ratingRules.push({ componentId: d.components[0]?.componentId || '', conditionField: '', conditionOperator: 'EQ', conditionValue: 0, assignedRating: 70 });
              })}>Add Rating Rule</button>
              <button className="secondary" onClick=${() => update((d) => { d.interactionTypes.splice(ti, 1); })}>Remove Interaction Type</button>
            </div>
          `)}
          <button className="secondary" onClick=${() => update((d) => {
            d.interactionTypes.push({ interactionTypeId: `TYPE_${d.interactionTypes.length + 1}`, description: '', ratingRules: [] });
          })}>Add Interaction Type</button>
        </div>

      </div>

      <button onClick=${handleSubmit} disabled=${busy}>${busy ? 'Deploying…' : 'Deploy Contract'}</button>

      <h3>Outgoing JSON Preview</h3>
      <pre>${pretty(serializeDraft(snap))}</pre>
    </article>
  `;
}