import { useState, useEffect } from 'react';
import { useLedger } from '../LedgerContext.jsx';
import { TEMPLATES, REQUIRED_FIELDS } from '../api/contracts.js';

const DEFAULT_PAYLOADS = {
  [TEMPLATES.CONFIG]: {
    operator:         'Operator',
    configId:         'CONFIG-1',
    version:          1,
    activatedAt:      new Date().toISOString(),
    systemParameters: { reputationScoreFloor: 0, reputationScoreCeiling: 100 },
    components:       [{ componentId: 'reliability', description: 'Reliability score', initialValue: 70 }],
    roleWeights:      [{ roleId: 'default', componentWeights: { reliability: 1.0 } }],
    interactionTypes: [],
  },
  [TEMPLATES.INTERACTION]: {
    operator:        'Operator',
    interactionId:   `int-${Date.now()}`,
    interactionType: 'TRANSACTION',
    participants:    [],
    outcome:         {},
    completedAt:     new Date().toISOString(),
    processed:       false,
  },
  [TEMPLATES.FEEDBACK]: {
    operator:      'Operator',
    interactionId: '',
    from:          '',
    to:            '',
    ratings:       {},
    submittedAt:   new Date().toISOString(),
    publicFeedback: false,
  },
  [TEMPLATES.TOKEN]: {
    operator:   'Operator',
    owner:      '',
    score:      0,
    components: {},
    issuedAt:   new Date().toISOString(),
    updatedAt:  new Date().toISOString(),
  },
  [TEMPLATES.PARTY_ROLE]: {
    operator:   'Operator',
    party:      '',
    roleId:     '',
    assignedAt: new Date().toISOString(),
  },
};

export default function Contracts() {
  const ledger = useLedger();
  const [template, setTemplate]     = useState(TEMPLATES.CONFIG);
  const [templateId, setTemplateId] = useState('');
  const [payload, setPayload]       = useState('');
  const [result, setResult]         = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Discover full template IDs from existing ledger contracts
  useEffect(() => {
    ledger.queryAll().then((contracts) => {
      const found = contracts.find((c) => c.templateId === template);
      if (found?.rawTemplateId) setTemplateId(found.rawTemplateId);
      else setTemplateId('');
    }).catch(() => {});
  }, [ledger, template]);

  useEffect(() => {
    setPayload(JSON.stringify(DEFAULT_PAYLOADS[template] ?? {}, null, 2));
    setResult(null);
  }, [template]);

  async function handleSubmit() {
    setSubmitting(true);
    setResult(null);
    try {
      if (!templateId.trim()) throw new Error('Template ID required — paste it from the Ledger page.');
      const parsed = JSON.parse(payload);
      const event  = await ledger.create(templateId.trim(), parsed);
      setResult({ ok: true, event });
    } catch (e) {
      setResult({ ok: false, error: e.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>Deploy Contract</h1>

      <div className="form-row">
        <label>Template</label>
        <select value={template} onChange={(e) => setTemplate(e.target.value)}>
          {Object.values(TEMPLATES).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <label>Full Template ID (auto-filled from ledger)</label>
        <input
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          placeholder="packageId::Module:TemplateName"
        />
      </div>

      <div className="form-row">
        <label>Required fields: {REQUIRED_FIELDS[template]?.join(', ')}</label>
        <textarea rows={16} value={payload} onChange={(e) => setPayload(e.target.value)} />
      </div>

      <button className="primary" onClick={handleSubmit} disabled={submitting}>
        {submitting ? 'Submitting...' : 'Submit to Ledger'}
      </button>

      {result && (
        result.ok
          ? <>
              <p className="success">Contract created.</p>
              <pre>{JSON.stringify(result.event, null, 2)}</pre>
            </>
          : <p className="error">{result.error}</p>
      )}
    </>
  );
}
