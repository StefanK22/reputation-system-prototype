import React, { useEffect, useState } from 'https://esm.sh/react@18.2.0';
import { createRoot } from 'https://esm.sh/react-dom@18.2.0/client';
import { ContractForm } from './form.js';
import { ConfigEditor  } from './editor.js';
import { html, pretty, requestJson } from './shared.js';

function App() {
  const [contracts,   setContracts]   = useState([]);
  const [autoProcess, setAutoProcess] = useState(true);
  const [events,      setEvents]      = useState([]);
  const [rankings,    setRankings]    = useState([]);
  const [activeConfig,setActiveConfig]= useState(null);
  const [vcParty,     setVcParty]     = useState('AGENT_ALICE');
  const [vcComponents,setVcComponents]= useState('');
  const [vcPayload,   setVcPayload]   = useState(null);
  const [log,         setLog]         = useState([]);

  const addLog = (msg, payload = null) => {
    const stamp = new Date().toISOString();
    const lines = [`[${stamp}] ${msg}`, ...(payload != null ? [pretty(payload)] : [])];
    setLog((prev) => [lines.join('\n'), ...prev].slice(0, 80));
  };

  const refresh = async () => {
    const [ev, rk, cfg] = await Promise.all([
      requestJson('/events'),
      requestJson('/rankings?limit=20'),
      requestJson('/config'),
    ]);
    setEvents(ev); setRankings(rk); setActiveConfig(cfg);
  };

  const publish = async (templateId, payload, shouldAutoProcess) => {
    const name     = contracts.find((c) => c.templateId === templateId)?.title ?? templateId;
    const endpoint = `/mock/contracts/${encodeURIComponent(templateId)}?autoProcess=${shouldAutoProcess}`;
    const result   = await requestJson(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    addLog(`Ledger accepted ${name}`, result);
    await refresh();
  };

  const handleManualProcess = async () => {
    try   { addLog('Processed pending events', await requestJson('/engine/process', { method: 'POST' })); await refresh(); }
    catch (e) { addLog('Manual process failed', { error: e.message }); }
  };

  const handleVcRequest = async (event) => {
    event.preventDefault();
    try {
      const vc = await requestJson('/vc/request', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ party: vcParty, disclosedComponents: vcComponents.split(',').map((s) => s.trim()).filter(Boolean) }),
      });
      setVcPayload(vc);
      addLog(`Issued VC for ${vcParty}`, vc);
    } catch (e) { addLog('VC issuance failed', { error: e.message }); }
  };

  useEffect(() => {
    (async () => {
      try {
        const defs = await requestJson('/schema/contracts');
        setContracts(defs);
        await refresh();
        addLog('Simulator ready');
      } catch (e) { addLog('Init failed', { error: e.message }); }
    })();
  }, []);

  const configDef = contracts.find((c) => c.isConfigTemplate);
  const otherDefs = contracts.filter((c) => !c.isConfigTemplate);

  return html`
    <main className="page">
      <header className="hero">
        <p className="eyebrow">Reputation Prototype</p>
        <h1>External App Simulator</h1>
        <p className="subtitle">Forms are generated from the backend contract schema. The config editor loads the active store config and lets you edit roles and interaction types before deploying.</p>
      </header>

      <section className="panel controls">
        <label className="inline-field">
          <span>Auto-process in engine</span>
          <input type="checkbox" checked=${autoProcess} onChange=${(e) => setAutoProcess(e.target.checked)} />
        </label>
        <button className="secondary" onClick=${handleManualProcess}>Process Pending Events</button>
        <button className="secondary" onClick=${async () => { try { await refresh(); addLog('Views refreshed'); } catch (e) { addLog('Refresh failed', { error: e.message }); } }}>Refresh Views</button>
      </section>

      ${configDef ? html`
        <section className="grid one-col">
          <${ConfigEditor}
            definition=${configDef} autoProcess=${autoProcess}
            onPublish=${publish} addLog=${addLog} activeConfig=${activeConfig}
          />
        </section>` : null}

      <section className="grid two-col">
        ${otherDefs.map((def) => html`
          <${ContractForm} key=${def.templateId} definition=${def} autoProcess=${autoProcess} onPublish=${publish} addLog=${addLog} />
        `)}
      </section>

      <section className="grid two-col">
        <article className="panel">
          <div className="panel-head"><h2>Ledger Events</h2></div>
          <pre>${pretty(events)}</pre>
        </article>
        <article className="panel">
          <div className="panel-head"><h2>Rankings</h2></div>
          <pre>${pretty(rankings)}</pre>
        </article>
      </section>

      <section className="grid two-col">
        <article className="panel">
          <div className="panel-head"><h2>Active Configuration</h2></div>
          <pre>${pretty(activeConfig)}</pre>
        </article>
        <article className="panel">
          <div className="panel-head"><h2>Request Mock VC</h2></div>
          <form className="form-block" onSubmit=${handleVcRequest}>
            <label>Party</label>
            <input type="text" value=${vcParty} onChange=${(e) => setVcParty(e.target.value)} />
            <label>Disclosed components (comma separated)</label>
            <input type="text" value=${vcComponents} onChange=${(e) => setVcComponents(e.target.value)} placeholder="Reliability,Efficiency" />
            <button className="secondary" type="submit">Issue VC</button>
          </form>
          <pre>${pretty(vcPayload)}</pre>
        </article>
      </section>

      <section className="panel">
        <h2>Operation Log</h2>
        <pre>${log.join('\n\n')}</pre>
      </section>
    </main>
  `;
}

createRoot(document.getElementById('root')).render(html`<${App} />`);