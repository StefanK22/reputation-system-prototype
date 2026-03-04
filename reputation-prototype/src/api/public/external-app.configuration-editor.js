import React, { useEffect, useState } from 'https://esm.sh/react@18.2.0';
import {
  CONDITION_OPERATORS,
  deepClone,
  getContractDisplayName,
  html,
  normalizeConfiguration,
  pretty,
  serializeConfigurationDraft,
  toFiniteNumber,
} from './external-app.shared.js';

export function ReputationConfigurationEditor({ definition, autoProcess, onPublish, addLog, activeConfig }) {
  const contractName = getContractDisplayName(definition);
  const [draft, setDraft] = useState(() => normalizeConfiguration(activeConfig, definition));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reconcileDraft = (targetDraft) => {
    targetDraft.roleWeights = Array.isArray(targetDraft.roleWeights) ? targetDraft.roleWeights : [];
    targetDraft.partyRoles =
      targetDraft.partyRoles && typeof targetDraft.partyRoles === 'object' ? targetDraft.partyRoles : {};

    const componentIds = [
      ...new Set((targetDraft.components || []).map((component) => String(component.componentId || ''))),
    ];
    for (const roleWeight of targetDraft.roleWeights) {
      const currentWeights =
        roleWeight.componentWeights && typeof roleWeight.componentWeights === 'object'
          ? roleWeight.componentWeights
          : {};
      const nextWeights = {};

      for (const componentId of componentIds) {
        nextWeights[componentId] = toFiniteNumber(currentWeights[componentId], 0);
      }

      roleWeight.componentWeights = nextWeights;
    }

    const roleIds = targetDraft.roleWeights.map((role) => String(role.roleId || '')).filter(Boolean);
    if (targetDraft.defaultRoleId && !roleIds.includes(targetDraft.defaultRoleId)) {
      targetDraft.defaultRoleId = roleIds[0] || '';
    }

    Object.keys(targetDraft.partyRoles).forEach((party) => {
      const roleId = String(targetDraft.partyRoles[party] || '');
      if (!roleId || !roleIds.includes(roleId)) {
        delete targetDraft.partyRoles[party];
      }
    });
  };

  const createReconciledDraftSnapshot = (sourceDraft) => {
    const snapshot = deepClone(sourceDraft);
    reconcileDraft(snapshot);
    return snapshot;
  };

  useEffect(() => {
    const normalized = normalizeConfiguration(activeConfig, definition);
    reconcileDraft(normalized);
    setDraft(normalized);
  }, [activeConfig, definition]);

  const updateDraft = (updater) => {
    setDraft((previous) => {
      const next = deepClone(previous);
      updater(next);
      reconcileDraft(next);
      return next;
    });
  };

  const handleTopLevel = (key, value) => {
    updateDraft((next) => {
      next[key] = value;
    });
  };

  const handleSystemParameter = (key, rawValue) => {
    updateDraft((next) => {
      next.systemParameters = next.systemParameters || {};
      next.systemParameters[key] = toFiniteNumber(rawValue, 0);
    });
  };

  const addComponent = () => {
    updateDraft((next) => {
      const nextId = `Component${next.components.length + 1}`;
      next.components.push({
        componentId: nextId,
        description: '',
        initialValue: 70,
      });

      next.roleWeights.forEach((role) => {
        role.componentWeights = role.componentWeights || {};
        if (role.componentWeights[nextId] == null) {
          role.componentWeights[nextId] = 0;
        }
      });
    });
  };

  const updateComponentField = (index, key, value) => {
    updateDraft((next) => {
      const component = next.components[index];
      if (!component) {
        return;
      }

      if (key === 'componentId') {
        const oldComponentId = component.componentId;
        const nextComponentId = String(value);
        component.componentId = nextComponentId;

        if (oldComponentId !== nextComponentId) {
          next.roleWeights.forEach((role) => {
            role.componentWeights = role.componentWeights || {};
            if (Object.prototype.hasOwnProperty.call(role.componentWeights, oldComponentId)) {
              const previousWeight = role.componentWeights[oldComponentId];
              delete role.componentWeights[oldComponentId];
              if (!Object.prototype.hasOwnProperty.call(role.componentWeights, nextComponentId)) {
                role.componentWeights[nextComponentId] = previousWeight;
              }
            }
          });

          next.interactionTypes.forEach((interactionType) => {
            interactionType.ratingRules.forEach((rule) => {
              if (rule.componentId === oldComponentId) {
                rule.componentId = nextComponentId;
              }
            });
          });
        }

        return;
      }

      if (key === 'initialValue') {
        component.initialValue = toFiniteNumber(value, 70);
        return;
      }

      component[key] = String(value);
    });
  };

  const removeComponent = (index) => {
    updateDraft((next) => {
      const [removed] = next.components.splice(index, 1);
      if (!removed) {
        return;
      }

      next.roleWeights.forEach((role) => {
        if (role.componentWeights && removed.componentId in role.componentWeights) {
          delete role.componentWeights[removed.componentId];
        }
      });

      next.interactionTypes.forEach((interactionType) => {
        interactionType.ratingRules = interactionType.ratingRules.filter(
          (rule) => rule.componentId !== removed.componentId
        );
      });
    });
  };

  const addRoleWeight = () => {
    updateDraft((next) => {
      const newRole = {
        roleId: `ROLE_${next.roleWeights.length + 1}`,
        componentWeights: Object.fromEntries(next.components.map((component) => [component.componentId, 0])),
      };
      next.roleWeights.push(newRole);
    });
  };

  const updateRoleId = (index, value) => {
    updateDraft((next) => {
      const role = next.roleWeights[index];
      if (!role) {
        return;
      }

      const oldRoleId = role.roleId;
      role.roleId = String(value);

      if (!oldRoleId || oldRoleId === role.roleId) {
        return;
      }

      if (next.defaultRoleId === oldRoleId) {
        next.defaultRoleId = role.roleId;
      }

      Object.keys(next.partyRoles || {}).forEach((party) => {
        if (next.partyRoles[party] === oldRoleId) {
          next.partyRoles[party] = role.roleId;
        }
      });
    });
  };

  const updateRoleWeight = (roleIndex, componentId, rawValue) => {
    updateDraft((next) => {
      const role = next.roleWeights[roleIndex];
      if (!role) {
        return;
      }

      role.componentWeights = role.componentWeights || {};
      role.componentWeights[componentId] = toFiniteNumber(rawValue, 0);
    });
  };

  const removeRoleWeight = (index) => {
    updateDraft((next) => {
      const [removed] = next.roleWeights.splice(index, 1);
      if (!removed) {
        return;
      }

      Object.keys(next.partyRoles || {}).forEach((party) => {
        if (next.partyRoles[party] === removed.roleId) {
          delete next.partyRoles[party];
        }
      });

      if (next.defaultRoleId === removed.roleId) {
        next.defaultRoleId = next.roleWeights[0]?.roleId || '';
      }
    });
  };

  const updateInteractionTypeField = (index, key, value) => {
    updateDraft((next) => {
      const interactionType = next.interactionTypes[index];
      if (!interactionType) {
        return;
      }
      interactionType[key] = String(value);
    });
  };

  const updateRatingRuleField = (interactionIndex, ruleIndex, key, value) => {
    updateDraft((next) => {
      const interactionType = next.interactionTypes[interactionIndex];
      const rule = interactionType?.ratingRules?.[ruleIndex];

      if (!rule) {
        return;
      }

      if (key === 'conditionValue' || key === 'assignedRating') {
        rule[key] = toFiniteNumber(value, key === 'assignedRating' ? 70 : 0);
        return;
      }

      if (key === 'conditionOperator') {
        rule[key] = String(value || 'EQ').toUpperCase();
        return;
      }

      rule[key] = String(value);
    });
  };

  const updatePartyRoleKey = (oldParty, newParty) => {
    updateDraft((next) => {
      next.partyRoles = next.partyRoles || {};
      if (!(oldParty in next.partyRoles)) {
        return;
      }

      const roleId = next.partyRoles[oldParty];
      delete next.partyRoles[oldParty];
      next.partyRoles[String(newParty)] = roleId;
    });
  };

  const updatePartyRoleValue = (party, roleId) => {
    updateDraft((next) => {
      next.partyRoles = next.partyRoles || {};
      next.partyRoles[party] = String(roleId);
    });
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      const payload = serializeConfigurationDraft(createReconciledDraftSnapshot(draft));
      await onPublish(definition.templateId, payload, autoProcess);
      addLog(`Published ${contractName} from current store config`, payload);
    } catch (error) {
      addLog(`Failed to publish ${contractName}`, { error: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const roleIds = draft.roleWeights.map((role) => role.roleId).filter(Boolean);
  const componentIds = draft.components.map((component) => component.componentId).filter(Boolean);
  const previewPayload = serializeConfigurationDraft(createReconciledDraftSnapshot(draft));

  return html`
    <article className="panel">
      <div className="panel-head">
        <h2>Edit <code>${contractName}</code> (Current Store Config)</h2>
        <button
          className="ghost"
          onClick=${() => {
            const normalized = normalizeConfiguration(activeConfig, definition);
            reconcileDraft(normalized);
            setDraft(normalized);
          }}
        >
          Reload Active Config
        </button>
      </div>

      <div className="form-block">
        <div className="section-card">
          <h3>Update Flow</h3>
          <p className="hint">
            1. Edit components first. 2. Review role weights (auto-synced with components). 3. Adjust interaction
            rules and party-role mappings. 4. Deploy.
          </p>
          <p className="hint">
            Components: ${draft.components.length} | Roles: ${draft.roleWeights.length} | Interaction Types:
            ${draft.interactionTypes.length}
          </p>
        </div>

        <div className="section-card">
          <h3>1. Metadata & System</h3>
          <label>operator</label>
          <input type="text" value=${draft.operator} onChange=${(event) => handleTopLevel('operator', event.target.value)} />

          <label>configId</label>
          <input type="text" value=${draft.configId} onChange=${(event) => handleTopLevel('configId', event.target.value)} />

          <label>version</label>
          <input
            type="number"
            value=${draft.version}
            onChange=${(event) => handleTopLevel('version', toFiniteNumber(event.target.value, draft.version))}
          />

          <label>activationTime (ISO)</label>
          <input
            type="text"
            value=${draft.activationTime}
            onChange=${(event) => handleTopLevel('activationTime', event.target.value)}
          />

          <label>reputationFloor</label>
          <input
            type="number"
            value=${draft.systemParameters.reputationFloor}
            onChange=${(event) => handleSystemParameter('reputationFloor', event.target.value)}
          />

          <label>reputationCeiling</label>
          <input
            type="number"
            value=${draft.systemParameters.reputationCeiling}
            onChange=${(event) => handleSystemParameter('reputationCeiling', event.target.value)}
          />

        </div>

        <div className="section-card">
          <h3>2. Components</h3>
          <p className="hint">Adding or renaming components automatically updates every role weight map.</p>
          ${draft.components.map(
            (component, index) => html`
              <div key=${`component-${index}`} className="item-card">
                <label>componentId</label>
                <input
                  type="text"
                  value=${component.componentId}
                  onChange=${(event) => updateComponentField(index, 'componentId', event.target.value)}
                />

                <label>description</label>
                <input
                  type="text"
                  value=${component.description}
                  onChange=${(event) => updateComponentField(index, 'description', event.target.value)}
                />

                <label>initialValue</label>
                <input
                  type="number"
                  value=${component.initialValue}
                  onChange=${(event) => updateComponentField(index, 'initialValue', event.target.value)}
                />

                <button className="secondary" onClick=${() => removeComponent(index)}>Remove Component</button>
              </div>
            `
          )}
          <button className="secondary" onClick=${addComponent}>Add Component</button>
        </div>

        <div className="section-card">
          <h3>3. Roles & Weights</h3>
          <p className="hint">Each role always includes all current components, with default weight 0 when added.</p>
          <label>defaultRoleId</label>
          <select
            value=${draft.defaultRoleId}
            onChange=${(event) => handleTopLevel('defaultRoleId', event.target.value)}
          >
            <option value="">(none)</option>
            ${roleIds.map(
              (roleId) => html`
                <option key=${roleId} value=${roleId}>${roleId}</option>
              `
            )}
          </select>

          ${draft.roleWeights.map(
            (roleWeight, roleIndex) => html`
              <div key=${`role-${roleIndex}`} className="item-card">
                <label>roleId</label>
                <input
                  type="text"
                  value=${roleWeight.roleId}
                  onChange=${(event) => updateRoleId(roleIndex, event.target.value)}
                />

                ${draft.components.map(
                  (component) => html`
                    <div key=${`role-${roleIndex}-${component.componentId}`} className="weight-row">
                      <label>${component.componentId || '(component)'} weight</label>
                      <input
                        type="number"
                        value=${toFiniteNumber(roleWeight.componentWeights?.[component.componentId], 0)}
                        onChange=${(event) =>
                          updateRoleWeight(roleIndex, component.componentId, event.target.value)}
                      />
                    </div>
                  `
                )}

                <button className="secondary" onClick=${() => removeRoleWeight(roleIndex)}>Remove Role</button>
              </div>
            `
          )}
          <button className="secondary" onClick=${addRoleWeight}>Add Role</button>
        </div>

        <div className="section-card">
          <h3>4. Party Roles</h3>
          ${Object.entries(draft.partyRoles || {}).map(
            ([party, roleId]) => html`
              <div key=${party} className="item-row">
                <input
                  type="text"
                  value=${party}
                  onChange=${(event) => updatePartyRoleKey(party, event.target.value)}
                />
                <select value=${roleId} onChange=${(event) => updatePartyRoleValue(party, event.target.value)}>
                  <option value="">(none)</option>
                  ${roleIds.map(
                    (candidate) => html`
                      <option key=${candidate} value=${candidate}>${candidate}</option>
                    `
                  )}
                </select>
                <button
                  className="secondary"
                  onClick=${() =>
                    updateDraft((next) => {
                      next.partyRoles = next.partyRoles || {};
                      delete next.partyRoles[party];
                    })}
                >
                  Remove
                </button>
              </div>
            `
          )}
          <button
            className="secondary"
            onClick=${() =>
              updateDraft((next) => {
                const candidateParty = `PARTY_${Object.keys(next.partyRoles || {}).length + 1}`;
                const defaultRole = next.defaultRoleId || next.roleWeights[0]?.roleId || '';
                next.partyRoles = next.partyRoles || {};
                next.partyRoles[candidateParty] = defaultRole;
              })}
          >
            Add Party Role
          </button>
        </div>

        <div className="section-card">
          <h3>5. Interaction Types & Rules</h3>
          ${draft.interactionTypes.map(
            (interactionType, interactionIndex) => html`
              <div key=${`interaction-${interactionIndex}`} className="item-card">
                <label>interactionTypeId</label>
                <input
                  type="text"
                  value=${interactionType.interactionTypeId}
                  onChange=${(event) =>
                    updateInteractionTypeField(interactionIndex, 'interactionTypeId', event.target.value)}
                />

                <label>description</label>
                <input
                  type="text"
                  value=${interactionType.description}
                  onChange=${(event) =>
                    updateInteractionTypeField(interactionIndex, 'description', event.target.value)}
                />

                ${interactionType.ratingRules.map(
                  (rule, ruleIndex) => html`
                    <div key=${`rule-${interactionIndex}-${ruleIndex}`} className="item-card nested-card">
                      <label>componentId</label>
                      <select
                        value=${rule.componentId}
                        onChange=${(event) =>
                          updateRatingRuleField(interactionIndex, ruleIndex, 'componentId', event.target.value)}
                      >
                        <option value="">(none)</option>
                        ${componentIds.map(
                          (componentId) => html`
                            <option key=${componentId} value=${componentId}>${componentId}</option>
                          `
                        )}
                      </select>

                      <label>conditionField</label>
                      <input
                        type="text"
                        value=${rule.conditionField}
                        onChange=${(event) =>
                          updateRatingRuleField(interactionIndex, ruleIndex, 'conditionField', event.target.value)}
                      />

                      <label>conditionOperator</label>
                      <select
                        value=${rule.conditionOperator}
                        onChange=${(event) =>
                          updateRatingRuleField(interactionIndex, ruleIndex, 'conditionOperator', event.target.value)}
                      >
                        ${CONDITION_OPERATORS.map(
                          (operator) => html`
                            <option key=${operator} value=${operator}>${operator}</option>
                          `
                        )}
                      </select>

                      <label>conditionValue</label>
                      <input
                        type="number"
                        value=${rule.conditionValue}
                        onChange=${(event) =>
                          updateRatingRuleField(interactionIndex, ruleIndex, 'conditionValue', event.target.value)}
                      />

                      <label>assignedRating</label>
                      <input
                        type="number"
                        value=${rule.assignedRating}
                        onChange=${(event) =>
                          updateRatingRuleField(interactionIndex, ruleIndex, 'assignedRating', event.target.value)}
                      />

                      <button
                        className="secondary"
                        onClick=${() =>
                          updateDraft((next) => {
                            const interactionType = next.interactionTypes[interactionIndex];
                            if (!interactionType) {
                              return;
                            }
                            interactionType.ratingRules.splice(ruleIndex, 1);
                          })}
                      >
                        Remove Rule
                      </button>
                    </div>
                  `
                )}

                <button
                  className="secondary"
                  onClick=${() =>
                    updateDraft((next) => {
                      const interactionType = next.interactionTypes[interactionIndex];
                      if (!interactionType) {
                        return;
                      }

                      const fallbackComponentId = next.components[0]?.componentId || '';
                      interactionType.ratingRules.push({
                        componentId: fallbackComponentId,
                        conditionField: '',
                        conditionOperator: 'EQ',
                        conditionValue: 0,
                        assignedRating: 70,
                      });
                    })}
                >
                  Add Rating Rule
                </button>
                <button
                  className="secondary"
                  onClick=${() =>
                    updateDraft((next) => {
                      next.interactionTypes.splice(interactionIndex, 1);
                    })}
                >
                  Remove Interaction Type
                </button>
              </div>
            `
          )}
          <button
            className="secondary"
            onClick=${() =>
              updateDraft((next) => {
                next.interactionTypes.push({
                  interactionTypeId: `TYPE_${next.interactionTypes.length + 1}`,
                  description: '',
                  ratingRules: [],
                });
              })}
          >
            Add Interaction Type
          </button>
        </div>
      </div>

      <button onClick=${handleSubmit} disabled=${isSubmitting}>
        ${isSubmitting ? 'Deploying...' : 'Deploy Contract'}
      </button>

      <h3>Outgoing JSON Preview</h3>
      <pre>${pretty(previewPayload)}</pre>
    </article>
  `;
}
