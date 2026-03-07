import pg from 'pg';
import { clamp, round2 } from '../utils/math.js';

const { Pool } = pg;

function createComponent(comp) {
  return {
    componentId: comp.componentId,
    description: comp.description,
    value: comp.initialValue,
    interactionCount: 0,
    history: [],
  };
}

export class PostgresReadModelStore {
  constructor({ connectionString, pool = null }) {
    if (!connectionString && !pool) {
      throw new Error('PostgresReadModelStore requires either connectionString or pool.');
    }

    this.pool = pool || new Pool({ connectionString });
    this.ownsPool = !pool;
  }

  async ensureReady() {
    await this.pool.query('SELECT 1');
    await this.pool.query(
      `
      INSERT INTO engine_state (id, last_processed_offset)
      VALUES (1, 0)
      ON CONFLICT (id) DO NOTHING
      `
    );
  }

  async close() {
    if (this.ownsPool) {
      await this.pool.end();
    }
  }

  async addConfiguration(config) {
    const insertResult = await this.pool.query(
      `
      INSERT INTO reputation_configurations (config_id, version, activation_time, payload)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (config_id, version) DO NOTHING
      RETURNING 1
      `,
      [
        config.configId,
        config.version,
        config.activationTime,
        JSON.stringify(config),
      ]
    );

    if (insertResult.rowCount === 0) {
      return;
    }

    const subjects = await this.listSubjects();
    for (const subject of subjects) {
      if (subject.configVersion === config.version) {
        continue;
      }

      for (const comp of config.components) {
        if (!subject.components?.[comp.componentId]) {
          subject.components[comp.componentId] = createComponent(comp);
        }
      }

      subject.configVersion = config.version;
      this.recomputeOverallScore(subject, config);
      await this.saveSubject(subject);
    }
  }

  async getAllConfigurations() {
    const result = await this.pool.query(
      `
      SELECT payload
      FROM reputation_configurations
      ORDER BY activation_time DESC, version DESC
      `
    );
    return result.rows.map((row) => row.payload);
  }

  async getConfigurationByVersion(version) {
    const result = await this.pool.query(
      `
      SELECT payload
      FROM reputation_configurations
      WHERE version = $1
      ORDER BY activation_time DESC
      LIMIT 1
      `,
      [version]
    );
    return result.rows[0]?.payload;
  }

  async getActiveConfiguration(atIso = new Date().toISOString(), options = {}) {
    const fallback = options.fallback ?? 'upcoming';
    const parsedAt = Date.parse(atIso);
    const atValue = Number.isNaN(parsedAt) ? new Date().toISOString() : new Date(parsedAt).toISOString();

    const active = await this.pool.query(
      `
      SELECT payload
      FROM reputation_configurations
      WHERE activation_time <= $1
      ORDER BY activation_time DESC, version DESC
      LIMIT 1
      `,
      [atValue]
    );

    if (active.rowCount > 0) {
      return active.rows[0].payload;
    }

    if (fallback === 'none') {
      return undefined;
    }

    if (fallback === 'latest') {
      const latest = await this.pool.query(
        `
        SELECT payload
        FROM reputation_configurations
        ORDER BY activation_time DESC, version DESC
        LIMIT 1
        `
      );
      return latest.rows[0]?.payload;
    }

    const upcoming = await this.pool.query(
      `
      SELECT payload
      FROM reputation_configurations
      WHERE activation_time > $1
      ORDER BY activation_time ASC, version DESC
      LIMIT 1
      `,
      [atValue]
    );

    if (upcoming.rowCount > 0) {
      return upcoming.rows[0].payload;
    }

    const latest = await this.pool.query(
      `
      SELECT payload
      FROM reputation_configurations
      ORDER BY activation_time DESC, version DESC
      LIMIT 1
      `
    );
    return latest.rows[0]?.payload;
  }

  async getSubject(party) {
    const result = await this.pool.query(
      `
      SELECT payload
      FROM reputation_subjects
      WHERE party = $1
      `,
      [party]
    );
    return result.rows[0]?.payload;
  }

  async getOrCreateSubject(party, roleId, config) {
    const existing = await this.getSubject(party);

    if (!existing) {
      const components = Object.fromEntries(
        config.components.map((comp) => [comp.componentId, createComponent(comp)])
      );

      const created = {
        party,
        roleId,
        configVersion: config.version,
        overallScore: 0,
        components,
        updatedAt: new Date().toISOString(),
      };

      await this.saveSubject(created);
      return created;
    }

    existing.roleId = roleId;
    existing.configVersion = config.version;
    return existing;
  }

  async saveSubject(subject) {
    const updatedAt = subject.updatedAt || new Date().toISOString();
    subject.updatedAt = updatedAt;

    await this.pool.query(
      `
      INSERT INTO reputation_subjects (party, role_id, overall_score, payload, updated_at)
      VALUES ($1, $2, $3, $4::jsonb, $5)
      ON CONFLICT (party) DO UPDATE SET
        role_id = EXCLUDED.role_id,
        overall_score = EXCLUDED.overall_score,
        payload = EXCLUDED.payload,
        updated_at = EXCLUDED.updated_at
      `,
      [
        subject.party,
        subject.roleId,
        Number(subject.overallScore || 0),
        JSON.stringify(subject),
        updatedAt,
      ]
    );
  }

  async listSubjects() {
    const result = await this.pool.query(
      `
      SELECT payload
      FROM reputation_subjects
      ORDER BY overall_score DESC, party ASC
      `
    );
    return result.rows.map((row) => row.payload);
  }

  async getRankings(limit = 50) {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50;
    const result = await this.pool.query(
      `
      SELECT payload
      FROM reputation_subjects
      ORDER BY overall_score DESC, party ASC
      LIMIT $1
      `,
      [safeLimit]
    );

    return result.rows.map((row, index) => {
      const subject = row.payload;
      return {
        rank: index + 1,
        party: subject.party,
        roleId: subject.roleId,
        overallScore: subject.overallScore,
        components: Object.values(subject.components || {}).map((comp) => ({
          componentId: comp.componentId,
          value: comp.value,
        })),
      };
    });
  }

  recomputeOverallScore(subject, config) {
    const floor = config.systemParameters.reputationFloor;
    const ceiling = config.systemParameters.reputationCeiling;

    const roleWeights = config.roleWeights.find((item) => item.roleId === subject.roleId);
    const componentIds = Object.keys(subject.components || {});

    let weightedSum = 0;
    let totalWeight = 0;

    if (roleWeights) {
      for (const componentId of componentIds) {
        const comp = subject.components[componentId];
        const weight = Number(roleWeights.componentWeights[componentId] ?? 0);
        if (weight > 0) {
          weightedSum += comp.value * weight;
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

  async getCheckpoint() {
    const result = await this.pool.query(
      `
      SELECT last_processed_offset
      FROM engine_state
      WHERE id = 1
      `
    );
    const raw = result.rows[0]?.last_processed_offset ?? 0;
    return Number(raw);
  }

  async setCheckpoint(offset) {
    await this.pool.query(
      `
      INSERT INTO engine_state (id, last_processed_offset, updated_at)
      VALUES (1, $1, now())
      ON CONFLICT (id) DO UPDATE SET
        last_processed_offset = EXCLUDED.last_processed_offset,
        updated_at = EXCLUDED.updated_at
      `,
      [Number(offset) || 0]
    );
  }
}
