import pg from 'pg';
import { clamp, round2 } from './math.js';

const { Pool } = pg;

function newComponent(comp) {
  return {
    componentId:      comp.componentId,
    description:      comp.description,
    value:            comp.initialValue,
    interactionCount: 0,
    history:          [],
  };
}

export class DB {
  constructor({ connectionString, pool = null }) {
    this.pool     = pool || new Pool({ connectionString });
    this.ownsPool = !pool;
  }

  async ensureReady() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS reputation_configurations (
        config_id       TEXT        NOT NULL,
        version         INTEGER     NOT NULL,
        activation_time TIMESTAMPTZ NOT NULL,
        payload         JSONB       NOT NULL,
        ledger_offset   BIGINT      NOT NULL DEFAULT 0,
        contract_id     TEXT        NOT NULL DEFAULT '',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (config_id, version)
      );
      ALTER TABLE reputation_configurations ADD COLUMN IF NOT EXISTS ledger_offset BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE reputation_configurations ADD COLUMN IF NOT EXISTS contract_id   TEXT   NOT NULL DEFAULT '';
      CREATE INDEX IF NOT EXISTS idx_configs_activation    ON reputation_configurations (activation_time DESC);
      CREATE INDEX IF NOT EXISTS idx_configs_ledger_offset ON reputation_configurations (ledger_offset);

      CREATE TABLE IF NOT EXISTS reputation_subjects (
        party              TEXT          PRIMARY KEY,
        role_id            TEXT          NOT NULL,
        overall_score      NUMERIC(10,2) NOT NULL,
        last_ledger_offset BIGINT        NOT NULL DEFAULT 0,
        contract_id        TEXT          NOT NULL DEFAULT '',
        payload            JSONB         NOT NULL,
        updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      );
      ALTER TABLE reputation_subjects ADD COLUMN IF NOT EXISTS last_ledger_offset BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE reputation_subjects ADD COLUMN IF NOT EXISTS contract_id        TEXT   NOT NULL DEFAULT '';
      CREATE INDEX IF NOT EXISTS idx_subjects_score ON reputation_subjects (overall_score DESC);

