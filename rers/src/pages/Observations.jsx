import { useState, useEffect } from 'react';
import { useLedger } from '../LedgerContext.jsx';
import { getInterfaceIds } from '../api/reputation.js';
import { OBS_TEMPLATES, OBS_COMP_IDS, OBS_COMP_COLORS, parseObservation } from '../api/observations.js';
import { Tag, ScoreBar } from '../components/shared.jsx';

const tdSt = { padding: '8px 12px', borderBottom: '1px solid #f0f0f0', color: '#333', verticalAlign: 'middle' };
const thSt = { padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #eee', color: '#999', fontWeight: 'normal', fontSize: 11, textTransform: 'uppercase' };

function shortName(party) {
  const s = typeof party === 'string' ? party : String(party ?? '');
  return s.split('::')[0] || '—';
}

function MetricRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0', borderBottom: '1px solid #f5f5f5' }}>
      <span style={{ fontSize: 11, color: '#888' }}>{label}</span>
      <span style={{ fontSize: 11, color: '#333', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function MetricSection({ title, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#bbb', letterSpacing: '0.07em', marginBottom: 5 }}>{title}</div>
      {children}
    </div>
  );
}

function fmtHours(arr) {
  if (!arr || arr.length === 0) return '—';
  return arr.join(', ') + ' h';
}

function fmtInts(arr) {
  if (!arr || arr.length === 0) return '—';
  return arr.join(', ');
}

function AgentMetrics({ p }) {
  return (
    <>
      <MetricSection title="Reliability inputs">
        <MetricRow label="Transaction completed"    value={p.transactionCompleted ? 'Yes' : 'No'} />
        <MetricRow label="Contract voided"          value={p.contractVoided ?? 0} />
        <MetricRow label="Participant additions"    value={p.participantAddition ?? 0} />
        <MetricRow label="Participant removals"     value={p.participantRemoval ?? 0} />
      </MetricSection>
      <MetricSection title="Responsiveness inputs">
        <MetricRow label="Doc evaluation times"     value={fmtHours(p.documentEvaluationTimes)} />
        <MetricRow label="Contract signing times"   value={fmtHours(p.contractSigningTimes)} />
      </MetricSection>
      <MetricSection title="Accuracy inputs">
        <MetricRow label="Proposals approved"       value={p.proposalApprovedCount ?? 0} />
        <MetricRow label="Proposals rejected"       value={p.proposalRejectedCount ?? 0} />
      </MetricSection>
    </>
  );
}

function BuyerMetrics({ p }) {
  return (
    <>
      <MetricSection title="Reliability inputs">
        <MetricRow label="Docs uploaded"             value={p.uploadedDocs ?? 0} />
        <MetricRow label="Docs approved"             value={p.approvedDocs ?? 0} />
      </MetricSection>
      <MetricSection title="Responsiveness inputs">
        <MetricRow label="Contract signing times"    value={fmtHours(p.contractSigningTimes)} />
        <MetricRow label="Upload after rejection"    value={fmtHours(p.uploadAfterRejectionTimes)} />
        <MetricRow label="Proposal response times"   value={fmtHours(p.proposalResponseTimes)} />
      </MetricSection>
      <MetricSection title="Accuracy inputs">
        <MetricRow label="Attempts per approved doc" value={fmtInts(p.attemptsPerApprovedDoc)} />
      </MetricSection>
    </>
  );
}

// compact=true skips the header and subject avatar (used when embedded inside a card that already shows them)
export function ObservationDetail({ obs, onClose, compact = false }) {
  return (
    <div>
      {!compact && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 13, fontWeight: 'normal', margin: 0, color: '#1a1a1a' }}>
              Observation Detail
            </h2>
            {onClose && (
              <button onClick={onClose} style={{ background: '#f5f5f5', border: '1px solid #ddd', color: '#333', padding: '3px 9px', fontSize: 11, cursor: 'pointer', borderRadius: 3, fontFamily: 'inherit' }}>✕</button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e8f0fb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#1a6abf', fontWeight: 700, flexShrink: 0 }}>
              {shortName(obs.subject)[0]?.toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 500 }}>{shortName(obs.subject)}</div>
              <div style={{ fontSize: 11, color: '#bbb' }}>{obs.interactionId}</div>
            </div>
            <Tag>{obs.role}</Tag>
          </div>
        </>
      )}

      {/* Component scores */}
      <div style={{ marginBottom: 16 }}>
        {OBS_COMP_IDS.map(id => {
          const val = obs.components[id];
          if (val === undefined) return null;
          const color = OBS_COMP_COLORS[id];
          return (
            <div key={id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 12 }}>{id}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color }}>{(val * 100).toFixed(1)}</span>
              </div>
              <ScoreBar value={val} color={color} height={6} />
            </div>
          );
        })}
      </div>

      {/* Raw input metrics */}
      <div style={{ borderTop: '1px solid #eee', paddingTop: 12 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#999', letterSpacing: '0.08em', marginBottom: 10 }}>Input Metrics</div>
        {obs.templateId === 'AgentObservation'
          ? <AgentMetrics p={obs.payload} />
          : <BuyerMetrics p={obs.payload} />
        }
      </div>

      <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 10, display: 'flex', gap: 24 }}>
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#999', letterSpacing: '0.08em', marginBottom: 4 }}>Recorded</div>
          <div style={{ fontSize: 11, color: '#888' }}>
            {obs.recordedAt ? new Date(obs.recordedAt).toLocaleString() : '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#999', letterSpacing: '0.08em', marginBottom: 4 }}>Processed</div>
          <Tag color={obs.processed ? '#2a7a6a' : '#999'}>{obs.processed ? 'Yes' : 'No'}</Tag>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#999', letterSpacing: '0.08em', marginBottom: 4 }}>Contract ID</div>
        <div style={{ fontSize: 10, color: '#bbb', wordBreak: 'break-all' }}>{obs.contractId}</div>
      </div>
    </div>
  );
}

