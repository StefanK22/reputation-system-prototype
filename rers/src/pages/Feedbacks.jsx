import { useState, useEffect } from 'react';
import { useLedger, usePartyCtx } from '../LedgerContext.jsx';
import { getInterfaceIds } from '../api/reputation.js';
import { FEEDBACK_REQUEST_TEMPLATES, FEEDBACK_TEMPLATES } from '../api/contracts.js';
import { optDecimal } from '../api/observations.js';
import { Tag } from '../components/shared.jsx';

const tdSt    = { padding: '8px 12px', borderBottom: '1px solid #f0f0f0', color: '#333', verticalAlign: 'middle' };
const thSt    = { padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #eee', color: '#999', fontWeight: 'normal', fontSize: 11, textTransform: 'uppercase' };
const btnSt   = { background: '#f5f5f5', border: '1px solid #ddd', color: '#333', padding: '6px 14px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', borderRadius: 3 };
const inputSt = { background: '#fafafa', border: '1px solid #ddd', color: '#1a1a1a', padding: '6px 10px', fontSize: 12, fontFamily: 'inherit', borderRadius: 3, width: '100%' };
const labelSt = { color: '#999', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block' };

function shortName(party) {
  const s = typeof party === 'string' ? party : String(party ?? '');
  return s.split('::')[0] || '—';
}

function isExpired(expiresAt) {
  return expiresAt ? new Date(expiresAt) < new Date() : false;
}

function RatingSlider({ label, value, onChange, color }) {
  const pct = value !== null ? Math.round(value * 100) : null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <label style={{ ...labelSt, marginBottom: 0 }}>{label}</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {value !== null && (
            <span style={{ fontSize: 13, fontWeight: 700, color }}>{pct}</span>
          )}
          <button
            onClick={() => onChange(null)}
            style={{ ...btnSt, fontSize: 10, padding: '1px 7px', color: value === null ? '#fff' : '#aaa', background: value === null ? '#aaa' : '#f5f5f5', borderColor: value === null ? '#aaa' : '#ddd' }}
          >N/A</button>
        </div>
      </div>
      <input
        type="range"
        min={0} max={100} step={1}
        value={value !== null ? pct : 50}
        disabled={value === null}
        onChange={e => onChange(Number(e.target.value) / 100)}
        style={{ width: '100%', accentColor: color, opacity: value === null ? 0.3 : 1 }}
      />
      {value !== null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#ccc', marginTop: 2 }}>
          <span>0</span><span>50</span><span>100</span>
        </div>
      )}
    </div>
  );
}

