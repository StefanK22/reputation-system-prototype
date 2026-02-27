import { evaluateCondition } from '../lib/conditions.js';

export function evaluateInteractionRatings(interaction, configuration) {
  const interactionType = configuration.interactionTypes.find(
    (item) => item.interactionTypeId === interaction.interactionType
  );

  if (!interactionType) {
    return {};
  }

  const ratings = {};

  for (const rule of interactionType.ratingRules) {
    if (ratings[rule.componentId] != null) {
      continue;
    }

    const observed = interaction.outcome?.[rule.conditionField];
    if (evaluateCondition(observed, rule.conditionOperator, rule.conditionValue)) {
      ratings[rule.componentId] = rule.assignedRating;
    }
  }

  return ratings;
}
