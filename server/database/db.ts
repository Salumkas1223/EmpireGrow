import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { GAME_CONFIG, PLOT_BLUEPRINTS } from '../../config/gameConfig.ts';
import { RESOURCES } from '../../shared/gameData.ts';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.SQLITE_PATH || path.join(dataDir, 'digitalempire.sqlite');
export const db = new DatabaseSync(dbPath);

// Enable WAL mode and foreign keys for concurrency & data integrity
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      empire_name TEXT NOT NULL,
      avatar_color TEXT NOT NULL DEFAULT '#38bdf8',
      cash REAL NOT NULL,
      debt REAL NOT NULL DEFAULT 0,
      credits INTEGER NOT NULL DEFAULT 500,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      language TEXT NOT NULL DEFAULT 'de',
      active_skin TEXT NOT NULL DEFAULT 'skin_default',
      premium_tier INTEGER NOT NULL DEFAULT 0,
      trades_count INTEGER NOT NULL DEFAULT 0,
      settings_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS owned_plots (
      player_id TEXT NOT NULL,
      plot_id TEXT NOT NULL,
      purchased_at INTEGER NOT NULL,
      PRIMARY KEY (player_id, plot_id),
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS buildings (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      plot_id TEXT NOT NULL,
      company_id TEXT,
      building_type TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      rotation INTEGER NOT NULL DEFAULT 0,
      skin_id TEXT NOT NULL DEFAULT 'skin_default',
      custom_color TEXT NOT NULL DEFAULT '',
      is_constructing INTEGER NOT NULL DEFAULT 1,
      build_started_at INTEGER NOT NULL,
      build_completes_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(player_id, plot_id),
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      name TEXT NOT NULL,
      industry_id TEXT NOT NULL,
      price_multiplier REAL NOT NULL DEFAULT 1.0,
      reputation REAL NOT NULL DEFAULT 50.0,
      market_share REAL NOT NULL DEFAULT 1.0,
      revenue_total REAL NOT NULL DEFAULT 0,
      expenses_total REAL NOT NULL DEFAULT 0,
      auto_managed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      company_id TEXT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT NOT NULL DEFAULT 'operations',
      skill INTEGER NOT NULL DEFAULT 1,
      salary REAL NOT NULL,
      experience INTEGER NOT NULL DEFAULT 0,
      productivity REAL NOT NULL DEFAULT 1.0,
      satisfaction REAL NOT NULL DEFAULT 80.0,
      hired_at INTEGER NOT NULL,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inventory (
      player_id TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (player_id, resource_id),
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS player_research (
      player_id TEXT NOT NULL,
      tech_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'researching',
      completes_at INTEGER NOT NULL,
      PRIMARY KEY (player_id, tech_id),
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS claimed_missions (
      player_id TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      claimed_at INTEGER NOT NULL,
      PRIMARY KEY (player_id, mission_id),
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS market_prices (
      resource_id TEXT PRIMARY KEY,
      current_price REAL NOT NULL,
      supply REAL NOT NULL,
      demand REAL NOT NULL,
      trend REAL NOT NULL DEFAULT 0,
      history_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trade_offers (
      id TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL,
      seller_name TEXT NOT NULL,
      buyer_id TEXT,
      resource_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alliances (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      tag TEXT NOT NULL,
      leader_id TEXT NOT NULL,
      treasury REAL NOT NULL DEFAULT 0,
      project_name TEXT NOT NULL DEFAULT 'Trans-Oceanic Trade Hub',
      project_progress REAL NOT NULL DEFAULT 0,
      project_target REAL NOT NULL DEFAULT 500000,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alliance_members (
      alliance_id TEXT NOT NULL,
      player_id TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'member',
      contributed REAL NOT NULL DEFAULT 0,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (alliance_id, player_id),
      FOREIGN KEY (alliance_id) REFERENCES alliances(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS financial_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      game_hour INTEGER NOT NULL,
      cash REAL NOT NULL,
      net_worth REAL NOT NULL,
      revenue_hr REAL NOT NULL,
      expenses_hr REAL NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cosmetics_owned (
      player_id TEXT NOT NULL,
      cosmetic_id TEXT NOT NULL,
      unlocked_at INTEGER NOT NULL,
      PRIMARY KEY (player_id, cosmetic_id),
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );
  `);

  // Safe idempotent migration for pre-existing local SQLite databases
  const playerCols = db.prepare('PRAGMA table_info(players)').all() as Array<{ name: string }>;
  if (!playerCols.some((c) => c.name === 'debt')) {
    db.exec('ALTER TABLE players ADD COLUMN debt REAL NOT NULL DEFAULT 0;');
  }

  // Seed world state if empty
  const upsertWorld = db.prepare(`INSERT OR IGNORE INTO world_state (key, value) VALUES (?, ?)`);
  upsertWorld.run('gameHour', '8');
  upsertWorld.run('weather', 'clear');
  upsertWorld.run('economicCycle', 'growth');
  upsertWorld.run('inflationRate', '0.022');
  upsertWorld.run('marketHeadlineDe', 'Stabiles Stadtwachstum stützt Industrie- und Logistiknachfrage.');
  upsertWorld.run('marketHeadlineEn', 'Steady urban expansion supports industrial and logistics demand.');

  // Seed market prices if empty
  const insertMarket = db.prepare(`
    INSERT OR IGNORE INTO market_prices (resource_id, current_price, supply, demand, trend, history_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const res of RESOURCES) {
    const initialHistory = Array.from({ length: 20 }, (_, i) =>
      Math.round(res.basePrice * (0.96 + Math.sin(i * 0.5) * 0.04))
    );
    insertMarket.run(res.id, res.basePrice, 1000, 1000, 0, JSON.stringify(initialHistory));
  }
}

export function createNewPlayer(playerId: string, name: string, empireName: string, language = 'de'): void {
  const now = Date.now();
  const tx = db.prepare('SELECT id FROM players WHERE id = ?').get(playerId);
  if (tx) return;

  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO players (id, name, empire_name, cash, credits, xp, level, language, active_skin, settings_json, created_at, last_active_at)
      VALUES (?, ?, ?, ?, 600, 0, 1, ?, 'skin_default', ?, ?, ?)
    `).run(
      playerId,
      name.slice(0, 32) || 'CEO',
      empireName.slice(0, 40) || 'Horizon Holdings',
      GAME_CONFIG.STARTING_CASH,
      language === 'en' ? 'en' : 'de',
      JSON.stringify({ soundMaster: 0.65, soundMusic: 0.4, soundCity: 0.5, soundUi: 0.7, muted: false, quality: 'high' }),
      now,
      now
    );

    // Players start with zero owned plots and zero buildings ($100,000 cash only)

    // Grant starting materials
    const invStmt = db.prepare(`INSERT INTO inventory (player_id, resource_id, quantity) VALUES (?, ?, ?)`);
    for (const r of RESOURCES) {
      const startQty = (GAME_CONFIG.STARTING_MATERIALS as Record<string, number>)[r.id] ?? 0;
      invStmt.run(playerId, r.id, startQty);
    }

    // Unlock default skin
    db.prepare(`INSERT INTO cosmetics_owned (player_id, cosmetic_id, unlocked_at) VALUES (?, 'skin_default', ?)`).run(playerId, now);

    // Initial financial snapshot
    db.prepare(`
      INSERT INTO financial_history (player_id, game_hour, cash, net_worth, revenue_hr, expenses_hr, timestamp)
      VALUES (?, 0, ?, ?, 0, 0, ?)
    `).run(playerId, GAME_CONFIG.STARTING_CASH, GAME_CONFIG.STARTING_CASH, now);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getWorldState(): {
  gameHour: number;
  weather: string;
  economicCycle: string;
  inflationRate: number;
  marketHeadlineDe: string;
  marketHeadlineEn: string;
} {
  const rows = db.prepare('SELECT key, value FROM world_state').all() as Array<{ key: string; value: string }>;
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    gameHour: Number(map.gameHour ?? 8),
    weather: map.weather ?? 'clear',
    economicCycle: map.economicCycle ?? 'growth',
    inflationRate: Number(map.inflationRate ?? 0.022),
    marketHeadlineDe: map.marketHeadlineDe ?? 'Stabiles Stadtwachstum stützt Industrie- und Logistiknachfrage.',
    marketHeadlineEn: map.marketHeadlineEn ?? 'Steady urban expansion supports industrial and logistics demand.',
  };
}

export function setWorldState(key: string, value: string): void {
  db.prepare(`INSERT INTO world_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}

export function getPlayerResearchBonus(playerId: string): Record<string, number> {
  const rows = db.prepare(`SELECT tech_id FROM player_research WHERE player_id = ? AND status = 'completed'`).all(playerId) as Array<{ tech_id: string }>;
  const completed = new Set(rows.map((r) => r.tech_id));
  return {
    completedCount: completed.size,
    outputMult: (completed.has('automation_1') ? 0.15 : 0) + (completed.has('automation_2') ? 0.25 : 0) + (completed.has('robotics_1') ? 0.12 : 0) + (completed.has('production_1') ? 0.10 : 0),
    revenueMult: (completed.has('logistics_1') ? 0.08 : 0) + (completed.has('logistics_2') ? 0.12 : 0) + (completed.has('management_2') ? 0.15 : 0),
    techRevenueMult: completed.has('ai_1') ? 0.15 : 0,
    productivityMult: completed.has('ai_2') ? 0.20 : 0,
    wageDiscount: completed.has('robotics_2') ? 0.20 : 0,
    energyDiscount: (completed.has('energy_1') ? 0.18 : 0) + (completed.has('energy_2') ? 0.25 : 0),
    transportDiscount: (completed.has('transport_1') ? 0.20 : 0) + (completed.has('transport_2') ? 0.25 : 0),
    buildDiscount: completed.has('production_2') ? 0.15 : 0,
    demandMult: (completed.has('marketing_1') ? 0.15 : 0) + (completed.has('marketing_2') ? 0.25 : 0),
    taxDiscount: completed.has('management_1') ? 0.03 : 0,
    maintDiscount: completed.has('automation_2') ? 0.10 : 0,
  };
}
