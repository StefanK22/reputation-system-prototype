import { clamp, round2 } from '../lib/conditions.js';

export class InMemoryReadModelStore {
  constructor() {
    this.subjects = new Map();
    this.configurations = [];
  }

  addConfiguration(configuration) {
    const exists = this.configurations.some(
      (item) => item.configId === configuration.configId && item.version === configuration.version
    );
    if (!exists) {
      this.configurations.push(configuration);
      this.subjects.forEach((subject) => {
        if (subject.configVersion !== configuration.version) {
          configuration.components.forEach((component) => {
            this.addComponentToSubject(subject.party, component.componentId, configuration);
          });
          subject.configVersion = configuration.version;
          this.recomputeOverallScore(subject, configuration); 
          this.saveSubject(subject);
        }
      });
    }
  }

  getAllConfigurations() {
    return [...this.configurations].sort((a, b) => {
      if (a.activationTime === b.activationTime) {
        return b.version - a.version;
      }
      return Date.parse(b.activationTime) - Date.parse(a.activationTime);
    });
  }

  getConfigurationByVersion(version) {
    return this.configurations.find((cfg) => cfg.version === version);
  }

  getActiveConfiguration(atIso = new Date().toISOString(), options = {}) {
    const fallback = options.fallback ?? 'upcoming';
    const parsedAt = Date.parse(atIso);
    const atMillis = Number.isNaN(parsedAt) ? Date.now() : parsedAt;

    const active = this.configurations
      .filter((cfg) => Date.parse(cfg.activationTime) <= atMillis)
      .sort((a, b) => {
        const timeDiff = Date.parse(b.activationTime) - Date.parse(a.activationTime);
        if (timeDiff !== 0) {
          return timeDiff;
        }
        return b.version - a.version;
      });

    if (active.length > 0) {
      return active[0];
    }

    if (fallback === 'none') {
      return undefined;
    }

    if (fallback === 'latest') {
      return this.getAllConfigurations()[0];
    }

    const upcoming = this.configurations
      .filter((cfg) => Date.parse(cfg.activationTime) > atMillis)
      .sort((a, b) => {
        const timeDiff = Date.parse(a.activationTime) - Date.parse(b.activationTime);
        if (timeDiff !== 0) {
          return timeDiff;
        }
        return b.version - a.version;
      });

    if (upcoming.length > 0) {
      return upcoming[0];
    }

    return this.getAllConfigurations()[0];
  }

  getSubject(party) {
    return this.subjects.get(party);
  }

  getOrCreateSubject(party, roleId, configuration) {
    const existing = this.subjects.get(party);

    if (!existing) {
      const components = Object.fromEntries(
        configuration.components.map((component) => [
          component.componentId,
          {
            componentId: component.componentId,
            description: component.description,
            value: component.initialValue,
            interactionCount: 0,
            history: [],
          },
        ])
      );

      const created = {
        party,
        roleId,
        configVersion: configuration.version,
        overallScore: 0,
        components,
        updatedAt: new Date().toISOString(),
      };

      this.subjects.set(party, created);
      return created;
    }

    existing.roleId = roleId;
    existing.configVersion = configuration.version;
    return existing;
  }

  addComponentToSubject(party, componentId, configuration) {
    const subject = this.subjects.get(party);
    const component = configuration.components.find(c => c.componentId === componentId);
    if (!subject.components[componentId]){
      console.log(`Adding component ${componentId} to subject ${party}`);
      subject.components[componentId] = {
        componentId: componentId,
        description: component.description,
        value: component.initialValue,
        interactionCount: 0,
        history: [], 
      }
    }

  }

  saveSubject(subject) {
    this.subjects.set(subject.party, subject);
  }

  listSubjects() {
    return [...this.subjects.values()];
  }

  getRankings(limit = 50) {
    return this.listSubjects()
      .sort((a, b) => b.overallScore - a.overallScore)
      .slice(0, limit)
      .map((subject, index) => ({
        rank: index + 1,
        party: subject.party,
        roleId: subject.roleId,
        overallScore: subject.overallScore,
        components: Object.values(subject.components).map(c => ({
          componentId: c.componentId,
          value: c.value
        }))
      }));
  }

  recomputeOverallScore(subject, configuration) {
    const floor = configuration.systemParameters.reputationFloor;
    const ceiling = configuration.systemParameters.reputationCeiling;

    const roleWeights = configuration.roleWeights.find((item) => item.roleId === subject.roleId);
    const componentIds = Object.keys(subject.components);

    let weightedSum = 0;
    let totalWeight = 0;

    if (roleWeights) {
      for (const componentId of componentIds) {
        const component = subject.components[componentId];
        const weight = Number(roleWeights.componentWeights[componentId] ?? 0);
        if (weight > 0) {
          weightedSum += component.value * weight;
          totalWeight += weight;
        }
      }
    }

    if (totalWeight <= 0) {
      const equalWeight = componentIds.length > 0 ? 1 / componentIds.length : 0;
      for (const componentId of componentIds) {
        weightedSum += subject.components[componentId].value * equalWeight;
      }
      totalWeight = 1;
    }

    const overall = totalWeight > 0 ? weightedSum / totalWeight : floor;
    subject.overallScore = round2(clamp(overall, floor, ceiling));
    subject.updatedAt = new Date().toISOString();
  }
}
