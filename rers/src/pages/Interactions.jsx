import { useState, useEffect } from 'react';
import { useLedger } from '../LedgerContext.jsx';
import { Tag, ScoreBar } from '../components/shared.jsx';
import { getInterfaceIds } from '../api/reputation.js';
import { OBS_TEMPLATES, OBS_COMP_IDS, OBS_COMP_COLORS, parseObservation } from '../api/observations.js';
import { INTERACTION_TEMPLATES, ROLE_TEMPLATES, CONFIGURATION_TEMPLATES, KNOWN_MODULE_PATHS } from '../api/contracts.js';
import { ObservationDetail } from './Observations.jsx';

const tdSt   = { padding: '8px 12px', borderBottom: '1px solid #f0f0f0', color: '#333', verticalAlign: 'middle' };
const thSt   = { padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #eee', color: '#999', fontWeight: 'normal', fontSize: 11, textTransform: 'uppercase' };
const btnSt  = { background: '#f5f5f5', border: '1px solid #ddd', color: '#333', padding: '6px 14px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', borderRadius: 3 };
const inputSt = { background: '#fafafa', border: '1px solid #ddd', color: '#1a1a1a', padding: '6px 10px', fontSize: 12, fontFamily: 'inherit', borderRadius: 3, width: '100%' };
const labelSt = { color: '#999', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block' };

const ALL_EVENTS = [
  'DocumentUploaded', 'DocumentApproved', 'DocumentRejectedWithNotes',
  'ContractUploaded', 'ContractSigned', 'ContractVoided',
  'ProposalApproved', 'ProposalRejectedWithNotes',
  'TransactionStateChanged', 'TransactionClosed', 'TransactionCanceled',
  'ParticipantsAdded', 'ParticipantsRemoved',
];

function buildTemplateIdMap(contracts) {
  const map = {};
  contracts.forEach(c => { if (c.rawTemplateId) map[c.templateId] = c.rawTemplateId; });
  const anchor = Object.keys(KNOWN_MODULE_PATHS).find(k => map[k]);
  if (anchor) {
    const pkg = map[anchor].split(':')[0];
    for (const [key, modEntity] of Object.entries(KNOWN_MODULE_PATHS)) {
      if (!map[key]) map[key] = `${pkg}:${modEntity}`;
    }
  }
  return map;
}

function statusFromTemplate(templateId) {
  return INTERACTION_TEMPLATES[templateId] || templateId;
}

// DAML tuple (Party, RoleType) serializes as { _1: party, _2: role }
function partyStr(p) {
  if (typeof p === 'string') return p;
  if (typeof p?._1 === 'string') return p._1;
  return String(p ?? '');
}
function roleStr(p) {
  if (typeof p === 'string') return null;
  const r = p?._2;
  return typeof r === 'string' ? r : null;
}
function shortName(p) { return partyStr(p).split('::')[0] || '—'; }

// Optional Text: null for None, string for Some
function optText(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v?.Some === 'string') return v.Some;
  return null;
}

// Format ISO time relative to a base ISO time as "Day N · Hh"
function relLabel(occurredAt, base) {
  try {
    const d    = new Date(occurredAt);
    const b    = new Date(base);
    // Compare calendar dates so an event earlier in the day than the start still shows Day 1
    const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const bDay = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    const day  = Math.floor((dDay - bDay) / 86_400_000) + 1;
    const h    = d.getHours();
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `Day ${day} · ${h12}${ampm}`;
  } catch { return ''; }
}

function formatEventLabel(day, hour) {
  const suffix = hour >= 12 ? 'pm' : 'am';
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `Day ${day + 1} · ${h12}${suffix}`;
}

function openedDate(c) {
  return c.payload?.openedAt || c.payload?.startedAt || c.createdAt;
}
function completedDate(c) {
  return c.payload?.completedAt || c.payload?.discardedAt || null;
}

export default function Interactions() {
  const ledger = useLedger();
  const [interactions,  setInteractions]  = useState([]);
  const [selected,      setSelected]      = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [parties,       setParties]       = useState([]);
  const [templateIdMap, setTemplateIdMap] = useState({});
  const [configCid,     setConfigCid]     = useState(null);
  const [contractTemplateMap, setContractTemplateMap] = useState({});
  const [observations,        setObservations]        = useState([]);
  const [expandedObsId,       setExpandedObsId]       = useState(null);
  const [partyRoleMap,        setPartyRoleMap]        = useState({});

  // New interaction form
  const [showNew,     setShowNew]     = useState(false);
  const [newId,       setNewId]       = useState(() => `int-${Date.now()}`);
  const [newType,     setNewType]     = useState('PROPERTY_PURCHASE');
  const [creating,    setCreating]    = useState(false);
  const [createError, setCreateError] = useState(null);

  // Add participant form
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [newPartyId,         setNewPartyId]         = useState('');
  const [newRole,            setNewRole]            = useState('Agent');
  const [newPartyActor,      setNewPartyActor]      = useState('');

  // Remove participant form
  const [removingParty,  setRemovingParty]  = useState(null);
  const [removeActor,    setRemoveActor]    = useState('');

  // Add event form
  const [showAddEvent,     setShowAddEvent]     = useState(false);
  const [newEventType,     setNewEventType]     = useState(ALL_EVENTS[0]);
  const [newEventActor,    setNewEventActor]    = useState('');
  const [newEventDay,      setNewEventDay]      = useState(0);
  const [newEventHour,     setNewEventHour]     = useState(9);
  const [newEventResource, setNewEventResource] = useState('');

  // Action feedback
  const [actionBusy,  setActionBusy]  = useState(null);
  const [actionError, setActionError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [contracts, { parties: pts }] = await Promise.all([
        getInterfaceIds().catch(() => ({})).then(ids => ledger.queryAll(undefined, ids)),
        ledger.listAllParties().catch(() => ({ parties: [] })),
      ]);

      setTemplateIdMap(buildTemplateIdMap(contracts));
      setParties(pts);

      // contractId → rawTemplateId for every contract on the ledger
      const ctMap = {};
      contracts.forEach(c => { if (c.contractId && c.rawTemplateId) ctMap[c.contractId] = c.rawTemplateId; });
      setContractTemplateMap(ctMap);

      setObservations(contracts.filter(c => c.templateId in OBS_TEMPLATES).map(parseObservation));

      const roleMap = {};
      contracts.forEach(c => {
        const role = ROLE_TEMPLATES[c.templateId];
        if (role) roleMap[c.payload?.party] = role;
      });
      setPartyRoleMap(roleMap);

      const cfgContract = contracts.find(c => c.templateId in CONFIGURATION_TEMPLATES);
      setConfigCid(cfgContract ? { contractId: cfgContract.contractId, rawTemplateId: cfgContract.rawTemplateId } : null);

      const ixs = contracts
        .filter(c => c.templateId in INTERACTION_TEMPLATES)
        .map(c => ({
          contractId:      c.contractId,
          rawTemplateId:   c.rawTemplateId,
          templateId:      c.templateId,
          status:          statusFromTemplate(c.templateId),
          interactionId:   c.payload?.interactionId,
          type:            c.payload?.interactionType,
          participants:    c.payload?.participants || [],
          events:          c.payload?.events || [],
          openedAt:        openedDate(c),
          completedAt:     completedDate(c),
          createdAt:       c.createdAt,
          configContractId: c.payload?.configCid ?? null,
          processed:       c.payload?.processed ?? false,
        }))
        .sort((a, b) => new Date(b.openedAt || b.createdAt || 0) - new Date(a.openedAt || a.createdAt || 0));

      setInteractions(ixs);
      // Track selection by interactionId — stable across contract archival/creation cycles
      setSelected(prev => prev ? (ixs.find(i => i.interactionId === prev.interactionId) ?? null) : null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [ledger]);

  // ── Exercise helper ────────────────────────────────────────────────────────

  async function doExercise(ix, choiceName, args = {}) {
    setActionBusy(choiceName);
    setActionError(null);
    let err = null;
    try {
      await ledger.exercise(ix.contractId, ix.rawTemplateId, choiceName, args);
    } catch (e) {
      err = e;
    }
    setActionBusy(null);
    await load();
    if (err) setActionError(err.message);
  }

  // ── Lifecycle actions ──────────────────────────────────────────────────────

  function handleBegin(ix) {
    return doExercise(ix, 'Begin', { startedAt: new Date().toISOString() });
  }

  function handleDiscard(ix) {
    return doExercise(ix, 'Discard', { discardedAt: new Date().toISOString() });
  }

  function handleComplete(ix) {
    if (!configCid) {
      setActionError('No configuration contract found on the ledger.');
      return;
    }
    return doExercise(ix, 'Complete', {
      completedAt: new Date().toISOString(),
      configCid:   configCid.contractId,
    });
  }

  async function handleAddParticipant(ix) {
    if (!newPartyId.trim()) return;
    setShowAddParticipant(false);
    setNewPartyId('');
    setNewPartyActor('');
    const args = ix.status === 'InProgress'
      ? { party: newPartyId.trim(), roleType: newRole, actor: newPartyActor.trim() || newPartyId.trim(), addedAt: new Date().toISOString() }
      : { party: newPartyId.trim(), roleType: newRole };
    await doExercise(ix, 'AddParticipant', args);
  }

  async function handleRemoveParticipant(ix) {
    const party = removingParty;
    setRemovingParty(null);
    setRemoveActor('');
    const args = ix.status === 'InProgress'
      ? { party, actor: removeActor.trim() || party, removedAt: new Date().toISOString() }
      : { party };
    await doExercise(ix, 'RemoveParticipant', args);
  }

  async function handleRecordEvent(ix) {
    if (!newEventActor.trim()) return;
    const base = ix.openedAt ? new Date(ix.openedAt) : new Date();
    const d = new Date(base);
    d.setDate(d.getDate() + newEventDay);
    d.setHours(newEventHour, 0, 0, 0);
    setShowAddEvent(false);
    setNewEventActor(''); setNewEventResource(''); setNewEventDay(0); setNewEventHour(9);
    await doExercise(ix, 'RecordEvent', {
      event: {
        event:      newEventType,
        actor:      newEventActor.trim(),
        occurredAt: d.toISOString(),
        resourceId: newEventResource.trim() || null,
      },
    });
  }

  async function handleCreateObservations(ix) {
    if (!ix.configContractId) {
      setActionError('No config contract ID found on this interaction.');
      return;
    }
    const rawTemplateId = contractTemplateMap[ix.configContractId];
    if (!rawTemplateId) {
      setActionError('Config contract not found on the ledger. Try refreshing.');
      return;
    }
    setActionBusy('CreateObservations');
    setActionError(null);
    let err = null;
    try {
      await ledger.exercise(ix.configContractId, rawTemplateId, 'CreateObservations', {
        completedCid: ix.contractId,
      });
    } catch (e) {
      err = e;
    }
    setActionBusy(null);
    await load();
    if (err) setActionError(err.message);
  }

  async function createDraftInteraction() {
    const tid = templateIdMap[Object.keys(INTERACTION_TEMPLATES).find(k => INTERACTION_TEMPLATES[k] === 'Draft')];
    if (!tid) {
      setCreateError('Template ID not found. Ensure at least one interaction contract exists on the ledger first.');
      return;
    }
    if (!newId.trim()) { setCreateError('Interaction ID is required.'); return; }
    setCreating(true);
    setCreateError(null);
    try {
      await ledger.create(tid, {
        operator:        ledger.party,
        interactionId:   newId.trim(),
        interactionType: newType,
        participants:    [],
        openedAt:        new Date().toISOString(),
      });
      setShowNew(false);
      setNewId(`int-${Date.now()}`);
      await load();
    } catch (e) {
      setCreateError(e.message);
    } finally {
      setCreating(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="page-with-panel"><div style={{ flex: 1, padding: 24 }}><p className="muted">Loading...</p></div></div>;
  if (error)   return <div className="page-with-panel"><div style={{ flex: 1, padding: 24 }}><p className="error">{error}</p></div></div>;

  const sel = selected;
  const selObservations = sel ? observations.filter(o => o.interactionId === sel.interactionId) : [];

  return (
    <div className="page-with-panel">

      {/* ── List ── */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1 style={{ marginBottom: 0 }}>Interactions</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={load}>Refresh</button>
            <button
              onClick={() => { setShowNew(true); setCreateError(null); }}
              style={{ ...btnSt, background: '#1a6abf', borderColor: '#1a6abf', color: '#fff' }}
            >+ New Interaction</button>
          </div>
        </div>

        {/* New interaction inline form */}
        {showNew && (
          <div style={{ background: '#fafafa', border: '1px solid #e8e8e8', borderRadius: 3, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 12, textTransform: 'uppercase', color: '#999', letterSpacing: '0.05em', marginBottom: 16 }}>New Draft Interaction</div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelSt}>Interaction ID</label>
              <input value={newId} onChange={e => setNewId(e.target.value)} style={inputSt} onKeyDown={e => e.key === 'Enter' && createDraftInteraction()} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelSt}>Interaction Type</label>
              <select value={newType} onChange={e => setNewType(e.target.value)} style={inputSt}>
                <option value="PROPERTY_PURCHASE">PROPERTY_PURCHASE</option>
              </select>
            </div>
            {createError && <p className="error" style={{ marginBottom: 12 }}>{createError}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={createDraftInteraction}
                disabled={creating}
                style={{ ...btnSt, background: '#1a6abf', borderColor: '#1a6abf', color: '#fff' }}
              >{creating ? 'Creating...' : 'Create Draft'}</button>
              <button onClick={() => { setShowNew(false); setCreateError(null); }} style={btnSt}>Cancel</button>
            </div>
          </div>
        )}

        {interactions.length === 0 ? (
          <p className="muted">No interactions found on the ledger.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={thSt}>ID</th>
                <th style={thSt}>Type</th>
                <th style={thSt}>Status</th>
                <th style={thSt}>Participants</th>
                <th style={thSt}>Opened</th>
                <th style={thSt}>Completed</th>
              </tr>
            </thead>
            <tbody>
              {interactions.map(ix => {
                const isSelected = sel?.interactionId === ix.interactionId;
                return (
                  <tr
                    key={ix.contractId}
                    onClick={() => { setSelected(isSelected ? null : ix); setShowAddParticipant(false); setShowAddEvent(false); setActionError(null); setExpandedObsId(null); setRemovingParty(null); }}
                    style={{ cursor: 'pointer', background: isSelected ? '#f0f6ff' : 'transparent' }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f7f7f7'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={tdSt}><span style={{ color: '#1a6abf', fontWeight: 500 }}>{ix.interactionId}</span></td>
                    <td style={{ ...tdSt, color: '#888' }}>{ix.type}</td>
                    <td style={tdSt}><Tag>{ix.status}</Tag></td>
                    <td style={tdSt}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {ix.participants.length === 0
                          ? <span style={{ fontSize: 11, color: '#ccc' }}>none</span>
                          : ix.participants.map((p, i) => (
                              <span key={i} style={{ fontSize: 11, color: '#888', background: '#f0f0f0', border: '1px solid #e0e0e0', padding: '1px 6px', borderRadius: 2 }}>
                                {shortName(p)}
                              </span>
                            ))
                        }
                      </div>
                    </td>
                    <td style={{ ...tdSt, color: '#888', fontSize: 11 }}>
                      {ix.openedAt ? new Date(ix.openedAt).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ ...tdSt, color: '#bbb', fontSize: 11 }}>
                      {ix.completedAt ? new Date(ix.completedAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Detail panel ── */}
      {sel && (
        <div className="detail-panel" style={{ width: 340, borderLeft: '1px solid #e8e8e8', padding: 20, background: '#fafafa', overflowY: 'auto', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 13, fontWeight: 'normal', margin: 0, textTransform: 'none', letterSpacing: 0, color: '#1a1a1a' }}>
              {sel.interactionId}
            </h2>
            <button
              onClick={() => setSelected(null)}
              style={{ background: '#f5f5f5', border: '1px solid #ddd', color: '#333', padding: '3px 9px', fontSize: 11, cursor: 'pointer', borderRadius: 3, fontFamily: 'inherit' }}
            >✕</button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <Tag>{sel.status}</Tag>
            <span style={{ fontSize: 11, color: '#888', alignSelf: 'center' }}>{sel.type}</span>
          </div>

          {/* Lifecycle action buttons */}
          {(sel.status === 'Draft' || sel.status === 'InProgress') && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              {sel.status === 'Draft' && (
                <button
                  disabled={!!actionBusy}
                  onClick={() => handleBegin(sel)}
                  style={{ ...btnSt, background: '#1a6abf', borderColor: '#1a6abf', color: '#fff', fontSize: 11 }}
                >{actionBusy === 'Begin' ? 'Starting...' : 'Begin'}</button>
              )}
              {sel.status === 'InProgress' && (
                <button
                  disabled={!!actionBusy}
                  onClick={() => handleComplete(sel)}
                  style={{ ...btnSt, background: '#e8f5e8', color: '#2a7a2a', borderColor: '#c5e5c0', fontSize: 11 }}
                >{actionBusy === 'Complete' ? 'Completing...' : 'Complete'}</button>
              )}
              <button
                disabled={!!actionBusy}
                onClick={() => handleDiscard(sel)}
                style={{ ...btnSt, fontSize: 11, color: '#a33', borderColor: '#f0c8c8' }}
              >{actionBusy === 'Discard' ? 'Discarding...' : 'Discard'}</button>
            </div>
          )}

          {actionError && (
            <p className="error" style={{ fontSize: 11, marginBottom: 12 }}>{actionError}</p>
          )}

          {/* Participants */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#999', letterSpacing: '0.08em' }}>
                Participants ({sel.participants.length})
              </span>
              {(sel.status === 'Draft' || sel.status === 'InProgress') && (
                <button onClick={() => setShowAddParticipant(v => !v)} style={{ ...btnSt, fontSize: 10, padding: '2px 8px' }}>
                  + Add
                </button>
              )}
            </div>

            {showAddParticipant && (
              <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 3, padding: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  {parties.length > 0
                    ? <select
                        value={newPartyId}
                        onChange={e => {
                          const party = e.target.value;
                          setNewPartyId(party);
                          const role = partyRoleMap[party];
                          if (role) setNewRole(role);
                        }}
                        style={{ ...inputSt, flex: 1, fontSize: 11 }}
                      >
                        <option value="">— select party —</option>
                        {parties.map(p => (
                          <option key={p.party} value={p.party}>{p.displayName}</option>
                        ))}
                      </select>
                    : <input value={newPartyId} onChange={e => setNewPartyId(e.target.value)} placeholder="Party ID" style={{ ...inputSt, flex: 1, fontSize: 11 }} />
                  }
                  {partyRoleMap[newPartyId]
                    ? <Tag>{newRole}</Tag>
                    : <select value={newRole} onChange={e => setNewRole(e.target.value)} style={{ ...inputSt, width: 90, fontSize: 11 }}>
                        <option>Agent</option>
                        <option>Buyer</option>
                      </select>
                  }
                </div>
                {sel.status === 'InProgress' && (
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ ...labelSt, fontSize: 10, marginBottom: 4 }}>Added by</label>
                    {parties.length > 0
                      ? <select value={newPartyActor} onChange={e => setNewPartyActor(e.target.value)} style={{ ...inputSt, fontSize: 11 }}>
                          <option value="">— select party —</option>
                          {parties.map(p => (
                            <option key={p.party} value={p.party}>{p.displayName}</option>
                          ))}
                        </select>
                      : <input value={newPartyActor} onChange={e => setNewPartyActor(e.target.value)} placeholder="Leave blank to use participant" style={{ ...inputSt, fontSize: 11 }} />
                    }
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => handleAddParticipant(sel)}
                    disabled={!!actionBusy}
                    style={{ ...btnSt, background: '#1a6abf', borderColor: '#1a6abf', color: '#fff', fontSize: 11 }}
                  >{actionBusy === 'AddParticipant' ? 'Adding...' : 'Add'}</button>
                  <button onClick={() => setShowAddParticipant(false)} style={{ ...btnSt, fontSize: 11 }}>Cancel</button>
                </div>
              </div>
            )}

            {sel.participants.length === 0
              ? <span style={{ fontSize: 11, color: '#bbb' }}>No participants yet</span>
              : sel.participants.map((p, i) => {
                  const name     = shortName(p);
                  const role     = roleStr(p);
                  const pid      = partyStr(p);
                  const isRemoving = removingParty === pid;
                  return (
                    <div key={i}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: isRemoving ? 'none' : '1px solid #f0f0f0' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e8f0fb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#1a6abf', fontWeight: 600, flexShrink: 0 }}>
                          {name[0]?.toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}>{name}</div>
                        {role && <Tag>{role}</Tag>}
                        {(sel.status === 'Draft' || sel.status === 'InProgress') && (
                          <button
                            onClick={() => { setRemovingParty(isRemoving ? null : pid); setRemoveActor(''); }}
                            style={{ ...btnSt, fontSize: 10, padding: '2px 7px', color: '#a33', borderColor: '#f0c8c8', background: isRemoving ? '#fdf0f0' : '#f5f5f5', flexShrink: 0 }}
                          >−</button>
                        )}
                      </div>
                      {isRemoving && (
                        <div style={{ background: '#fdf0f0', border: '1px solid #f0c8c8', borderRadius: 3, padding: 8, marginBottom: 6 }}>
                          {sel.status === 'InProgress' && (
                            <div style={{ marginBottom: 6 }}>
                              <label style={{ ...labelSt, fontSize: 10, marginBottom: 3 }}>Removed by</label>
                              {parties.length > 0
                                ? <select value={removeActor} onChange={e => setRemoveActor(e.target.value)} style={{ ...inputSt, fontSize: 11 }}>
                                    <option value="">— same as participant —</option>
                                    {parties.map(q => (
                                      <option key={q.party} value={q.party}>{q.displayName}</option>
                                    ))}
                                  </select>
                                : <input value={removeActor} onChange={e => setRemoveActor(e.target.value)} placeholder="Leave blank to use participant" style={{ ...inputSt, fontSize: 11 }} />
                              }
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => handleRemoveParticipant(sel)}
                              disabled={!!actionBusy}
                              style={{ ...btnSt, fontSize: 11, background: '#a33', borderColor: '#a33', color: '#fff' }}
                            >{actionBusy === 'RemoveParticipant' ? 'Removing...' : 'Confirm Remove'}</button>
                            <button onClick={() => setRemovingParty(null)} style={{ ...btnSt, fontSize: 11 }}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
            }
          </div>

          {/* Events */}
          {(sel.status === 'InProgress' || sel.status === 'Completed') && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#999', letterSpacing: '0.08em' }}>
                  Events ({sel.events.length})
                </span>
                {sel.status === 'InProgress' && (
                  <button onClick={() => setShowAddEvent(v => !v)} style={{ ...btnSt, fontSize: 10, padding: '2px 8px' }}>
                    + Record
                  </button>
                )}
              </div>

              {showAddEvent && (
                <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 3, padding: 10, marginBottom: 8 }}>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ ...labelSt, fontSize: 10 }}>Event</label>
                    <select value={newEventType} onChange={e => setNewEventType(e.target.value)} style={{ ...inputSt, fontSize: 11 }}>
                      {ALL_EVENTS.map(e => <option key={e}>{e}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ ...labelSt, fontSize: 10 }}>Actor</label>
                    {parties.length > 0
                      ? <select value={newEventActor} onChange={e => setNewEventActor(e.target.value)} style={{ ...inputSt, fontSize: 11 }}>
                          <option value="">— select party —</option>
                          {parties.map(p => (
                            <option key={p.party} value={p.party}>{p.displayName}</option>
                          ))}
                        </select>
                      : <input value={newEventActor} onChange={e => setNewEventActor(e.target.value)} placeholder="Party ID" style={{ ...inputSt, fontSize: 11 }} />
                    }
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ ...labelSt, fontSize: 10 }}>Resource ID (optional)</label>
                    <input value={newEventResource} onChange={e => setNewEventResource(e.target.value)} placeholder="doc-001" style={{ ...inputSt, fontSize: 11 }} />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: '#555', marginBottom: 6, fontWeight: 500 }}>
                      {formatEventLabel(newEventDay, newEventHour)}
                      <span style={{ color: '#bbb', marginLeft: 6, fontSize: 10 }}>(from interaction start)</span>
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Day</div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[0,1,2,3,4,5,6,7].map(d => (
                          <button key={d} onClick={() => setNewEventDay(d)}
                            style={{ ...btnSt, fontSize: 10, padding: '3px 0', width: 28, background: newEventDay === d ? '#1a1a1a' : '#f5f5f5', color: newEventDay === d ? '#fff' : '#555', borderColor: newEventDay === d ? '#1a1a1a' : '#ddd' }}>
                            {d + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Hour</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {[6,8,9,10,11,12,13,14,15,16,17,18,20].map(h => {
                          const sfx = h >= 12 ? 'pm' : 'am';
                          const h12 = h > 12 ? h - 12 : h;
                          return (
                            <button key={h} onClick={() => setNewEventHour(h)}
                              style={{ ...btnSt, fontSize: 10, padding: '3px 6px', background: newEventHour === h ? '#1a1a1a' : '#f5f5f5', color: newEventHour === h ? '#fff' : '#555', borderColor: newEventHour === h ? '#1a1a1a' : '#ddd' }}>
                              {h12}{sfx}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => handleRecordEvent(sel)}
                      disabled={!!actionBusy}
                      style={{ ...btnSt, background: '#1a6abf', borderColor: '#1a6abf', color: '#fff', fontSize: 11 }}
                    >{actionBusy === 'RecordEvent' ? 'Recording...' : 'Record'}</button>
                    <button onClick={() => setShowAddEvent(false)} style={{ ...btnSt, fontSize: 11 }}>Cancel</button>
                  </div>
                </div>
              )}

              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {sel.events.length === 0
                  ? <span style={{ fontSize: 11, color: '#bbb' }}>No events recorded</span>
                  : [...sel.events].reverse().map((ev, i) => (
                      <div key={i} style={{ padding: '5px 0', borderBottom: '1px solid #f0f0f0', fontSize: 11 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ color: '#333', fontWeight: 500 }}>{ev.event}</span>
                          <span style={{ color: '#bbb', fontSize: 10 }}>
                            {ev.occurredAt ? relLabel(ev.occurredAt, sel.openedAt || sel.createdAt) : ''}
                          </span>
                        </div>
                        <div style={{ color: '#888' }}>
                          actor: {shortName(ev.actor)}
                          {optText(ev.resourceId) ? ` · ${optText(ev.resourceId)}` : ''}
                        </div>
                      </div>
                    ))
                }
              </div>
            </div>
          )}

          {/* Observations */}
          {sel.status === 'Completed' && (
            <div style={{ borderTop: '1px solid #eee', paddingTop: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#999', letterSpacing: '0.08em' }}>
                  Observations{selObservations.length > 0 ? ` (${selObservations.length})` : ''}
                </span>
                {selObservations.length === 0 && (
                  <button
                    disabled={!!actionBusy}
                    onClick={() => handleCreateObservations(sel)}
                    style={{ ...btnSt, fontSize: 11, padding: '4px 12px', background: '#f0f6ff', borderColor: '#1a6abf', color: '#1a6abf', fontWeight: 600 }}
                  >{actionBusy === 'CreateObservations' ? 'Creating...' : 'Create Observations'}</button>
                )}
              </div>
              {selObservations.length === 0 ? (
                <span style={{ fontSize: 11, color: '#bbb' }}>No observations yet</span>
              ) : (
                selObservations.map(o => {
                  const isExpanded = expandedObsId === o.contractId;
                  return (
                    <div key={o.contractId} style={{ background: '#fff', border: `1px solid ${isExpanded ? '#1a6abf' : '#e8e8e8'}`, borderRadius: 3, marginBottom: 8, overflow: 'hidden' }}>
                      {/* Card header — always visible, click to expand */}
                      <div
                        onClick={() => setExpandedObsId(isExpanded ? null : o.contractId)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, cursor: 'pointer' }}
                      >
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#e8f0fb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#1a6abf', fontWeight: 700, flexShrink: 0 }}>
                          {shortName(o.subject)[0]?.toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500 }}>{shortName(o.subject)}</div>
                        <Tag>{o.role}</Tag>
                        <span style={{ fontSize: 10, color: '#bbb', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                      </div>
                      {/* Score bars — always visible */}
                      <div style={{ padding: '0 10px 10px' }}>
                        {OBS_COMP_IDS.map(id => {
                          const val = o.components[id];
                          if (val === undefined) return null;
                          return (
                            <div key={id} style={{ marginBottom: 5 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                <span style={{ fontSize: 10, color: '#999' }}>{id}</span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: OBS_COMP_COLORS[id] }}>{(val * 100).toFixed(0)}</span>
                              </div>
                              <ScoreBar value={val} color={OBS_COMP_COLORS[id]} />
                            </div>
                          );
                        })}
                      </div>
                      {/* Expanded detail */}
                      {isExpanded && (
                        <div style={{ borderTop: '1px solid #e8e8e8', padding: 10 }}>
                          <ObservationDetail obs={o} compact />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Timeline */}
          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 14 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#999', letterSpacing: '0.08em', marginBottom: 8 }}>Timeline</div>
            {[
              { label: 'Opened',      date: sel.openedAt,    done: true },
              { label: 'In Progress', date: null,            done: sel.status !== 'Draft' && sel.status !== 'Discarded' },
              { label: 'Completed',   date: sel.completedAt, done: sel.status === 'Completed' },
              { label: 'Discarded',   date: sel.completedAt, done: sel.status === 'Discarded' },
            ]
              .filter(t => !(t.label === 'Discarded' && sel.status !== 'Discarded') && !(t.label === 'Completed' && sel.status === 'Discarded'))
              .map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', marginTop: 2, flexShrink: 0, background: t.done ? '#1a6abf' : '#e0e0e0', border: `2px solid ${t.done ? '#1a6abf' : '#ccc'}` }} />
                  <div>
                    <div style={{ fontSize: 11, color: t.done ? '#333' : '#bbb' }}>{t.label}</div>
                    {t.date && <div style={{ fontSize: 10, color: '#bbb' }}>{new Date(t.date).toLocaleDateString()}</div>}
                  </div>
                </div>
              ))
            }
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#999', letterSpacing: '0.08em', marginBottom: 4 }}>Contract ID</div>
            <div style={{ fontSize: 10, color: '#bbb', wordBreak: 'break-all' }}>{sel.contractId}</div>
          </div>
        </div>
      )}
    </div>
  );
}