export default function Observations() {
  const ledger = useLedger();
  const [observations, setObservations] = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const interfaceIds = await getInterfaceIds().catch(() => ({}));
      const contracts    = await ledger.queryAll(undefined, interfaceIds);

      const obs = contracts
        .filter(c => c.templateId in OBS_TEMPLATES)
        .map(parseObservation)
        .sort((a, b) => new Date(b.recordedAt || 0) - new Date(a.recordedAt || 0));

      setObservations(obs);
      setSelected(prev => prev ? (obs.find(o => o.contractId === prev.contractId) ?? null) : null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [ledger]);

  if (loading) return (
    <div className="page-with-panel">
      <div style={{ flex: 1, padding: 24 }}><p className="muted">Loading...</p></div>
    </div>
  );
  if (error) return (
    <div className="page-with-panel">
      <div style={{ flex: 1, padding: 24 }}><p className="error">{error}</p></div>
    </div>
  );

  return (
    <div className="page-with-panel">

      {/* ── Table ── */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1 style={{ marginBottom: 0 }}>Observations</h1>
          <button onClick={load}>Refresh</button>
        </div>

        {observations.length === 0 ? (
          <p className="muted">No observations found on the ledger.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={thSt}>Interaction</th>
                <th style={thSt}>Subject</th>
                <th style={thSt}>Role</th>
                <th style={thSt}>Reliability</th>
                <th style={thSt}>Responsiveness</th>
                <th style={thSt}>Accuracy</th>
                <th style={thSt}>Recorded</th>
                <th style={thSt}>Processed</th>
              </tr>
            </thead>
            <tbody>
              {observations.map(o => {
                const isSelected = selected?.contractId === o.contractId;
                return (
                  <tr
                    key={o.contractId}
                    onClick={() => setSelected(isSelected ? null : o)}
                    style={{ cursor: 'pointer', background: isSelected ? '#f0f6ff' : 'transparent' }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f7f7f7'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={tdSt}><span style={{ color: '#1a6abf' }}>{o.interactionId}</span></td>
                    <td style={tdSt}>{shortName(o.subject)}</td>
                    <td style={tdSt}><Tag>{o.role}</Tag></td>
                    {OBS_COMP_IDS.map(id => {
                      const val = o.components[id];
                      return (
                        <td key={id} style={{ ...tdSt, minWidth: 100 }}>
                          {val !== undefined ? (
                            <>
                              <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>{(val * 100).toFixed(0)}</div>
                              <ScoreBar value={val} color={OBS_COMP_COLORS[id]} />
                            </>
                          ) : <span className="muted">—</span>}
                        </td>
                      );
                    })}
                    <td style={{ ...tdSt, color: '#888', fontSize: 11 }}>
                      {o.recordedAt ? new Date(o.recordedAt).toLocaleString() : '—'}
                    </td>
                    <td style={tdSt}>
                      <Tag>{o.processed ? 'processed' : 'pending'}</Tag>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Detail panel ── */}
      {selected && (
        <div className="detail-panel" style={{ width: 320, borderLeft: '1px solid #e8e8e8', padding: 20, background: '#fafafa', overflowY: 'auto', flexShrink: 0 }}>
          <ObservationDetail obs={selected} onClose={() => setSelected(null)} />
        </div>
      )}
    </div>
  );
}
