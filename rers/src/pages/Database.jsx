import { useState, useEffect, useCallback } from 'react';
import { getAllSubjects, getInterfaceIds, getSystemState } from '../api/reputation.js';
import { Tag, ScoreBar } from '../components/shared.jsx';

const tdSt = { padding: '8px 12px', borderBottom: '1px solid #f0f0f0', color: '#333', verticalAlign: 'middle' };
const thSt = { padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #eee', color: '#999', fontWeight: 'normal', fontSize: 11, textTransform: 'uppercase' };

const COMP_COLORS = { Reliability: '#1a6abf', Responsiveness: '#7a5abf', Accuracy: '#2a7a6a' };

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}


function StatCard({ label, value, sub }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 4, padding: '14px 18px', minWidth: 120 }}>
      <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#bbb', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function ComponentsDetail({ components }) {
  if (!components?.length) return <p style={{ color: '#bbb', fontSize: 12, margin: 0 }}>No components.</p>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={thSt}>Component</th>
          <th style={thSt}>Weight</th>
          <th style={thSt}>Avg Score</th>
          <th style={thSt} title="How many observations contributed to this component's running average">Obs Processed</th>
        </tr>
      </thead>
      <tbody>
        {components.map(c => (
          <tr key={c.id ?? c.componentId}>
            <td style={tdSt}>{c.componentId}</td>
            <td style={{ ...tdSt, color: '#888' }}>{(c.weight * 100).toFixed(0)}%</td>
            <td style={tdSt}>
              {c.count > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, color: COMP_COLORS[c.componentId] ?? '#333', fontSize: 13 }}>
                    {c.score.toFixed(3)}
                  </span>
                  <ScoreBar value={c.score} color={COMP_COLORS[c.componentId]} height={4} />
                </div>
              ) : <span style={{ color: '#bbb' }}>—</span>}
            </td>
            <td style={{ ...tdSt, color: c.count > 0 ? '#333' : '#bbb' }}>{c.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SubjectRow({ s, expanded, onToggle }) {
  return (
    <>
      <tr
        onClick={onToggle}
        style={{ cursor: 'pointer', background: expanded ? '#f0f6ff' : 'transparent' }}
        onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = '#f7f7f7'; }}
        onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = 'transparent'; }}
      >
        <td style={{ ...tdSt, width: 28, color: '#bbb', fontSize: 11 }}>{expanded ? '▼' : '▶'}</td>
        <td style={tdSt}>
          <div style={{ fontWeight: 500 }}>{s.party.split('::')[0]}</div>
          <div style={{ fontSize: 10, color: '#bbb', wordBreak: 'break-all' }}>{s.party}</div>
        </td>
        <td style={tdSt}><Tag>{s.roleType || '—'}</Tag></td>
        <td style={tdSt}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1a6abf' }}>
              {typeof s.overallScore === 'number' ? (s.overallScore * 100).toFixed(1) : '—'}
            </span>
            {typeof s.overallScore === 'number' && (
              <ScoreBar value={s.overallScore} height={4} />
            )}
          </div>
        </td>
        <td style={{ ...tdSt, color: '#bbb', fontSize: 11 }}>{fmt(s.updatedAt)}</td>
        <td style={{ ...tdSt, color: '#bbb', fontSize: 11 }}>{fmt(s.createdAt)}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} style={{ background: '#f7f9ff', padding: '16px 24px 16px 40px', borderBottom: '1px solid #e8e8e8' }}>
            <div style={{ marginBottom: 12 }}>
              <ComponentsDetail components={s.components} />
            </div>
            <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
              <div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#bbb', letterSpacing: '0.07em', marginBottom: 3 }}>Role Contract</div>
                <div style={{ fontSize: 10, color: '#999', wordBreak: 'break-all', maxWidth: 340 }}>{s.contractId || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#bbb', letterSpacing: '0.07em', marginBottom: 3 }}>Config Contract</div>
                <div style={{ fontSize: 10, color: '#999', wordBreak: 'break-all', maxWidth: 340 }}>{s.configContractId || '—'}</div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 28 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: open ? 14 : 0, userSelect: 'none' }}
      >
        <span style={{ fontSize: 11, color: '#bbb' }}>{open ? '▼' : '▶'}</span>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</h2>
      </div>
      {open && children}
    </div>
  );
}

export default function Database() {
  const [subjects,     setSubjects]     = useState([]);
  const [systemState,  setSystemState]  = useState(null);
  const [interfaceIds, setInterfaceIds] = useState(null);
  const [expanded,     setExpanded]     = useState(new Set());
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [subjects, state, ids] = await Promise.all([
        getAllSubjects(),
        getSystemState().catch(() => null),
        getInterfaceIds().catch(() => null),
      ]);
      setSubjects(subjects ?? []);
      setSystemState(state);
      setInterfaceIds(ids);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleExpand(party) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(party) ? next.delete(party) : next.add(party);
      return next;
    });
  }

  const agentCount = subjects.filter(s => s.roleType === 'Agent').length;
  const buyerCount = subjects.filter(s => s.roleType === 'Buyer').length;

  if (loading) return <div className="page-scroll"><p className="muted">Loading...</p></div>;
  if (error)   return <div className="page-scroll"><p className="error">{error}</p></div>;

  return (
    <div className="page-scroll" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Database</h1>
        <button onClick={load}>Refresh</button>
      </div>

      {/* ── Engine status ── */}
      <Section title="Engine Status">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <StatCard label="Ledger Offset" value={systemState?.ledgerOffset ?? '—'} sub="last processed tx" />
          <StatCard label="Subjects"      value={subjects.length} sub={`${agentCount} agents · ${buyerCount} buyers`} />
        </div>
      </Section>

      {/* ── Subjects ── */}
      <Section title={`Subjects (${subjects.length})`}>
        {subjects.length === 0 ? (
          <p className="muted">No subjects in the database.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={thSt}></th>
                <th style={thSt}>Party</th>
                <th style={thSt}>Role</th>
                <th style={thSt}>Score</th>
                <th style={thSt}>Updated</th>
                <th style={thSt}>Created</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map(s => (
                <SubjectRow
                  key={s.party}
                  s={s}
                  expanded={expanded.has(s.party)}
                  onToggle={() => toggleExpand(s.party)}
                />
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* ── Debug info ── */}
      <Section title="Debug Info" defaultOpen={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div>
            <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Interface IDs</div>
            {interfaceIds ? (
              <table>
                <thead>
                  <tr>
                    <th style={thSt}>Interface</th>
                    <th style={thSt}>Package-qualified ID</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(interfaceIds).map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ ...tdSt, fontWeight: 500, textTransform: 'capitalize' }}>{k}</td>
                      <td style={{ ...tdSt, fontFamily: 'monospace', fontSize: 11, color: '#555', wordBreak: 'break-all' }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="muted">Unavailable.</p>}
          </div>

          <div>
            <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Raw System State</div>
            <pre style={{ background: '#f5f5f5', border: '1px solid #eee', borderRadius: 3, padding: 12, fontSize: 11, color: '#555', overflowX: 'auto', margin: 0 }}>
              {JSON.stringify(systemState, null, 2)}
            </pre>
          </div>

        </div>
      </Section>
    </div>
  );
}
