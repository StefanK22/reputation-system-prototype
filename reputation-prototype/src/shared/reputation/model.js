function activationMillis(configuration) {
  const parsed = Date.parse(configuration.activationTime);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function compareByVersionDesc(a, b) {
  return b.version - a.version;
}

export function compareConfigurationsByActivationDesc(a, b) {
  const timeDiff = activationMillis(b) - activationMillis(a);
  if (timeDiff !== 0) {
    return timeDiff;
  }
  return compareByVersionDesc(a, b);
}

export function compareConfigurationsByActivationAsc(a, b) {
  const timeDiff = activationMillis(a) - activationMillis(b);
  if (timeDiff !== 0) {
    return timeDiff;
  }
  return compareByVersionDesc(a, b);
}

export function createSubjectComponent(component) {
  return {
    componentId: component.componentId,
    description: component.description,
    value: component.initialValue,
    interactionCount: 0,
    history: [],
  };
}
