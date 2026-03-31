import { useState, useEffect } from 'react';
import { useLedger } from '../LedgerContext.jsx';
import { getConfig } from '../api/reputation.js';

export default function Config() {
  const ledger = useLedger();
  const [config, setConfig]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [editing, setEditing]     = useState(false);
  const [draft, setDraft]         = useState('');
  const [templateId, setTemplateId] = useState('');
  const [result, setResult]       = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      getConfig(),
      ledger.queryAll().then((cs) => cs.find((c) => c.templateId === 'ReputationConfiguration')),
    ])
      .then(([cfg, contract]) => {
        setConfig(cfg);
        setDraft(JSON.stringify(cfg, null, 2));
        if (contract?.rawTemplateId) setTemplateId(contract.rawTemplateId);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [ledger]);

  async function handleDeploy() {
    setSubmitting(true);
    setResult(null);
    try {
      if (!templateId.trim()) throw new Error('Template ID is required — paste it from the Ledger page.');
      const payload = JSON.parse(draft);
      const event   = await ledger.create(templateId.trim(), payload);
      setResult({ ok: true, event });
      setEditing(false);
    } catch (e) {
      setResult({ ok: false, error: e.message });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="muted">Loading...</p>;
  if (error)   return <p className="error">{error}</p>;
  if (!config) return <p className="muted">No active config.</p>;

  return (
    <>
      <h1>Configuration</h1>
      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">Config ID</div>
          <div className="stat-value">{config.configId}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Version</div>
          <div className="stat-value">{config.version}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Activated</div>
          <div className="stat-value" style={{ fontSize: 13 }}>
            {new Date(config.activatedAt).toLocaleString()}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => { setEditing(!editing); setResult(null); }}>
          {editing ? 'Cancel' : 'Edit & Redeploy'}
        </button>
      </div>

      {editing ? (
        <>
          <div className="form-row">
            <label>Full Template ID (auto-filled if a contract exists on ledger)</label>
            <input value={templateId} onChange={(e) => setTemplateId(e.target.value)} placeholder="packageId::Module:ReputationConfiguration" />
          </div>
          <div className="form-row">
            <label>Payload (JSON)</label>
            <textarea rows={20} value={draft} onChange={(e) => setDraft(e.target.value)} />
          </div>
          <button className="primary" onClick={handleDeploy} disabled={submitting}>
            {submitting ? 'Deploying...' : 'Deploy to Ledger'}
          </button>
          {result && (
            result.ok
              ? <p className="success">Deployed — contract {result.event.contractId}</p>
              : <p className="error">{result.error}</p>
          )}
        </>
      ) : (
        <>
          <h2>System Parameters</h2>
          <table>
            <tbody>
              <tr><td>Score Floor</td>   <td>{config.systemParameters?.reputationScoreFloor}</td></tr>
              <tr><td>Score Ceiling</td> <td>{config.systemParameters?.reputationScoreCeiling}</td></tr>
            </tbody>
          </table>

          <h2>Components ({config.components?.length ?? 0})</h2>
          <table>
            <thead><tr><th>ID</th><th>Description</th><th>Initial Value</th></tr></thead>
            <tbody>
              {config.components?.map((c) => (
                <tr key={c.componentId}>
                  <td>{c.componentId}</td>
                  <td className="muted">{c.description}</td>
                  <td>{c.initialValue}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Role Weights ({config.roleWeights?.length ?? 0})</h2>
          <table>
            <thead><tr><th>Role</th><th>Weights</th></tr></thead>
            <tbody>
              {config.roleWeights?.map((r) => (
                <tr key={r.roleId}>
                  <td>{r.roleId}</td>
                  <td className="muted">{JSON.stringify(r.componentWeights)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Interaction Types ({config.interactionTypes?.length ?? 0})</h2>
          <table>
            <thead><tr><th>Type</th><th>Description</th><th>Rules</th></tr></thead>
            <tbody>
              {config.interactionTypes?.map((t) => (
                <tr key={t.interactionTypeId}>
                  <td>{t.interactionTypeId}</td>
                  <td className="muted">{t.description}</td>
                  <td className="muted">{t.ratingRules?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
