import React, { useEffect, useState } from 'https://esm.sh/react@18.2.0';
import {
  buildPayloadFromFields,
  createInitialFieldState,
  getContractDisplayName,
  html,
} from './external-app.shared.js';

export function ContractForm({ definition, autoProcess, onPublish, addLog }) {
  const contractName = getContractDisplayName(definition);
  const [fieldState, setFieldState] = useState(() => createInitialFieldState(definition));
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setFieldState(createInitialFieldState(definition));
  }, [definition]);

  const handleLoadSample = () => {
    setFieldState(createInitialFieldState(definition));
  };

  const handleChange = (key, value) => {
    setFieldState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      const payload = buildPayloadFromFields(definition, fieldState);
      await onPublish(definition.templateId, payload, autoProcess);
      addLog(`Published ${contractName}`, payload);
    } catch (error) {
      addLog(`Failed to publish ${contractName}`, { error: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return html`
    <article className="panel">
      <div className="panel-head">
        <h2>Deploy <code>${contractName}</code></h2>
        <button className="ghost" onClick=${handleLoadSample}>Load Sample</button>
      </div>

      <div className="form-block">
        ${definition.fields.map((field) => {
          const value = fieldState[field.key];

          if (field.type === 'boolean') {
            return html`
              <label key=${field.key} className="inline-field">
                <span>${field.path}</span>
                <input
                  type="checkbox"
                  checked=${Boolean(value)}
                  onChange=${(event) => handleChange(field.key, event.target.checked)}
                />
              </label>
            `;
          }

          const isStructured = field.type === 'object' || field.type === 'array' || field.type === 'numberMap';

          return html`
            <label key=${field.key}>${field.path} (${field.type})</label>
            ${isStructured
              ? html`
                  <textarea
                    rows=${6}
                    value=${value}
                    onChange=${(event) => handleChange(field.key, event.target.value)}
                  />
                `
              : html`
                  <input
                    type=${field.type === 'number' ? 'number' : 'text'}
                    value=${value}
                    onChange=${(event) => handleChange(field.key, event.target.value)}
                  />
                `}
          `;
        })}
      </div>

      <button onClick=${handleSubmit} disabled=${isSubmitting}>
        ${isSubmitting ? 'Deploying...' : 'Deploy Contract'}
      </button>
    </article>
  `;
}