      CREATE TABLE IF NOT EXISTS party_roles (
        party       TEXT PRIMARY KEY,
        role_id     TEXT NOT NULL,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  // Wipe the read model so the engine can rebuild it cleanly from ledger offset 0.
  async reset() {
    await this.pool.query(`
      DELETE FROM reputation_subjects;
      DELETE FROM reputation_configurations;
      DELETE FROM party_roles;
    `);
  }

  async close() { if (this.ownsPool) await this.pool.end(); }

  // ── Configurations ──────────────────────────────────────────────────────────

  async addConfig(config, ledgerOffset = 0, contractId = '') {
    const result = await this.pool.query(
      `INSERT INTO reputation_configurations (config_id, version, activation_time, payload, ledger_offset, contract_id)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6) ON CONFLICT (config_id, version) DO NOTHING RETURNING 1`,
      [config.configId, config.version, config.activatedAt, JSON.stringify(config), ledgerOffset, contractId]
    );
    if (result.rowCount === 0) return;

    // Backfill any new components onto existing subjects
    for (const subject of await this.listSubjects()) {
      if (subject.configVersion === config.version) continue;
      for (const comp of config.components) {
        if (!subject.components[comp.componentId])
          subject.components[comp.componentId] = newComponent(comp);
      }
      subject.configVersion = config.version;
      this.recomputeScore(subject, config);
      await this.saveSubject(subject);
    }
  }

  async getAllConfigs() {
    const res = await this.pool.query(
      `SELECT config_id, version, activation_time, ledger_offset, contract_id, created_at, payload
       FROM reputation_configurations ORDER BY activation_time DESC, version DESC`
    );
    return res.rows;
  }

  async getAllSubjects() {
    const res = await this.pool.query(
      `SELECT party, role_id, overall_score, last_ledger_offset, contract_id, updated_at, payload
       FROM reputation_subjects ORDER BY overall_score DESC, party ASC`
    );
    return res.rows;
  }

  async getConfigByVersion(version) {
    const res = await this.pool.query(
      `SELECT payload FROM reputation_configurations WHERE version = $1
       ORDER BY activation_time DESC LIMIT 1`,
      [version]
    );
    return res.rows[0]?.payload;
  }

  async getActiveConfig(atIso = new Date().toISOString(), { fallback = 'upcoming' } = {}) {
    const at = isNaN(Date.parse(atIso)) ? new Date().toISOString() : new Date(atIso).toISOString();

    const active = await this.pool.query(
      `SELECT payload FROM reputation_configurations
       WHERE activation_time <= $1 ORDER BY activation_time DESC, version DESC LIMIT 1`,
      [at]
    );
    if (active.rowCount > 0) return active.rows[0].payload;
    if (fallback === 'none') return undefined;

    if (fallback === 'latest') {
      const r = await this.pool.query(
        `SELECT payload FROM reputation_configurations ORDER BY activation_time DESC, version DESC LIMIT 1`
      );
      return r.rows[0]?.payload;
    }

    const upcoming = await this.pool.query(
      `SELECT payload FROM reputation_configurations
       WHERE activation_time > $1 ORDER BY activation_time ASC, version DESC LIMIT 1`,
      [at]
    );
    if (upcoming.rowCount > 0) return upcoming.rows[0].payload;

    const latest = await this.pool.query(
      `SELECT payload FROM reputation_configurations ORDER BY activation_time DESC, version DESC LIMIT 1`
    );
    return latest.rows[0]?.payload;
  }

  // ── Party roles ─────────────────────────────────────────────────────────────

  // Persist a party→roleId mapping derived from a PartyRole contract event.
  async saveRole(party, roleId) {
    await this.pool.query(
      `INSERT INTO party_roles (party, role_id)
       VALUES ($1, $2)
       ON CONFLICT (party) DO UPDATE SET role_id = EXCLUDED.role_id`,
      [party, roleId]
    );
  }

  // Resolve the role for a party. Falls back to the first role in config
  // if no PartyRole contract has been seen for this party yet.
  async getRole(party, config) {
    const res = await this.pool.query(
      `SELECT role_id FROM party_roles WHERE party = $1`, [party]
    );
    if (res.rows[0]) return res.rows[0].role_id;
    return config.roleWeights[0]?.roleId || 'UNKNOWN_ROLE';
  }

  // ── Subjects ────────────────────────────────────────────────────────────────

  async getSubject(party) {
    const res = await this.pool.query(
      `SELECT payload FROM reputation_subjects WHERE party = $1`, [party]
    );
    return res.rows[0]?.payload;
  }

  async getOrCreateSubject(party, roleId, config) {
    const existing = await this.getSubject(party);
    if (existing) {
      existing.roleId        = roleId;
      existing.configVersion = config.version;
      return existing;
    }

    const subject = {
      party,
      roleId,
      configVersion: config.version,
      overallScore:  0,
      components:    Object.fromEntries(
        config.components.map((c) => [c.componentId, newComponent(c)])
      ),
      createdAt:  new Date().toISOString(),
      updatedAt:  new Date().toISOString(),
    };
    await this.saveSubject(subject);
    return subject;
  }

  async saveSubject(subject) {
    subject.updatedAt = new Date().toISOString();
    const lastOffset  = Number(subject.lastLedgerOffset || 0);
    const contractId  = String(subject.contractId || '');
    await this.pool.query(
      `INSERT INTO reputation_subjects (party, role_id, overall_score, last_ledger_offset, contract_id, payload, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (party) DO UPDATE SET
         role_id = EXCLUDED.role_id, overall_score = EXCLUDED.overall_score,
         last_ledger_offset = EXCLUDED.last_ledger_offset, contract_id = EXCLUDED.contract_id,
         payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`,
      [subject.party, subject.roleId, Number(subject.overallScore || 0), lastOffset, contractId, JSON.stringify(subject), subject.updatedAt]
    );
  }

  async listSubjects() {
    const res = await this.pool.query(
      `SELECT payload FROM reputation_subjects ORDER BY overall_score DESC, party ASC`
    );
    return res.rows.map((r) => r.payload);
  }

  async getRankings(limit = 50) {
    const n = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50;
    const res = await this.pool.query(
      `SELECT payload FROM reputation_subjects ORDER BY overall_score DESC, party ASC LIMIT $1`, [n]
    );
    return res.rows.map((r, i) => {
      const s = r.payload;
      return {
        rank:         i + 1,
        party:        s.party,
        roleId:       s.roleId,
        overallScore: s.overallScore,
        components:   Object.values(s.components ?? {}).map((c) => ({
          componentId: c.componentId,
          value:       c.value,
        })),
      };
    });
  }

  recomputeScore(subject, config) {
    const { reputationScoreFloor: floor, reputationScoreCeiling: ceiling } = config.systemParameters;
    const roleWeights  = config.roleWeights.find((r) => r.roleId === subject.roleId);
    const componentIds = Object.keys(subject.components ?? {});

    let weightedSum = 0, totalWeight = 0;
    if (roleWeights) {
      for (const id of componentIds) {
        const w = Number(roleWeights.componentWeights[id] ?? 0);
        if (w > 0) { weightedSum += subject.components[id].value * w; totalWeight += w; }
      }
    }
    if (totalWeight <= 0) {
      const eq = componentIds.length > 0 ? 1 / componentIds.length : 0;
      for (const id of componentIds) weightedSum += subject.components[id].value * eq;
      totalWeight = 1;
    }

    subject.overallScore = round2(clamp(totalWeight > 0 ? weightedSum / totalWeight : floor, floor, ceiling));
    subject.updatedAt    = new Date().toISOString();
  }
}