export default function Feedbacks() {
  const ledger = useLedger();
  const { activeParty, parties } = usePartyCtx();

  const [requests,  setRequests]  = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [selected,  setSelected]  = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  // Submit form state
  const [reliability,     setReliability]     = useState(0.5);
  const [responsiveness,  setResponsiveness]  = useState(0.5);
  const [accuracy,        setAccuracy]        = useState(0.5);
  const [submitting,      setSubmitting]      = useState(false);
  const [submitError,     setSubmitError]     = useState(null);
  const [submitSuccess,   setSubmitSuccess]   = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const interfaceIds = await getInterfaceIds().catch(() => ({}));
      const queryParty   = activeParty || undefined;
      const contracts    = await ledger.queryAll(queryParty, interfaceIds);

      const reqs = contracts
        .filter(c => c.templateId in FEEDBACK_REQUEST_TEMPLATES)
        .map(c => ({
          contractId:   c.contractId,
          rawTemplateId: c.rawTemplateId,
          interactionId: c.payload?.interactionId,
          from:          c.payload?.from,
          to:            c.payload?.to,
          requestedAt:   c.payload?.requestedAt,
          expiresAt:     c.payload?.expiresAt,
          expired:       isExpired(c.payload?.expiresAt),
        }))
        .sort((a, b) => new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0));

      const fbs = contracts
        .filter(c => c.templateId in FEEDBACK_TEMPLATES)
        .map(c => ({
          contractId:   c.contractId,
          interactionId: c.payload?.interactionId,
          from:          c.payload?.from,
          to:            c.payload?.to,
          submittedAt:   c.payload?.submittedAt,
          reliability:   optDecimal(c.payload?.reliabilityRating),
          responsiveness: optDecimal(c.payload?.responsivenessRating),
          accuracy:      optDecimal(c.payload?.accuracyRating),
        }))
        .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

      // If viewing as a specific party, only show requests/feedbacks where that party is 'from'
      const filtered = activeParty
        ? reqs.filter(r => r.from === activeParty)
        : reqs;
      const filteredFbs = activeParty
        ? fbs.filter(f => f.from === activeParty)
        : fbs;

      setRequests(filtered);
      setFeedbacks(filteredFbs);
      setSelected(prev => prev ? (filtered.find(r => r.contractId === prev.contractId) ?? null) : null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [ledger, activeParty]);

  function selectRequest(req) {
    setSelected(req);
    setReliability(0.5);
    setResponsiveness(0.5);
    setAccuracy(0.5);
    setSubmitError(null);
    setSubmitSuccess(false);
  }

  async function handleSubmit() {
    if (!selected) return;
    if (!activeParty) {
      setSubmitError('Select a party to log in as before submitting feedback.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    try {
      await ledger.exercise(
        selected.contractId,
        selected.rawTemplateId,
        'SubmitFeedback',
        {
          reliabilityRating:    reliability,
          responsivenessRating: responsiveness,
          accuracyRating:       accuracy,
          submittedAt:          new Date().toISOString(),
        },
        { actAs: [activeParty] },
      );
      setSubmitSuccess(true);
      await load();
      setSelected(null);
    } catch (e) {
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

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
          <h1 style={{ marginBottom: 0 }}>Feedback Requests</h1>
          <button onClick={load}>Refresh</button>
        </div>

        {requests.length === 0 ? (
          <p className="muted">
            {activeParty
              ? `No pending feedback requests for ${shortName(activeParty)}.`
              : 'No feedback requests found on the ledger.'}
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={thSt}>Interaction</th>
                <th style={thSt}>From</th>
                <th style={thSt}>To (rated party)</th>
                <th style={thSt}>Requested</th>
                <th style={thSt}>Expires</th>
                <th style={thSt}>Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(r => {
                const isSelected = selected?.contractId === r.contractId;
                return (
                  <tr
                    key={r.contractId}
                    onClick={() => selectRequest(isSelected ? null : r)}
                    style={{ cursor: 'pointer', background: isSelected ? '#f5f0ff' : 'transparent' }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f7f7f7'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={tdSt}><span style={{ color: '#7a5abf' }}>{r.interactionId}</span></td>
                    <td style={tdSt}>{shortName(r.from)}</td>
                    <td style={tdSt}>{shortName(r.to)}</td>
                    <td style={{ ...tdSt, color: '#888', fontSize: 11 }}>
                      {r.requestedAt ? new Date(r.requestedAt).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ ...tdSt, color: r.expired ? '#c55' : '#888', fontSize: 11 }}>
                      {r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : '—'}
                    </td>
                    <td style={tdSt}>
                      <Tag color={r.expired ? '#c55' : '#2a7a6a'}>{r.expired ? 'expired' : 'pending'}</Tag>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {/* ── Submitted feedback ── */}
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#1a1a1a' }}>Submitted Feedback</h2>
          {feedbacks.length === 0 ? (
            <p className="muted">
              {activeParty
                ? `No submitted feedback from ${shortName(activeParty)}.`
                : 'No submitted feedback found on the ledger.'}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={thSt}>Interaction</th>
                  <th style={thSt}>From</th>
                  <th style={thSt}>To (rated party)</th>
                  <th style={thSt}>Reliability</th>
                  <th style={thSt}>Responsiveness</th>
                  <th style={thSt}>Accuracy</th>
                  <th style={thSt}>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {feedbacks.map(f => (
                  <tr key={f.contractId}>
                    <td style={tdSt}><span style={{ color: '#7a5abf' }}>{f.interactionId}</span></td>
                    <td style={tdSt}>{shortName(f.from)}</td>
                    <td style={tdSt}>{shortName(f.to)}</td>
                    <td style={{ ...tdSt, color: '#1a6abf' }}>{f.reliability !== null ? Math.round(f.reliability * 100) : <span className="muted">N/A</span>}</td>
                    <td style={{ ...tdSt, color: '#7a5abf' }}>{f.responsiveness !== null ? Math.round(f.responsiveness * 100) : <span className="muted">N/A</span>}</td>
                    <td style={{ ...tdSt, color: '#2a7a6a' }}>{f.accuracy !== null ? Math.round(f.accuracy * 100) : <span className="muted">N/A</span>}</td>
                    <td style={{ ...tdSt, color: '#888', fontSize: 11 }}>
                      {f.submittedAt ? new Date(f.submittedAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Detail / Submit panel ── */}
      {selected && (
        <div className="detail-panel" style={{ width: 320, borderLeft: '1px solid #e8e8e8', padding: 20, background: '#fafafa', overflowY: 'auto', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 13, fontWeight: 'normal', margin: 0, color: '#1a1a1a' }}>
              Submit Feedback
            </h2>
            <button
              onClick={() => setSelected(null)}
              style={{ background: '#f5f5f5', border: '1px solid #ddd', color: '#333', padding: '3px 9px', fontSize: 11, cursor: 'pointer', borderRadius: 3, fontFamily: 'inherit' }}
            >✕</button>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#999', letterSpacing: '0.08em', marginBottom: 4 }}>Interaction</div>
            <div style={{ fontSize: 12, color: '#7a5abf', fontWeight: 500 }}>{selected.interactionId}</div>
          </div>

          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#999', letterSpacing: '0.08em', marginBottom: 4 }}>Rating party</div>
              <div style={{ fontSize: 12 }}>{shortName(selected.from)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#999', letterSpacing: '0.08em', marginBottom: 4 }}>Rated party</div>
              <div style={{ fontSize: 12 }}>{shortName(selected.to)}</div>
            </div>
          </div>

          {selected.expired && (
            <div style={{ background: '#fdf0f0', border: '1px solid #f0c8c8', borderRadius: 3, padding: '8px 12px', marginBottom: 14, fontSize: 11, color: '#a33' }}>
              This feedback request has expired and can no longer be submitted.
            </div>
          )}

          {!selected.expired && (
            <>
              <div style={{ borderTop: '1px solid #eee', paddingTop: 14, marginBottom: 4 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#999', letterSpacing: '0.08em', marginBottom: 12 }}>Ratings (0 – 100)</div>
                <RatingSlider
                  label="Reliability"
                  value={reliability}
                  onChange={setReliability}
                  color="#1a6abf"
                />
                <RatingSlider
                  label="Responsiveness"
                  value={responsiveness}
                  onChange={setResponsiveness}
                  color="#7a5abf"
                />
                <RatingSlider
                  label="Accuracy"
                  value={accuracy}
                  onChange={setAccuracy}
                  color="#2a7a6a"
                />
              </div>

              {submitError && (
                <p className="error" style={{ fontSize: 11, marginBottom: 10 }}>{submitError}</p>
              )}
              {submitSuccess && (
                <p style={{ fontSize: 11, color: '#2a7a6a', marginBottom: 10 }}>Feedback submitted successfully.</p>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting || !activeParty}
                style={{ ...btnSt, width: '100%', background: '#7a5abf', borderColor: '#7a5abf', color: '#fff', fontWeight: 600, padding: '8px 0' }}
              >{submitting ? 'Submitting...' : 'Submit Feedback'}</button>

              {!activeParty && (
                <p style={{ fontSize: 10, color: '#aaa', marginTop: 6, textAlign: 'center' }}>Log in as a party to submit.</p>
              )}
            </>
          )}

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#999', letterSpacing: '0.08em', marginBottom: 4 }}>Contract ID</div>
            <div style={{ fontSize: 10, color: '#bbb', wordBreak: 'break-all' }}>{selected.contractId}</div>
          </div>
        </div>
      )}
    </div>
  );
}
