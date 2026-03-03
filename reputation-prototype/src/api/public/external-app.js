import React, { useEffect, useState } from 'https://esm.sh/react@18.2.0';
import { createRoot } from 'https://esm.sh/react-dom@18.2.0/client';
import htm from 'https://esm.sh/htm@3.1.1';

const html = htm.bind(React.createElement);

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function getByPath(source, path) {
  const keys = path.split('.');
  let current = source;

  for (const key of keys) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

function setByPath(target, path, value) {
  const keys = path.split('.');
  let cursor = target;

  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    if (cursor[key] == null || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }

  cursor[keys[keys.length - 1]] = value;
}

function stringifyFieldValue(value, type) {
  if (type === 'boolean') {
    return Boolean(value);
  }

  if (value == null) {
    if (type === 'object' || type === 'array' || type === 'numberMap') {
      return '';
    }
    return '';
  }

  if (type === 'object' || type === 'array' || type === 'numberMap') {
    return pretty(value);
  }

  return String(value);
}

function parseFieldValue(rawValue, type) {
  if (type === 'boolean') {
    return Boolean(rawValue);
  }

  const text = String(rawValue ?? '').trim();

  if (type === 'number') {
    if (!text) {
      throw new Error('Expected number.');
    }
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
      throw new Error('Expected valid number.');
    }
    return parsed;
  }

  if (type === 'object' || type === 'array' || type === 'numberMap') {
    if (!text) {
      throw new Error('Expected JSON value.');
    }
    const parsed = JSON.parse(text);

    if (type === 'array' && !Array.isArray(parsed)) {
      throw new Error('Expected JSON array.');
    }

    if (type === 'object' && (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed))) {
      throw new Error('Expected JSON object.');
    }

    if (
      type === 'numberMap' &&
      (parsed == null ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed) ||
        !Object.values(parsed).every((item) => typeof item === 'number' && Number.isFinite(item)))
    ) {
      throw new Error('Expected object map with numeric values.');
    }

    return parsed;
  }

  return text;
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, options);
  const rawText = await response.text();
  const body = rawText ? JSON.parse(rawText) : {};

  if (!response.ok) {
    const detail = body.details ? ` (${body.details.join('; ')})` : '';
    throw new Error((body.error || `HTTP ${response.status}`) + detail);
  }

  return body;
}

function createInitialFieldState(definition) {
  return Object.fromEntries(
    definition.fields.map((field) => {
      const fromSample = getByPath(definition.samplePayload, field.path);
      const value = fromSample === undefined ? field.defaultValue : fromSample;
      return [field.key, stringifyFieldValue(value, field.type)];
    })
  );
}

function buildPayloadFromFields(definition, fieldState) {
  const payload = {};

  for (const field of definition.fields) {
    const current = fieldState[field.key];

    if (current === '' || current == null) {
      if (field.defaultValue !== undefined) {
        setByPath(payload, field.path, field.defaultValue);
      }
      continue;
    }

    const parsed = parseFieldValue(current, field.type);
    setByPath(payload, field.path, parsed);
  }

  return payload;
}

