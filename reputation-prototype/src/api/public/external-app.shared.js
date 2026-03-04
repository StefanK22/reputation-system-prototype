import React from 'https://esm.sh/react@18.2.0';
import htm from 'https://esm.sh/htm@3.1.1';

export const html = htm.bind(React.createElement);
export const CONDITION_OPERATORS = ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE'];
const CONFIGURATION_FIELD_SIGNATURE = ['components', 'roleWeights', 'interactionTypes'];

export function pretty(value) {
  return JSON.stringify(value, null, 2);
}

export function deepClone(value) {
  if (value == null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

export function getByPath(source, path) {
  const keys = path.split('.');
  let current = source;

  for (const key of keys) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

export function setByPath(target, path, value) {
  const keys = path.split('.');
  let cursor = target;

  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    if (cursor[key] == null || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }

  cursor[keys[keys.length - 1]] = value;
}

export function stringifyFieldValue(value, type) {
  if (type === 'boolean') {
    return Boolean(value);
  }

  if (value == null) {
    if (type === 'object' || type === 'array' || type === 'numberMap') {
      return '';
    }
    return '';
  }

  if (type === 'object' || type === 'array' || type === 'numberMap') {
    return pretty(value);
  }

  return String(value);
}

export function parseFieldValue(rawValue, type) {
  if (type === 'boolean') {
    return Boolean(rawValue);
  }

  const text = String(rawValue ?? '').trim();

  if (type === 'number') {
    if (!text) {
      throw new Error('Expected number.');
    }
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
      throw new Error('Expected valid number.');
    }
    return parsed;
  }

  if (type === 'object' || type === 'array' || type === 'numberMap') {
    if (!text) {
      throw new Error('Expected JSON value.');
    }
    const parsed = JSON.parse(text);

    if (type === 'array' && !Array.isArray(parsed)) {
      throw new Error('Expected JSON array.');
    }

    if (type === 'object' && (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed))) {
      throw new Error('Expected JSON object.');
    }

    if (
      type === 'numberMap' &&
      (parsed == null ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed) ||
        !Object.values(parsed).every((item) => typeof item === 'number' && Number.isFinite(item)))
    ) {
      throw new Error('Expected object map with numeric values.');
    }

    return parsed;
  }

  return text;
}

export function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

export function requestJson(path, options = {}) {
  return fetch(path, options).then(async (response) => {
    const rawText = await response.text();
    const body = rawText ? JSON.parse(rawText) : {};

    if (!response.ok) {
      const detail = body.details ? ` (${body.details.join('; ')})` : '';
      throw new Error((body.error || `HTTP ${response.status}`) + detail);
    }

    return body;
  });
}

export function getContractDisplayName(definition) {
  if (!definition) {
    return 'Contract';
  }
  return definition.title || definition.templateId || 'Contract';
}

export function isReputationConfigurationDefinition(definition) {
  if (!definition || !Array.isArray(definition.fields)) {
    return false;
  }

  const fieldPaths = new Set(definition.fields.map((field) => field.path));
  return CONFIGURATION_FIELD_SIGNATURE.every((path) => fieldPaths.has(path));
}

export function createInitialFieldState(definition) {
  return Object.fromEntries(
    definition.fields.map((field) => {
      const fromSample = getByPath(definition.samplePayload, field.path);
      const value = fromSample === undefined ? field.defaultValue : fromSample;
      return [field.key, stringifyFieldValue(value, field.type)];
    })
  );
}

export function buildPayloadFromFields(definition, fieldState) {
  const payload = {};

  for (const field of definition.fields) {
    const current = fieldState[field.key];

    if (current === '' || current == null) {
      if (field.defaultValue !== undefined) {
        setByPath(payload, field.path, field.defaultValue);
      }
      continue;
    }

    const parsed = parseFieldValue(current, field.type);
    setByPath(payload, field.path, parsed);
  }

  return payload;
}

