import { TEMPLATE_IDS } from '../shared/contracts/registry.js';
import {
  normalizeCompletedInteraction,
  normalizeFeedback,
  normalizeReputationConfiguration,
} from '../contracts/schema.js';
import { clamp, round2 } from '../lib/conditions.js';
import { evaluateInteractionRatings } from './ruleEvaluator.js';

export class ReputationEngine {
  constructor({ ledger, store, logger = console }) {
    this.ledger = ledger;
    this.store = store;
    this.logger = logger;
    this.lastProcessedOffset = 0;
  }

  getCheckpoint() {
    return this.lastProcessedOffset;
  }

  processNewEvents() {
    const events = this.ledger.streamFrom(this.lastProcessedOffset);

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
            const configuration = normalizeReputationConfiguration(event.payload);
            this.store.addConfiguration(configuration);
            break;
          }
          case TEMPLATE_IDS.COMPLETED_INTERACTION: {
            const interaction = normalizeCompletedInteraction(event.payload);
            if (interaction.evaluated) {
              stats.ignoredEvents += 1;
              break;
            }

            const configuration =
              this.store.getConfigurationByVersion(interaction.configVersion) ||
              this.store.getActiveConfiguration(event.createdAt, { fallback: 'none' });

            if (!configuration) {
              stats.warnings.push(`No active config for interaction event at offset ${event.offset}`);
              stats.ignoredEvents += 1;
              break;
            }

            const ratings = evaluateInteractionRatings(interaction, configuration);
            if (Object.keys(ratings).length === 0) {
              stats.ignoredEvents += 1;
              break;
            }

            for (const party of interaction.participants) {
              stats.appliedUpdates += this.applyRatingsToParty({
                party,
                ratings,
                configuration,
                reason: 'INTERACTION_RULE',
                sourceId: event.contractId,
              });
            }
            break;
          }
          case TEMPLATE_IDS.FEEDBACK: {
            const feedback = normalizeFeedback(event.payload);
            const configuration =
              this.store.getActiveConfiguration(event.createdAt, { fallback: 'none' }) ||
              this.store.getConfigurationByVersion(1);

            if (!configuration) {
              stats.warnings.push(`No active config for feedback event at offset ${event.offset}`);
              stats.ignoredEvents += 1;
              break;
            }

            stats.appliedUpdates += this.applyRatingsToParty({
              party: feedback.to,
              ratings: feedback.componentRatings,
              configuration,
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
    }

    return stats;
  }

  applyRatingsToParty({ party, ratings, configuration, reason, sourceId, from = '' }) {
    const roleId = this.resolveRoleForParty(party, configuration);
    const subject = this.store.getOrCreateSubject(party, roleId, configuration);
    const floor = configuration.systemParameters.reputationFloor;
    const ceiling = configuration.systemParameters.reputationCeiling;

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
      const step = 1 / (component.interactionCount + 2); // Takes initial value into account
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

    this.store.recomputeOverallScore(subject, configuration);
    this.store.saveSubject(subject);

    return applied;
  }

  resolveRoleForParty(party, configuration) {
    const existing = this.store.getSubject(party);
    if (existing?.roleId) {
      return existing.roleId;
    }

    if (configuration.partyRoles?.[party]) {
      return configuration.partyRoles[party];
    }

    if (configuration.defaultRoleId) {
      return configuration.defaultRoleId;
    }

    return configuration.roleWeights[0]?.roleId || 'UNKNOWN_ROLE';
  }
}
