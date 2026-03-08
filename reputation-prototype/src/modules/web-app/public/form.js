import React, { useEffect, useState } from 'https://esm.sh/react@18.2.0';
import { html, initialFieldState, buildPayload } from './shared.js';

export function ContractForm({ definition, autoProcess, onPublish, addLog }) {
  const [fields, setFields] = useState(() => initialFieldState(definition));
  const [busy,   setBusy]   = useState(false);

  useEffect(() => { setFields(initialFieldState(definition)); }, [definition]);

  const handleChange = (key, value) => setFields((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    try {
      setBusy(true);
      const payload = buildPayload(definition, fields);
      await onPublish(definition.templateId, payload, autoProcess);
      addLog(`Published ${definition.title}`, payload);
    } catch (e) {
      addLog(`Failed to publish ${definition.title}`, { error: e.message });
    } finally {
      setBusy(false);
    }
  };

  return html`
    <article className="panel">
      <div className="panel-head">
        <h2>Deploy <code>${definition.title}</code></h2>
        <button className="ghost" onClick=${() => setFields(initialFieldState(definition))}>Load Sample</button>
      </div>

      <div className="form-block">
        ${definition.fields.map((f) => {
          const value       = fields[f.key];
          const isStructured = f.type === 'object' || f.type === 'array' || f.type === 'numberMap';

          if (f.type === 'boolean') return html`
            <label key=${f.key} className="inline-field">
              <span>${f.path}</span>
              <input type="checkbox" checked=${Boolean(value)} onChange=${(e) => handleChange(f.key, e.target.checked)} />
            </label>`;

          return html`
            <label key=${f.key}>${f.path} (${f.type})</label>
            ${isStructured
              ? html`<textarea rows=${6} value=${value} onChange=${(e) => handleChange(f.key, e.target.value)} />`
              : html`<input type=${f.type === 'number' ? 'number' : 'text'} value=${value} onChange=${(e) => handleChange(f.key, e.target.value)} />`}
          `;
        })}
      </div>

      <button onClick=${handleSubmit} disabled=${busy}>${busy ? 'Deploying…' : 'Deploy Contract'}</button>
    </article>
  `;
}