import { TEMPLATES, normalizeConfig, normalizeInteraction, normalizeFeedback } from '../../contracts.js';
import { clamp, round2, evaluate } from '../../shared/math.js';

function ratingsFromInteraction(interaction, config) {
  const type = config.interactionTypes.find((t) => t.interactionTypeId === interaction.interactionType);
  if (!type) return {};

  const ratings = {};
  for (const rule of type.ratingRules) {
    if (ratings[rule.componentId] != null) continue;
    if (evaluate(interaction.outcome?.[rule.conditionField], rule.conditionOperator, rule.conditionValue))
      ratings[rule.componentId] = rule.assignedRating;
  }
  return ratings;
}

function tokenPayload(subject) {
  return {
    party:         subject.party,
    roleId:        subject.roleId,
    overallScore:  subject.overallScore,
    components:    subject.components,
    configVersion: subject.configVersion,
    updatedAt:     subject.updatedAt,
  };
}

export class ReputationEngine {
  constructor({ ledger, db }) {
    this.ledger     = ledger;
    this.db         = db;
    this.checkpoint = 0;
  }

  async init() {
    await this.db.reset();
    this.checkpoint = 0;
    console.log('Engine: read model reset — will rebuild from ledger offset 0');
  }

  // Accepts an AbortSignal forwarded from the worker so in-flight long-poll
  // requests can be cancelled cleanly on shutdown.
  async processNewEvents(signal) {
    const events = await this.ledger.streamFrom(this.checkpoint, { signal });
    const stats  = { fromOffset: this.checkpoint, toOffset: this.checkpoint, consumed: 0, applied: 0, ignored: 0, warnings: [] };

    for (const event of events) {
      stats.consumed++;
      stats.toOffset = event.offset;

      try {
        switch (event.templateId) {
          case TEMPLATES.CONFIG: {
            const config = normalizeConfig(event.payload);
            await this.db.addConfig(config, event.offset, event.contractId);
            for (const [party, roleId] of Object.entries(config.partyRoles ?? {})) {
              const subject = await this.db.getOrCreateSubject(party, roleId, config);
              if (!subject.contractId) {
                const token = await this.ledger.create(TEMPLATES.TOKEN, tokenPayload(subject));
                subject.contractId = token.contractId;
                await this.db.saveSubject(subject);
              }
            }
            break;
          }
          case TEMPLATES.INTERACTION: {
            const interaction = normalizeInteraction(event.payload);
            const config =
              (await this.db.getConfigByVersion(interaction.configVersion)) ||
              (await this.db.getActiveConfig(event.createdAt, { fallback: 'none' }));

            if (!config) { stats.warnings.push(`No config for interaction at offset ${event.offset}`); stats.ignored++; break; }

            const ratings = ratingsFromInteraction(interaction, config);
            if (!Object.keys(ratings).length) { stats.ignored++; break; }

            for (const party of interaction.participants)
              stats.applied += await this.applyRatings({ party, ratings, config, reason: 'INTERACTION_RULE', sourceId: event.contractId, ledgerOffset: event.offset });
            break;
          }
          case TEMPLATES.FEEDBACK: {
            const fb = normalizeFeedback(event.payload);
            const config =
              (await this.db.getActiveConfig(event.createdAt, { fallback: 'none' })) ||
              (await this.db.getConfigByVersion(1));

            if (!config) { stats.warnings.push(`No config for feedback at offset ${event.offset}`); stats.ignored++; break; }

            stats.applied += await this.applyRatings({ party: fb.to, ratings: fb.componentRatings, config, reason: `FEEDBACK_${fb.phase}`, sourceId: fb.interactionId, from: fb.from, ledgerOffset: event.offset });
            break;
          }
          case TEMPLATES.TOKEN:
          default:
            stats.ignored++;
        }
      } catch (e) {
        stats.warnings.push(`Event ${event.offset} failed: ${e.message}`);
      }

      this.checkpoint = event.offset;
    }

    return stats;
  }

  async applyRatings({ party, ratings, config, reason, sourceId, from = '', ledgerOffset = 0 }) {
    const roleId  = await this.resolveRole(party, config);
    const subject = await this.db.getOrCreateSubject(party, roleId, config);
    const { reputationFloor: floor, reputationCeiling: ceiling } = config.systemParameters;
    let applied = 0;

    for (const [componentId, ratingRaw] of Object.entries(ratings)) {
      const comp   = subject.components[componentId];
      const rating = Number(ratingRaw);
      if (!comp || !Number.isFinite(rating)) continue;

      const current = Number(comp.value);
      const step    = 1 / (comp.interactionCount + 2);
      comp.value             = round2(clamp(current + step * (rating - current), floor, ceiling));
      comp.interactionCount += 1;
      comp.history.unshift({ at: new Date().toISOString(), reason, sourceId, from, ledgerOffset, inputRating: rating, oldValue: current, newValue: comp.value });
      comp.history = comp.history.slice(0, 25);
      applied++;
    }

    subject.lastLedgerOffset = ledgerOffset;
    this.db.recomputeScore(subject, config);

    const token = subject.contractId
      ? await this.ledger.exercise(subject.contractId, TEMPLATES.TOKEN, 'UpdateScore', tokenPayload(subject))
      : await this.ledger.create(TEMPLATES.TOKEN, tokenPayload(subject));
    subject.contractId = token.contractId;

    await this.db.saveSubject(subject);
    return applied;
  }

  async resolveRole(party, config) {
    const existing = await this.db.getSubject(party);
    if (existing?.roleId)            return existing.roleId;
    if (config.partyRoles?.[party])  return config.partyRoles[party];
    if (config.defaultRoleId)        return config.defaultRoleId;
    return config.roleWeights[0]?.roleId || 'UNKNOWN_ROLE';
  }
}