function ContractForm({ definition, autoProcess, onPublish, addLog }) {
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
      addLog(`Published ${definition.templateId}`, payload);
    } catch (error) {
      addLog(`Failed to publish ${definition.templateId}`, { error: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return html`
    <article className="panel">
      <div className="panel-head">
        <h2>Deploy <code>${definition.templateId}</code></h2>
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

function App() {
  const [schemaDefinitions, setSchemaDefinitions] = useState([]);
  const [autoProcess, setAutoProcess] = useState(true);
  const [events, setEvents] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [activeConfig, setActiveConfig] = useState(null);
  const [vcPayload, setVcPayload] = useState(null);
  const [vcParty, setVcParty] = useState('AGENT_ALICE');
  const [vcComponents, setVcComponents] = useState('');
  const [logEntries, setLogEntries] = useState([]);

  const addLog = (message, payload = null) => {
    const stamp = new Date().toISOString();
    const lines = [`[${stamp}] ${message}`];
    if (payload != null) {
      lines.push(pretty(payload));
    }

    setLogEntries((prev) => [lines.join('\n'), ...prev].slice(0, 80));
  };

  const refreshViews = async () => {
    const [eventsData, rankingsData, configData] = await Promise.all([
      requestJson('/events'),
      requestJson('/rankings?limit=20'),
      requestJson('/config'),
    ]);

    setEvents(eventsData);
    setRankings(rankingsData);
    setActiveConfig(configData);
  };

  const loadSchema = async () => {
    const definitions = await requestJson('/schema/contracts');
    setSchemaDefinitions(definitions);
  };

  const publishContract = async (templateId, payload, shouldAutoProcess) => {
    const endpoint = `/mock/contracts/${encodeURIComponent(templateId)}?autoProcess=${String(
      shouldAutoProcess
    )}`;

    const result = await requestJson(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    addLog(`Ledger accepted ${templateId}`, result);
    await refreshViews();
  };

  const handleManualProcess = async () => {
    try {
      const result = await requestJson('/engine/process', { method: 'POST' });
      addLog('Processed pending events', result);
      await refreshViews();
    } catch (error) {
      addLog('Manual process failed', { error: error.message });
    }
  };

  const handleVcRequest = async (event) => {
    event.preventDefault();

    try {
      const disclosedComponents = vcComponents
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

      const vc = await requestJson('/vc/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          party: vcParty,
          disclosedComponents,
        }),
      });

      setVcPayload(vc);
      addLog(`Issued VC for ${vcParty}`, vc);
    } catch (error) {
      addLog('VC issuance failed', { error: error.message });
    }
  };

  useEffect(() => {
    (async () => {
      try {
        await loadSchema();
        await refreshViews();
        addLog('React simulator ready');
      } catch (error) {
        addLog('Initialization failed', { error: error.message });
      }
    })();
  }, []);

  return html`
    <main className="page">
      <header className="hero">
        <p className="eyebrow">Reputation Prototype</p>
        <h1>External App Simulator (React)</h1>
        <p className="subtitle">
          Forms are generated from a shared backend schema. Change the schema in one place and both
          API parsing and simulator forms update.
        </p>
      </header>

      <section className="panel controls">
        <label className="inline-field">
          <span>Auto-process in engine</span>
          <input
            type="checkbox"
            checked=${autoProcess}
            onChange=${(event) => setAutoProcess(event.target.checked)}
          />
        </label>
        <button className="secondary" onClick=${handleManualProcess}>Process Pending Events</button>
        <button
          className="secondary"
          onClick=${async () => {
            try {
              await refreshViews();
              addLog('Views refreshed');
            } catch (error) {
              addLog('Refresh failed', { error: error.message });
            }
          }}
        >
          Refresh Views
        </button>
      </section>

      <section className="grid two-col">
        ${schemaDefinitions.map(
          (definition) => html`
            <${ContractForm}
              key=${definition.templateId}
              definition=${definition}
              autoProcess=${autoProcess}
              onPublish=${publishContract}
              addLog=${addLog}
            />
          `
        )}
      </section>

      <section className="grid two-col">
        <article className="panel">
          <div className="panel-head">
            <h2>Ledger Events</h2>
          </div>
          <pre>${pretty(events)}</pre>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Rankings</h2>
          </div>
          <pre>${pretty(rankings)}</pre>
        </article>
      </section>

      <section className="grid two-col">
        <article className="panel">
          <div className="panel-head">
            <h2>Active Configuration</h2>
          </div>
          <pre>${pretty(activeConfig)}</pre>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Request Mock VC</h2>
          </div>
          <form className="form-block" onSubmit=${handleVcRequest}>
            <label>Party</label>
            <input type="text" value=${vcParty} onChange=${(event) => setVcParty(event.target.value)} />
            <label>Disclosed components (comma separated)</label>
            <input
              type="text"
              value=${vcComponents}
              onChange=${(event) => setVcComponents(event.target.value)}
              placeholder="Reliability,Efficiency"
            />
            <button className="secondary" type="submit">Issue VC</button>
          </form>
          <pre>${pretty(vcPayload)}</pre>
        </article>
      </section>

      <section className="panel">
        <h2>Operation Log</h2>
        <pre>${logEntries.join('\n\n')}</pre>
      </section>
    </main>
  `;
}

createRoot(document.getElementById('root')).render(html`<${App} />`);
