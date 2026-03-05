import React, { useEffect, useState } from 'https://esm.sh/react@18.2.0';
import { createRoot } from 'https://esm.sh/react-dom@18.2.0/client';
import { ContractForm } from './external-app.contract-form.js';
import { ReputationConfigurationEditor } from './external-app.configuration-editor.js';
import {
  getContractDisplayName,
  html,
  isReputationConfigurationDefinition,
  pretty,
  requestJson,
} from './external-app.shared.js';

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
  const definitionsById = new Map(schemaDefinitions.map((definition) => [definition.templateId, definition]));

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
    const contractName = getContractDisplayName(definitionsById.get(templateId) || { templateId });
    const endpoint = `/mock/contracts/${encodeURIComponent(templateId)}?autoProcess=${String(
      shouldAutoProcess
    )}`;

    const result = await requestJson(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    addLog(`Ledger accepted ${contractName}`, result);
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

  const configurationDefinition = schemaDefinitions.find(
    (definition) => isReputationConfigurationDefinition(definition)
  );
  const otherDefinitions = schemaDefinitions.filter(
    (definition) => !isReputationConfigurationDefinition(definition)
  );

  return html`
    <main className="page">
      <header className="hero">
        <p className="eyebrow">Reputation Prototype</p>
        <h1>External App Simulator (React)</h1>
        <p className="subtitle">
          Forms are generated from a shared backend schema. The configuration editor loads the active
          store config and lets you edit/add roles and interaction types before publishing.
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

      ${configurationDefinition
        ? html`
            <section className="grid one-col">
              <${ReputationConfigurationEditor}
                definition=${configurationDefinition}
                autoProcess=${autoProcess}
                onPublish=${publishContract}
                addLog=${addLog}
                activeConfig=${activeConfig}
              />
            </section>
          `
        : null}

      <section className="grid two-col">
        ${otherDefinitions.map(
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
