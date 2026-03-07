/**
 * Async reputation engine
 * Processes contract events and computes reputation scores
 */

import { TEMPLATE_IDS } from '../../config/contracts.js';
import {
  normalizeConfiguration,
  normalizeInteraction,
  normalizeFeedback,
} from '../../shared/contracts/schema.js';
import { clamp, evaluate, round2 } from '../../shared/utils/math.js';

function findRatingsForInteraction(interaction, config) {
  const interactionType = config.interactionTypes.find(
    (item) => item.interactionTypeId === interaction.interactionType
  );

  if (!interactionType) {
    return {};
  }

  const ratings = {};
  for (const rule of interactionType.ratingRules) {
    if (ratings[rule.componentId] != null) continue;

    const observed = interaction.outcome?.[rule.conditionField];
    if (evaluate(observed, rule.conditionOperator, rule.conditionValue)) {
      ratings[rule.componentId] = rule.assignedRating;
    }
  }

  return ratings;
}

export class AsyncReputationEngine {
  constructor({ ledger, store }) {
    this.ledger = ledger;
    this.store = store;
    this.lastProcessedOffset = 0;
  }

  async init() {
    this.lastProcessedOffset = await this.store.getCheckpoint();
  }

  getCheckpoint() {
    return this.lastProcessedOffset;
  }

  async processNewEvents() {
    const events = await this.ledger.streamFrom(this.lastProcessedOffset);

    const stats = {
      fromOffset: this.lastProcessedOffset,
      toOffset: this.lastProcessedOffset,
      consumedEvents: 0,
      appliedUpdates: 0,
      ignoredEvents: 0,
      warnings: [],
    };

    for (const event of events) {
      stats.consumedEvents += 1;
      stats.toOffset = event.offset;

      try {
        switch (event.templateId) {
          case TEMPLATE_IDS.REPUTATION_CONFIGURATION: {
            const config = normalizeConfiguration(event.payload);
            await this.store.addConfiguration(config);
            break;
          }
          case TEMPLATE_IDS.COMPLETED_INTERACTION: {
            const interaction = normalizeInteraction(event.payload);
            if (interaction.evaluated) {
              stats.ignoredEvents += 1;
              break;
            }

            const config =
              (await this.store.getConfigurationByVersion(interaction.configVersion)) ||
              (await this.store.getActiveConfiguration(event.createdAt, { fallback: 'none' }));

            if (!config) {
              stats.warnings.push(`No active config for interaction event at offset ${event.offset}`);
              stats.ignoredEvents += 1;
              break;
            }

            const ratings = findRatingsForInteraction(interaction, config);
            if (Object.keys(ratings).length === 0) {
              stats.ignoredEvents += 1;
              break;
            }

            for (const party of interaction.participants) {
              stats.appliedUpdates += await this.applyRatings({
                party,
                ratings,
                config,
                reason: 'INTERACTION_RULE',
                sourceId: event.contractId,
              });
            }
            break;
          }
          case TEMPLATE_IDS.FEEDBACK: {
            const feedback = normalizeFeedback(event.payload);
            const config =
              (await this.store.getActiveConfiguration(event.createdAt, { fallback: 'none' })) ||
              (await this.store.getConfigurationByVersion(1));

            if (!config) {
              stats.warnings.push(`No active config for feedback event at offset ${event.offset}`);
              stats.ignoredEvents += 1;
              break;
            }

            stats.appliedUpdates += await this.applyRatings({
              party: feedback.to,
              ratings: feedback.componentRatings,
              config,
              reason: `FEEDBACK_${feedback.phase}`,
              sourceId: feedback.interactionId,
              from: feedback.from,
            });
            break;
          }
          default:
            stats.ignoredEvents += 1;
            break;
        }
      } catch (error) {
        stats.warnings.push(`Event ${event.offset} failed: ${error.message}`);
      }

      this.lastProcessedOffset = event.offset;
      await this.store.setCheckpoint(this.lastProcessedOffset);
    }

    return stats;
  }

  async applyRatings({ party, ratings, config, reason, sourceId, from = '' }) {
    const roleId = await this.resolveRole(party, config);
    const subject = await this.store.getOrCreateSubject(party, roleId, config);
    const floor = config.systemParameters.reputationFloor;
    const ceiling = config.systemParameters.reputationCeiling;

    let applied = 0;

    for (const [componentId, ratingRaw] of Object.entries(ratings)) {
      const component = subject.components[componentId];
      if (!component) {
        continue;
      }

      const rating = Number(ratingRaw);
      if (!Number.isFinite(rating)) {
        continue;
      }

      const currentValue = Number(component.value);
      const step = 1 / (component.interactionCount + 2);
      const rawNext = currentValue + step * (rating - currentValue);
      const nextValue = round2(clamp(rawNext, floor, ceiling));

      component.value = nextValue;
      component.interactionCount += 1;
      component.history.unshift({
        at: new Date().toISOString(),
        reason,
        sourceId,
        from,
        inputRating: rating,
        oldValue: currentValue,
        newValue: nextValue,
      });

      component.history = component.history.slice(0, 25);
      applied += 1;
    }

    this.store.recomputeOverallScore(subject, config);
    await this.store.saveSubject(subject);

    return applied;
  }

  async resolveRole(party, config) {
    const existing = await this.store.getSubject(party);
    if (existing?.roleId) {
      return existing.roleId;
    }

    if (config.partyRoles?.[party]) {
      return config.partyRoles[party];
    }

    if (config.defaultRoleId) {
      return config.defaultRoleId;
    }

    return config.roleWeights[0]?.roleId || 'UNKNOWN_ROLE';
  }
}