export function normalizeConfiguration(config, definition) {
  const fallback = deepClone(definition?.samplePayload || {});
  const base = {
    ...fallback,
    ...(config || {}),
  };

  base.systemParameters = {
    ...(fallback.systemParameters || {}),
    ...(config?.systemParameters || {}),
  };

  base.components = Array.isArray(config?.components)
    ? config.components.map((component) => ({
        componentId: String(component.componentId || ''),
        description: String(component.description || ''),
        initialValue: toFiniteNumber(component.initialValue, 70),
      }))
    : Array.isArray(fallback.components)
      ? deepClone(fallback.components)
      : [];

  base.roleWeights = Array.isArray(config?.roleWeights)
    ? config.roleWeights.map((role) => ({
        roleId: String(role.roleId || ''),
        componentWeights:
          role.componentWeights && typeof role.componentWeights === 'object' && !Array.isArray(role.componentWeights)
            ? Object.fromEntries(
                Object.entries(role.componentWeights).map(([componentId, weight]) => [
                  String(componentId),
                  toFiniteNumber(weight, 0),
                ])
              )
            : {},
      }))
    : Array.isArray(fallback.roleWeights)
      ? deepClone(fallback.roleWeights)
      : [];

  base.interactionTypes = Array.isArray(config?.interactionTypes)
    ? config.interactionTypes.map((interactionType) => ({
        interactionTypeId: String(interactionType.interactionTypeId || ''),
        description: String(interactionType.description || ''),
        ratingRules: Array.isArray(interactionType.ratingRules)
          ? interactionType.ratingRules.map((rule) => ({
              componentId: String(rule.componentId || ''),
              conditionField: String(rule.conditionField || ''),
              conditionOperator: String(rule.conditionOperator || 'EQ').toUpperCase(),
              conditionValue: toFiniteNumber(rule.conditionValue, 0),
              assignedRating: toFiniteNumber(rule.assignedRating, 70),
            }))
          : [],
      }))
    : Array.isArray(fallback.interactionTypes)
      ? deepClone(fallback.interactionTypes)
      : [];

  base.partyRoles =
    config?.partyRoles && typeof config.partyRoles === 'object' && !Array.isArray(config.partyRoles)
      ? Object.fromEntries(Object.entries(config.partyRoles).map(([party, roleId]) => [String(party), String(roleId)]))
      : fallback.partyRoles && typeof fallback.partyRoles === 'object'
        ? deepClone(fallback.partyRoles)
        : {};

  base.defaultRoleId = String(base.defaultRoleId || fallback.defaultRoleId || '');
  base.operator = String(base.operator || fallback.operator || '');
  base.configId = String(base.configId || fallback.configId || '');
  base.version = toFiniteNumber(base.version, 1);
  base.activationTime = String(base.activationTime || new Date().toISOString());
  base.systemParameters.reputationFloor = toFiniteNumber(base.systemParameters.reputationFloor, 0);
  base.systemParameters.reputationCeiling = toFiniteNumber(base.systemParameters.reputationCeiling, 100);


  return base;
}

export function serializeConfigurationDraft(draft) {
  const payload = deepClone(draft);

  payload.version = toFiniteNumber(payload.version, 1);
  payload.systemParameters = {
    ...(payload.systemParameters || {}),
    reputationFloor: toFiniteNumber(payload.systemParameters?.reputationFloor, 0),
    reputationCeiling: toFiniteNumber(payload.systemParameters?.reputationCeiling, 100),
  };

  payload.components = (payload.components || []).map((component) => ({
    componentId: String(component.componentId || ''),
    description: String(component.description || ''),
    initialValue: toFiniteNumber(component.initialValue, 70),
  }));

  payload.roleWeights = (payload.roleWeights || []).map((role) => ({
    roleId: String(role.roleId || ''),
    componentWeights: Object.fromEntries(
      Object.entries(role.componentWeights || {}).map(([componentId, weight]) => [
        componentId,
        toFiniteNumber(weight, 0),
      ])
    ),
  }));

  payload.interactionTypes = (payload.interactionTypes || []).map((interactionType) => ({
    interactionTypeId: String(interactionType.interactionTypeId || ''),
    description: String(interactionType.description || ''),
    ratingRules: (interactionType.ratingRules || []).map((rule) => ({
      componentId: String(rule.componentId || ''),
      conditionField: String(rule.conditionField || ''),
      conditionOperator: String(rule.conditionOperator || 'EQ').toUpperCase(),
      conditionValue: toFiniteNumber(rule.conditionValue, 0),
      assignedRating: toFiniteNumber(rule.assignedRating, 70),
    })),
  }));

  payload.partyRoles = Object.fromEntries(
    Object.entries(payload.partyRoles || {}).map(([party, roleId]) => [String(party), String(roleId)])
  );

  payload.defaultRoleId = String(payload.defaultRoleId || '');
  payload.operator = String(payload.operator || '');
  payload.configId = String(payload.configId || '');
  payload.activationTime = String(payload.activationTime || new Date().toISOString());

  return payload;
}
