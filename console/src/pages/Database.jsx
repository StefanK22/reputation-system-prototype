import { useState, useEffect } from 'react';
import { useLedger } from '../LedgerContext.jsx';
import { getAllSubjects, getAllConfigurations } from '../api/reputation.js';

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function ComponentsTable({ components }) {
  if (!components?.length) return <p className="muted">No components.</p>;
  return (
    <table>
      <thead>
        <tr><th>Component ID</th><th>Description</th><th>Value</th><th>Interactions</th></tr>
      </thead>
      <tbody>
        {components.map((c) => (
          <tr key={c.id}>
            <td>{c.componentId}</td>
            <td>{c.description || '—'}</td>
            <td>{c.value}</td>
            <td>{c.interactionCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ConfigDetail({ c }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 0' }}>

      <section>
        <h4 style={{ margin: '0 0 6px' }}>System Parameters</h4>
        <table style={{ width: 'auto' }}>
          <tbody>
            <tr><td style={{ paddingRight: 24, color: '#666' }}>Score Floor</td><td>{c.systemParameters?.reputationScoreFloor ?? '—'}</td></tr>
            <tr><td style={{ paddingRight: 24, color: '#666' }}>Score Ceiling</td><td>{c.systemParameters?.reputationScoreCeiling ?? '—'}</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h4 style={{ margin: '0 0 6px' }}>Components ({c.components?.length ?? 0})</h4>
        {c.components?.length ? (
          <table>
            <thead><tr><th>Component ID</th><th>Description</th><th>Initial Value</th></tr></thead>
            <tbody>
              {c.components.map((comp) => (
                <tr key={comp.componentId}>
                  <td>{comp.componentId}</td>
                  <td>{comp.description || '—'}</td>
                  <td>{comp.initialValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">None.</p>}
      </section>

      <section>
        <h4 style={{ margin: '0 0 6px' }}>Role Weights ({c.roleWeights?.length ?? 0})</h4>
        {c.roleWeights?.length ? (
          <table>
            <thead>
              <tr>
                <th>Role ID</th>
                {c.components?.map((comp) => <th key={comp.componentId}>{comp.componentId}</th>)}
              </tr>
            </thead>
            <tbody>
              {c.roleWeights.map((rw) => (
                <tr key={rw.roleId}>
                  <td><span className="tag">{rw.roleId}</span></td>
                  {c.components?.map((comp) => (
                    <td key={comp.componentId} className="muted">{rw.componentWeights?.[comp.componentId] ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">None.</p>}
      </section>

      <section>
        <h4 style={{ margin: '0 0 6px' }}>Interaction Types ({c.interactionTypes?.length ?? 0})</h4>
        {c.interactionTypes?.length ? (
          <table>
            <thead><tr><th>Type ID</th><th>Description</th><th>Rating Rules</th></tr></thead>
            <tbody>
              {c.interactionTypes.map((it) => (
                <tr key={it.interactionTypeId}>
                  <td>{it.interactionTypeId}</td>
                  <td>{it.description || '—'}</td>
                  <td className="muted">
                    {it.ratingRules?.map((r, i) => (
                      <div key={i}>{r.componentId}: {r.conditionField} {r.conditionComparator} {r.conditionValue} → {r.ratingValue}</div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">None.</p>}
      </section>

    </div>
  );
}

export default function Database() {
  const ledger = useLedger();
  const [tab, setTab]                   = useState('subjects');
  const [subjects, setSubjects]         = useState([]);
  const [configurations, setConfigurations] = useState([]);
  const [expanded, setExpanded]         = useState(new Set());
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);

  useEffect(() => {
    Promise.all([
      getAllSubjects(),
      getAllConfigurations(),
    ])
      .then(([s, cfg]) => { setSubjects(s ?? []); setConfigurations(cfg ?? []); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [ledger]);

  function toggleExpand(party) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(party) ? next.delete(party) : next.add(party);
      return next;
    });
  }

  if (loading) return <p className="muted">Loading...</p>;
  if (error)   return <p className="error">{error}</p>;

  return (
    <>
      <h1>Database</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['subjects', 'configurations'].map((t) => (
          <button key={t} className={tab === t ? 'primary' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'subjects' && (
        <>
          <h2>Subjects ({subjects.length})</h2>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Party</th>
                <th>Role</th>
                <th>Score</th>
                <th>Components</th>
                <th>Contract ID</th>
                <th>Created</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <>
                  <tr key={s.party}>
                    <td>
                      <button onClick={() => toggleExpand(s.party)}>
                        {expanded.has(s.party) ? '▼' : '▶'}
                      </button>
                    </td>
                    <td>
                      <div>{s.party.split('::')[0]}</div>
                      <div className="party">{s.party}</div>
                    </td>
                    <td><span className="tag">{s.roleId || '—'}</span></td>
                    <td>{typeof s.overallScore === 'number' ? s.overallScore.toFixed(2) : '—'}</td>
                    <td className="muted">{s.components?.length ?? 0}</td>
                    <td className="party">{s.contractId || '—'}</td>
                    <td className="muted">{fmt(s.createdAt)}</td>
                    <td className="muted">{fmt(s.updatedAt)}</td>
                  </tr>
                  {expanded.has(s.party) && (
                    <tr key={s.party + '-components'}>
                      <td colSpan={9} style={{ paddingLeft: 32, background: 'var(--bg-subtle, #f8f8f8)' }}>
                        <ComponentsTable components={s.components} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </>
      )}

      {tab === 'configurations' && (
        <>
          <h2>Configurations ({configurations.length})</h2>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>ID</th>
                <th>Config ID</th>
                <th>Version</th>
                <th>Activation Time</th>
                <th>Contract ID</th>
              </tr>
            </thead>
            <tbody>
              {configurations.map((c) => (
                <>
                  <tr key={c.id}>
                    <td>
                      <button onClick={() => toggleExpand('cfg-' + c.id)}>
                        {expanded.has('cfg-' + c.id) ? '▼' : '▶'}
                      </button>
                    </td>
                    <td className="muted">{c.id}</td>
                    <td>{c.configId}</td>
                    <td>{c.version}</td>
                    <td className="muted">{fmt(c.activationTime)}</td>
                    <td className="party">{c.contractId || '—'}</td>
                  </tr>
                  {expanded.has('cfg-' + c.id) && (
                    <tr key={'cfg-' + c.id + '-detail'}>
                      <td colSpan={6} style={{ paddingLeft: 32, background: 'var(--bg-subtle, #f8f8f8)' }}>
                        <ConfigDetail c={c} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {!configurations.length && (
                <tr><td colSpan={6} className="muted">No configurations.</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
