import express from 'express';
import crypto from 'node:crypto';
import { db, createNewPlayer, getWorldState, getPlayerResearchBonus } from '../database/db.ts';
import { calculateOfflineProgress, calculatePlayerFinancials, computeLevelFromXp, xpForNextLevel } from '../economy/EconomyEngine.ts';
import { GAME_CONFIG, PLOT_BLUEPRINTS, DISTRICTS } from '../../config/gameConfig.ts';
import {
  BUILDINGS,
  COSMETICS,
  EMPLOYEE_FIRST_NAMES,
  EMPLOYEE_LAST_NAMES,
  EMPLOYEE_ROLES,
  INDUSTRIES,
  MISSIONS,
  RESOURCES,
  TECHNOLOGIES,
  getUpgradeDurationSec,
} from '../../shared/gameData.ts';

const buildingMap = new Map(BUILDINGS.map((b) => [b.id, b]));
const plotMap = new Map(PLOT_BLUEPRINTS.map((p) => [p.id, p]));
const industryMap = new Map(INDUSTRIES.map((i) => [i.id, i]));
const techMap = new Map(TECHNOLOGIES.map((t) => [t.id, t]));
const resourceMap = new Map(RESOURCES.map((r) => [r.id, r]));
const missionMap = new Map(MISSIONS.map((m) => [m.id, m]));
const cosmeticMap = new Map(COSMETICS.map((c) => [c.id, c]));

export function buildFullPlayerState(playerId: string) {
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId) as {
    id: string;
    name: string;
    empire_name: string;
    level: number;
    xp: number;
    cash: number;
    credits: number;
    language: string;
    active_skin: string;
    trades_count: number;
    settings_json: string;
    [key: string]: unknown;
  } | undefined;
  if (!player) return null;

  const financials = calculatePlayerFinancials(playerId);
  const world = getWorldState();
  const ownedPlots = (db.prepare('SELECT plot_id, purchased_at FROM owned_plots WHERE player_id = ?').all(playerId) as Array<{ plot_id: string; purchased_at: number }>).map((p) => p.plot_id);
  const buildings = db.prepare('SELECT * FROM buildings WHERE player_id = ?').all(playerId);
  const companies = db.prepare('SELECT * FROM companies WHERE player_id = ?').all(playerId);
  const employees = db.prepare('SELECT * FROM employees WHERE player_id = ?').all(playerId);
  const inventoryRows = db.prepare('SELECT resource_id, quantity FROM inventory WHERE player_id = ?').all(playerId) as Array<{ resource_id: string; quantity: number }>;
  const inventory: Record<string, number> = {};
  for (const r of inventoryRows) inventory[r.resource_id] = Math.round(r.quantity * 100) / 100;

  const research = db.prepare('SELECT * FROM player_research WHERE player_id = ?').all(playerId);
  const claimedMissions = (db.prepare('SELECT mission_id FROM claimed_missions WHERE player_id = ?').all(playerId) as Array<{ mission_id: string }>).map((m) => m.mission_id);
  const market = db.prepare('SELECT * FROM market_prices').all();
  const tradeOffers = db.prepare(`SELECT * FROM trade_offers WHERE status = 'open' ORDER BY created_at DESC LIMIT 40`).all();
  const financialHistory = db.prepare('SELECT * FROM financial_history WHERE player_id = ? ORDER BY id ASC').all(playerId);
  const cosmeticsOwned = (db.prepare('SELECT cosmetic_id FROM cosmetics_owned WHERE player_id = ?').all(playerId) as Array<{ cosmetic_id: string }>).map((c) => c.cosmetic_id);

  const allianceMembership = db.prepare(`
    SELECT a.*, am.role as member_role, am.contributed
    FROM alliance_members am JOIN alliances a ON a.id = am.alliance_id
    WHERE am.player_id = ?
  `).get(playerId);

  const alliances = db.prepare(`
    SELECT a.*, (SELECT COUNT(*) FROM alliance_members am WHERE am.alliance_id = a.id) as member_count
    FROM alliances a ORDER BY a.project_progress DESC LIMIT 20
  `).all();

  return {
    player: {
      ...player,
      settings: JSON.parse(String(player.settings_json || '{}')),
      nextLevelXp: xpForNextLevel(Number(player.level || 1)),
    },
    financials,
    world,
    ownedPlots,
    buildings,
    companies,
    employees,
    inventory,
    research,
    claimedMissions,
    market,
    tradeOffers,
    financialHistory,
    cosmeticsOwned,
    alliance: allianceMembership ?? null,
    alliances,
  };
}

export function createApiRouter(broadcastEvent: (type: string, payload: unknown, targetPlayerId?: string) => void) {
  const router = express.Router();

  // Catalogs
  router.get('/catalog', (_req, res) => {
    res.json({
      config: GAME_CONFIG,
      districts: DISTRICTS,
      plots: PLOT_BLUEPRINTS,
      industries: INDUSTRIES,
      buildings: BUILDINGS,
      resources: RESOURCES,
      technologies: TECHNOLOGIES,
      missions: MISSIONS,
      cosmetics: COSMETICS,
      employeeRoles: EMPLOYEE_ROLES,
    });
  });

  // Session init / resume
  router.post('/session', (req, res) => {
    const { playerId, name, empireName, language } = req.body as {
      playerId?: string;
      name?: string;
      empireName?: string;
      language?: string;
    };

    const pid = (playerId && /^[a-zA-Z0-9_-]{6,64}$/.test(playerId)) ? playerId : `emp_${crypto.randomUUID()}`;
    const existing = db.prepare('SELECT id FROM players WHERE id = ?').get(pid);
    let offlineReport = null;

    if (!existing) {
      createNewPlayer(pid, name || 'CEO', empireName || 'Apex Holdings', language || 'de');
    } else {
      offlineReport = calculateOfflineProgress(pid);
    }

    const state = buildFullPlayerState(pid);
    res.json({ playerId: pid, state, offlineReport });
  });

  // Full state fetch
  router.get('/state/:playerId', (req, res) => {
    const state = buildFullPlayerState(req.params.playerId);
    if (!state) return res.status(404).json({ error: 'Player not found' });
    res.json(state);
  });

  // Buy plot
  router.post('/plots/buy', (req, res) => {
    const { playerId, plotId } = req.body as { playerId: string; plotId: string };
    const bp = plotMap.get(plotId);
    if (!bp) return res.status(400).json({ error: 'Invalid plot' });

    const player = db.prepare('SELECT cash, xp FROM players WHERE id = ?').get(playerId) as { cash: number; xp: number } | undefined;
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const already = db.prepare('SELECT 1 FROM owned_plots WHERE player_id = ? AND plot_id = ?').get(playerId, plotId);
    if (already) return res.status(400).json({ error: 'Plot already owned' });
    if (player.cash < bp.basePrice) return res.status(400).json({ error: 'Insufficient funds' });

    const now = Date.now();
    const newXp = player.xp + 80;
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE players SET cash = cash - ?, xp = ?, level = ? WHERE id = ?').run(bp.basePrice, newXp, computeLevelFromXp(newXp), playerId);
      db.prepare('INSERT INTO owned_plots (player_id, plot_id, purchased_at) VALUES (?, ?, ?)').run(playerId, plotId, now);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: String(e) });
    }

    res.json({ state: buildFullPlayerState(playerId) });
  });

  // Construct building
  router.post('/buildings/construct', (req, res) => {
    const { playerId, plotId, buildingType, companyId, rotation } = req.body as {
      playerId: string;
      plotId: string;
      buildingType: string;
      companyId?: string;
      rotation?: number;
    };

    const def = buildingMap.get(buildingType);
    const bp = plotMap.get(plotId);
    if (!def || !bp) return res.status(400).json({ error: 'Invalid plot or building type' });

    const ownsPlot = db.prepare('SELECT 1 FROM owned_plots WHERE player_id = ? AND plot_id = ?').get(playerId, plotId);
    if (!ownsPlot) return res.status(400).json({ error: 'You do not own this plot' });

    const occupied = db.prepare('SELECT 1 FROM buildings WHERE player_id = ? AND plot_id = ?').get(playerId, plotId);
    if (occupied) return res.status(400).json({ error: 'Plot already occupied' });

    if (def.requiredTech) {
      const hasTech = db.prepare(`SELECT 1 FROM player_research WHERE player_id = ? AND tech_id = ? AND status = 'completed'`).get(playerId, def.requiredTech);
      if (!hasTech) return res.status(400).json({ error: `Requires technology: ${def.requiredTech}` });
    }

    const player = db.prepare('SELECT cash, xp, active_skin FROM players WHERE id = ?').get(playerId) as { cash: number; xp: number; active_skin: string } | undefined;
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const bonus = getPlayerResearchBonus(playerId);

    // Check materials & compute auto-purchase shortfall cost if player lacks raw materials
    const invRows = db.prepare('SELECT resource_id, quantity FROM inventory WHERE player_id = ?').all(playerId) as Array<{ resource_id: string; quantity: number }>;
    const invMap = new Map(invRows.map((i) => [i.resource_id, i.quantity]));
    const marketRows = db.prepare('SELECT resource_id, current_price FROM market_prices').all() as Array<{ resource_id: string; current_price: number }>;
    const priceMap = new Map(marketRows.map((m) => [m.resource_id, m.current_price]));

    let shortfallCost = 0;
    const matToConsume: Record<string, number> = {};
    for (const [resId, rawQty] of Object.entries(def.materials)) {
      const needed = Math.max(1, Math.round(rawQty * (1 - bonus.buildDiscount)));
      const owned = invMap.get(resId) ?? 0;
      if (owned >= needed) {
        matToConsume[resId] = needed;
      } else {
        matToConsume[resId] = owned;
        const missing = needed - owned;
        shortfallCost += missing * (priceMap.get(resId) ?? 300);
      }
    }

    const totalCost = Math.round(def.cost + shortfallCost);
    if (player.cash < totalCost) return res.status(400).json({ error: `Insufficient funds (need $${totalCost.toLocaleString()})` });

    // Auto-create or pick company if none specified
    let targetCompanyId = companyId || null;
    if (targetCompanyId) {
      const validComp = db.prepare('SELECT 1 FROM companies WHERE id = ? AND player_id = ?').get(targetCompanyId, playerId);
      if (!validComp) targetCompanyId = null;
    }
    if (!targetCompanyId) {
      const matchComp = db.prepare('SELECT id FROM companies WHERE player_id = ? AND industry_id = ? LIMIT 1').get(playerId, def.industryId) as { id: string } | undefined;
      targetCompanyId = matchComp?.id ?? null;
    }

    const now = Date.now();
    const buildMs = def.buildTimeSec * 1000;
    const id = `bld_${crypto.randomUUID().slice(0, 12)}`;
    const newXp = player.xp + 160;

    db.exec('BEGIN');
    try {
      db.prepare('UPDATE players SET cash = cash - ?, xp = ?, level = ? WHERE id = ?').run(totalCost, newXp, computeLevelFromXp(newXp), playerId);
      for (const [resId, qty] of Object.entries(matToConsume)) {
        if (qty > 0) {
          db.prepare('UPDATE inventory SET quantity = MAX(0, quantity - ?) WHERE player_id = ? AND resource_id = ?').run(qty, playerId, resId);
        }
      }
      db.prepare(`
        INSERT INTO buildings (id, player_id, plot_id, company_id, building_type, level, rotation, skin_id, custom_color, is_constructing, build_started_at, build_completes_at, created_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, '', 1, ?, ?, ?)
      `).run(id, playerId, plotId, targetCompanyId, buildingType, ((rotation ?? 0) % 4 + 4) % 4, player.active_skin, now, now + buildMs, now);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: String(e) });
    }

    res.json({ buildingId: id, state: buildFullPlayerState(playerId) });
  });

  // Upgrade building
  router.post('/buildings/upgrade', (req, res) => {
    const { playerId, buildingId } = req.body as { playerId: string; buildingId: string };
    const bld = db.prepare('SELECT * FROM buildings WHERE id = ? AND player_id = ?').get(buildingId, playerId) as {
      id: string;
      building_type: string;
      level: number;
      is_constructing: number;
    } | undefined;
    if (!bld) return res.status(404).json({ error: 'Building not found' });
    if (bld.is_constructing === 1) return res.status(400).json({ error: 'Construction still in progress' });

    const def = buildingMap.get(bld.building_type);
    if (!def || bld.level >= def.maxLevel) return res.status(400).json({ error: 'Max level reached' });

    const upgradeCost = Math.round(def.cost * 0.72 * bld.level);
    const player = db.prepare('SELECT cash, xp FROM players WHERE id = ?').get(playerId) as { cash: number; xp: number } | undefined;
    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (player.cash < upgradeCost) return res.status(400).json({ error: 'Insufficient funds' });

    const now = Date.now();
    const upgradeMs = getUpgradeDurationSec(def.buildTimeSec, bld.level) * 1000;
    const newXp = player.xp + 120 * bld.level;
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE players SET cash = cash - ?, xp = ?, level = ? WHERE id = ?').run(upgradeCost, newXp, computeLevelFromXp(newXp), playerId);
      db.prepare('UPDATE buildings SET level = level + 1, is_constructing = 1, build_started_at = ?, build_completes_at = ? WHERE id = ?').run(now, now + upgradeMs, buildingId);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: String(e) });
    }
    res.json({ state: buildFullPlayerState(playerId) });
  });

  // Customize building (rotate, skin, color, assign company)
  router.post('/buildings/customize', (req, res) => {
    const { playerId, buildingId, rotation, skinId, customColor, companyId } = req.body as {
      playerId: string;
      buildingId: string;
      rotation?: number;
      skinId?: string;
      customColor?: string;
      companyId?: string | null;
    };

    const bld = db.prepare('SELECT * FROM buildings WHERE id = ? AND player_id = ?').get(buildingId, playerId);
    if (!bld) return res.status(404).json({ error: 'Building not found' });

    if (skinId) {
      const ownsSkin = db.prepare('SELECT 1 FROM cosmetics_owned WHERE player_id = ? AND cosmetic_id = ?').get(playerId, skinId);
      if (!ownsSkin) return res.status(400).json({ error: 'Skin not unlocked' });
      db.prepare('UPDATE buildings SET skin_id = ? WHERE id = ?').run(skinId, buildingId);
    }
    if (typeof rotation === 'number') {
      db.prepare('UPDATE buildings SET rotation = ? WHERE id = ?').run(((rotation % 4) + 4) % 4, buildingId);
    }
    if (typeof customColor === 'string') {
      db.prepare('UPDATE buildings SET custom_color = ? WHERE id = ?').run(customColor.slice(0, 16), buildingId);
    }
    if (companyId !== undefined) {
      db.prepare('UPDATE buildings SET company_id = ? WHERE id = ?').run(companyId, buildingId);
    }
    res.json({ state: buildFullPlayerState(playerId) });
  });

  // Demolish / sell building
  router.post('/buildings/demolish', (req, res) => {
    const { playerId, buildingId } = req.body as { playerId: string; buildingId: string };
    const bld = db.prepare('SELECT * FROM buildings WHERE id = ? AND player_id = ?').get(buildingId, playerId) as {
      building_type: string;
      level: number;
    } | undefined;
    if (!bld) return res.status(404).json({ error: 'Building not found' });

    const def = buildingMap.get(bld.building_type);
    const refund = def ? Math.round(def.cost * 0.5 * bld.level) : 5000;

    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM buildings WHERE id = ? AND player_id = ?').run(buildingId, playerId);
      db.prepare('UPDATE players SET cash = cash + ? WHERE id = ?').run(refund, playerId);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: String(e) });
    }
    res.json({ refund, state: buildFullPlayerState(playerId) });
  });

  // Found company
  router.post('/companies/found', (req, res) => {
    const { playerId, name, industryId } = req.body as { playerId: string; name: string; industryId: string };
    const ind = industryMap.get(industryId);
    if (!ind) return res.status(400).json({ error: 'Invalid industry' });
    if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Company name too short' });

    const player = db.prepare('SELECT cash, xp FROM players WHERE id = ?').get(playerId) as { cash: number; xp: number } | undefined;
    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (player.cash < ind.foundingCost) return res.status(400).json({ error: 'Insufficient capital' });

    const id = `cmp_${crypto.randomUUID().slice(0, 12)}`;
    const now = Date.now();
    const newXp = player.xp + 200;

    db.exec('BEGIN');
    try {
      db.prepare('UPDATE players SET cash = cash - ?, xp = ?, level = ? WHERE id = ?').run(ind.foundingCost, newXp, computeLevelFromXp(newXp), playerId);
      db.prepare(`
        INSERT INTO companies (id, player_id, name, industry_id, price_multiplier, reputation, market_share, created_at)
        VALUES (?, ?, ?, ?, 1.0, 55.0, 1.5, ?)
      `).run(id, playerId, name.trim().slice(0, 40), industryId, now);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: String(e) });
    }

    res.json({ companyId: id, state: buildFullPlayerState(playerId) });
  });

  // Update company pricing / manager automation
  router.post('/companies/update', (req, res) => {
    const { playerId, companyId, priceMultiplier, autoManaged } = req.body as {
      playerId: string;
      companyId: string;
      priceMultiplier?: number;
      autoManaged?: boolean;
    };
    const comp = db.prepare('SELECT * FROM companies WHERE id = ? AND player_id = ?').get(companyId, playerId);
    if (!comp) return res.status(404).json({ error: 'Company not found' });

    if (typeof priceMultiplier === 'number') {
      const clamped = Math.max(0.6, Math.min(1.8, Math.round(priceMultiplier * 100) / 100));
      db.prepare('UPDATE companies SET price_multiplier = ? WHERE id = ?').run(clamped, companyId);
    }
    if (typeof autoManaged === 'boolean') {
      if (autoManaged) {
        const hasManager = db.prepare(`SELECT 1 FROM employees WHERE player_id = ? AND company_id = ? AND role = 'manager'`).get(playerId, companyId);
        if (!hasManager) return res.status(400).json({ error: 'Assign a Manager to this company first' });
      }
      db.prepare('UPDATE companies SET auto_managed = ? WHERE id = ?').run(autoManaged ? 1 : 0, companyId);
    }

    res.json({ state: buildFullPlayerState(playerId) });
  });

  // Generate hireable candidates
  router.get('/employees/candidates', (_req, res) => {
    const candidates = Array.from({ length: 6 }, (_, idx) => {
      const roleDef = EMPLOYEE_ROLES[idx % EMPLOYEE_ROLES.length];
      const skill = 1 + Math.floor(Math.random() * 5);
      const first = EMPLOYEE_FIRST_NAMES[Math.floor(Math.random() * EMPLOYEE_FIRST_NAMES.length)];
      const last = EMPLOYEE_LAST_NAMES[Math.floor(Math.random() * EMPLOYEE_LAST_NAMES.length)];
      const salary = Math.round(roleDef.baseSalary * (0.85 + skill * 0.18));
      const hireFee = salary * 12;
      return {
        candidateId: `cand_${crypto.randomUUID().slice(0, 8)}`,
        name: `${first} ${last}`,
        role: roleDef.id,
        skill,
        salary,
        hireFee,
        productivity: Number((0.92 + skill * 0.06).toFixed(2)),
      };
    });
    res.json({ candidates });
  });

  // Hire employee
  router.post('/employees/hire', (req, res) => {
    const { playerId, companyId, name, role, skill, salary, hireFee, department } = req.body as {
      playerId: string;
      companyId?: string;
      name: string;
      role: string;
      skill: number;
      salary: number;
      hireFee: number;
      department?: string;
    };

    const player = db.prepare('SELECT cash, xp FROM players WHERE id = ?').get(playerId) as { cash: number; xp: number } | undefined;
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const fee = Math.max(200, Math.round(hireFee || 600));
    if (player.cash < fee) return res.status(400).json({ error: 'Insufficient funds for signing fee' });

    const id = `emp_${crypto.randomUUID().slice(0, 10)}`;
    const now = Date.now();
    const newXp = player.xp + 65;

    db.exec('BEGIN');
    try {
      db.prepare('UPDATE players SET cash = cash - ?, xp = ?, level = ? WHERE id = ?').run(fee, newXp, computeLevelFromXp(newXp), playerId);
      db.prepare(`
        INSERT INTO employees (id, player_id, company_id, name, role, department, skill, salary, experience, productivity, satisfaction, hired_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 85.0, ?)
      `).run(
        id,
        playerId,
        companyId || null,
        String(name).slice(0, 40),
        String(role),
        department || 'operations',
        Math.max(1, Math.min(10, Number(skill) || 1)),
        Math.max(30, Number(salary) || 60),
        Number((0.92 + (Number(skill) || 1) * 0.06).toFixed(2)),
        now
      );
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: String(e) });
    }

    res.json({ state: buildFullPlayerState(playerId) });
  });

  // Manage employee (train, salary, assign company/department, fire)
  router.post('/employees/manage', (req, res) => {
    const { playerId, employeeId, action, salary, companyId, department } = req.body as {
      playerId: string;
      employeeId: string;
      action: 'fire' | 'train' | 'update';
      salary?: number;
      companyId?: string | null;
      department?: string;
    };

    const emp = db.prepare('SELECT * FROM employees WHERE id = ? AND player_id = ?').get(employeeId, playerId) as {
      id: string;
      skill: number;
      salary: number;
      satisfaction: number;
      productivity: number;
    } | undefined;
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    if (action === 'fire') {
      db.prepare('DELETE FROM employees WHERE id = ? AND player_id = ?').run(employeeId, playerId);
    } else if (action === 'train') {
      const trainCost = 1800 * emp.skill;
      const player = db.prepare('SELECT cash, xp FROM players WHERE id = ?').get(playerId) as { cash: number; xp: number } | undefined;
      if (!player) return res.status(404).json({ error: 'Player not found' });
      if (player.cash < trainCost) return res.status(400).json({ error: 'Insufficient funds for training' });
      if (emp.skill >= 10) return res.status(400).json({ error: 'Max skill reached' });
      db.exec('BEGIN');
      try {
        db.prepare('UPDATE players SET cash = cash - ?, xp = xp + 50 WHERE id = ?').run(trainCost, playerId);
        db.prepare('UPDATE employees SET skill = skill + 1, experience = experience + 100, productivity = MIN(1.8, productivity + 0.08), satisfaction = MIN(100, satisfaction + 5) WHERE id = ?').run(employeeId);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        return res.status(500).json({ error: String(e) });
      }
    } else if (action === 'update') {
      if (typeof salary === 'number') {
        const nextSal = Math.max(25, Math.min(500, Math.round(salary)));
        const satDelta = nextSal > emp.salary ? 6 : nextSal < emp.salary ? -8 : 0;
        db.prepare('UPDATE employees SET salary = ?, satisfaction = MAX(20, MIN(100, satisfaction + ?)) WHERE id = ?').run(nextSal, satDelta, employeeId);
      }
      if (companyId !== undefined) {
        db.prepare('UPDATE employees SET company_id = ? WHERE id = ?').run(companyId, employeeId);
      }
      if (department) {
        db.prepare('UPDATE employees SET department = ? WHERE id = ?').run(department, employeeId);
      }
    }

    res.json({ state: buildFullPlayerState(playerId) });
  });

  // Start Research
  router.post('/research/start', (req, res) => {
    const { playerId, techId } = req.body as { playerId: string; techId: string };
    const tech = techMap.get(techId);
    if (!tech) return res.status(400).json({ error: 'Invalid technology' });

    const existing = db.prepare('SELECT 1 FROM player_research WHERE player_id = ? AND tech_id = ?').get(playerId, techId);
    if (existing) return res.status(400).json({ error: 'Already researched or in progress' });

    if (tech.prereq) {
      const hasPre = db.prepare(`SELECT 1 FROM player_research WHERE player_id = ? AND tech_id = ? AND status = 'completed'`).get(playerId, tech.prereq);
      if (!hasPre) return res.status(400).json({ error: 'Prerequisite technology not completed' });
    }

    const player = db.prepare('SELECT cash FROM players WHERE id = ?').get(playerId) as { cash: number } | undefined;
    if (!player || player.cash < tech.cost) return res.status(400).json({ error: 'Insufficient funds for R&D' });

    const now = Date.now();
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE players SET cash = cash - ? WHERE id = ?').run(tech.cost, playerId);
      db.prepare(`INSERT INTO player_research (player_id, tech_id, status, completes_at) VALUES (?, ?, 'researching', ?)`).run(playerId, techId, now + tech.researchTimeSec * 1000);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: String(e) });
    }

    res.json({ state: buildFullPlayerState(playerId) });
  });

  // Market Buy / Sell
  router.post('/market/trade', (req, res) => {
    const { playerId, resourceId, action, quantity } = req.body as {
      playerId: string;
      resourceId: string;
      action: 'buy' | 'sell';
      quantity: number;
    };
    const resDef = resourceMap.get(resourceId);
    const qty = Math.floor(Number(quantity));
    if (!resDef || !Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: 'Invalid trade request' });

    const marketRow = db.prepare('SELECT current_price, supply, demand FROM market_prices WHERE resource_id = ?').get(resourceId) as {
      current_price: number;
      supply: number;
      demand: number;
    } | undefined;
    if (!marketRow) return res.status(404).json({ error: 'Market item not found' });

    const total = Math.round(marketRow.current_price * qty);
    const player = db.prepare('SELECT cash FROM players WHERE id = ?').get(playerId) as { cash: number } | undefined;
    if (!player) return res.status(404).json({ error: 'Player not found' });

    db.exec('BEGIN');
    try {
      if (action === 'buy') {
        if (player.cash < total) {
          db.exec('ROLLBACK');
          return res.status(400).json({ error: 'Insufficient funds' });
        }
        db.prepare('UPDATE players SET cash = cash - ?, trades_count = trades_count + 1 WHERE id = ?').run(total, playerId);
        db.prepare(`
          INSERT INTO inventory (player_id, resource_id, quantity) VALUES (?, ?, ?)
          ON CONFLICT(player_id, resource_id) DO UPDATE SET quantity = quantity + excluded.quantity
        `).run(playerId, resourceId, qty);
        db.prepare('UPDATE market_prices SET demand = demand + ? WHERE resource_id = ?').run(qty * 2, resourceId);
      } else {
        const inv = db.prepare('SELECT quantity FROM inventory WHERE player_id = ? AND resource_id = ?').get(playerId, resourceId) as { quantity: number } | undefined;
        if (!inv || inv.quantity < qty) {
          db.exec('ROLLBACK');
          return res.status(400).json({ error: 'Insufficient inventory' });
        }
        db.prepare('UPDATE inventory SET quantity = quantity - ? WHERE player_id = ? AND resource_id = ?').run(qty, playerId, resourceId);
        db.prepare('UPDATE players SET cash = cash + ?, trades_count = trades_count + 1, xp = xp + 25 WHERE id = ?').run(total, playerId);
        db.prepare('UPDATE market_prices SET supply = supply + ? WHERE resource_id = ?').run(qty * 2, resourceId);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: String(e) });
    }

    res.json({ state: buildFullPlayerState(playerId) });
  });

  // Corporate Bank Loans & Repayment
  router.post('/loans/take', (req, res) => {
    const { playerId, amount } = req.body as { playerId: string; amount: number };
    const amt = Math.round(Number(amount));
    if (!Number.isFinite(amt) || amt < 5000) return res.status(400).json({ error: 'Minimum loan amount is $5,000' });

    const player = db.prepare('SELECT id, debt FROM players WHERE id = ?').get(playerId) as { id: string; debt: number } | undefined;
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const fin = calculatePlayerFinancials(playerId);
    if (player.debt + amt > fin.creditLimit) {
      return res.status(400).json({ error: `Exceeds corporate credit limit ($${fin.creditLimit.toLocaleString()})` });
    }

    db.exec('BEGIN');
    try {
      db.prepare('UPDATE players SET cash = cash + ?, debt = debt + ? WHERE id = ?').run(amt, amt, playerId);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: String(e) });
    }
    res.json({ state: buildFullPlayerState(playerId) });
  });

  router.post('/loans/repay', (req, res) => {
    const { playerId, amount } = req.body as { playerId: string; amount: number };
    const rawAmt = Math.round(Number(amount));
    const player = db.prepare('SELECT id, cash, debt FROM players WHERE id = ?').get(playerId) as { id: string; cash: number; debt: number } | undefined;
    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (player.debt <= 0) return res.status(400).json({ error: 'No active corporate debt' });

    const target = !Number.isFinite(rawAmt) || rawAmt <= 0 ? player.debt : Math.min(rawAmt, player.debt);
    const repayAmt = Math.round(target);
    if (repayAmt <= 0 || player.cash < repayAmt) {
      return res.status(400).json({ error: 'Insufficient cash for repayment' });
    }

    db.exec('BEGIN');
    try {
      db.prepare('UPDATE players SET cash = MAX(0, cash - ?), debt = MAX(0, debt - ?) WHERE id = ?').run(repayAmt, repayAmt, playerId);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: String(e) });
    }
    res.json({ state: buildFullPlayerState(playerId) });
  });

  // Multiplayer P2P Trade Offers
  router.post('/trade/offer', (req, res) => {
    const { playerId, resourceId, quantity, unitPrice } = req.body as {
      playerId: string;
      resourceId: string;
      quantity: number;
      unitPrice: number;
    };
    const qty = Math.floor(Number(quantity));
    const price = Math.round(Number(unitPrice));
    if (!resourceMap.has(resourceId) || qty <= 0 || price <= 0) return res.status(400).json({ error: 'Invalid offer parameters' });

    const player = db.prepare('SELECT name FROM players WHERE id = ?').get(playerId) as { name: string } | undefined;
    const inv = db.prepare('SELECT quantity FROM inventory WHERE player_id = ? AND resource_id = ?').get(playerId, resourceId) as { quantity: number } | undefined;
    if (!player || !inv || inv.quantity < qty) return res.status(400).json({ error: 'Insufficient inventory for offer' });

    const id = `trd_${crypto.randomUUID().slice(0, 10)}`;
    const now = Date.now();
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE inventory SET quantity = quantity - ? WHERE player_id = ? AND resource_id = ?').run(qty, playerId, resourceId);
      db.prepare(`
        INSERT INTO trade_offers (id, seller_id, seller_name, resource_id, quantity, unit_price, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
      `).run(id, playerId, player.name, resourceId, qty, price, now);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: String(e) });
    }

    const offer = db.prepare('SELECT * FROM trade_offers WHERE id = ?').get(id);
    broadcastEvent('trade:created', offer);
    res.json({ state: buildFullPlayerState(playerId) });
  });

  router.post('/trade/accept', (req, res) => {
    const { playerId, offerId } = req.body as { playerId: string; offerId: string };
    const offer = db.prepare(`SELECT * FROM trade_offers WHERE id = ? AND status = 'open'`).get(offerId) as {
      id: string;
      seller_id: string;
      resource_id: string;
      quantity: number;
      unit_price: number;
    } | undefined;
    if (!offer) return res.status(404).json({ error: 'Trade offer no longer available' });
    if (offer.seller_id === playerId) return res.status(400).json({ error: 'Cannot buy your own offer' });

    const total = offer.quantity * offer.unit_price;
    const buyer = db.prepare('SELECT cash FROM players WHERE id = ?').get(playerId) as { cash: number } | undefined;
    if (!buyer) return res.status(404).json({ error: 'Player not found' });
    if (buyer.cash < total) return res.status(400).json({ error: 'Insufficient funds' });
    const seller = db.prepare('SELECT id FROM players WHERE id = ?').get(offer.seller_id);
    if (!seller) return res.status(404).json({ error: 'Seller account no longer exists' });

    db.exec('BEGIN');
    try {
      db.prepare('UPDATE players SET cash = cash - ?, trades_count = trades_count + 1, xp = xp + 90 WHERE id = ?').run(total, playerId);
      db.prepare('UPDATE players SET cash = cash + ?, trades_count = trades_count + 1, xp = xp + 90 WHERE id = ?').run(total, offer.seller_id);
      db.prepare(`
        INSERT INTO inventory (player_id, resource_id, quantity) VALUES (?, ?, ?)
        ON CONFLICT(player_id, resource_id) DO UPDATE SET quantity = quantity + excluded.quantity
      `).run(playerId, offer.resource_id, offer.quantity);
      db.prepare(`UPDATE trade_offers SET status = 'completed', buyer_id = ? WHERE id = ?`).run(playerId, offerId);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: String(e) });
    }

    broadcastEvent('trade:completed', { offerId, buyerId: playerId, sellerId: offer.seller_id });
    res.json({ state: buildFullPlayerState(playerId) });
  });

  router.post('/trade/cancel', (req, res) => {
    const { playerId, offerId } = req.body as { playerId: string; offerId: string };
    const player = db.prepare('SELECT id FROM players WHERE id = ?').get(playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const offer = db.prepare(`SELECT * FROM trade_offers WHERE id = ? AND seller_id = ? AND status = 'open'`).get(offerId, playerId) as {
      resource_id: string;
      quantity: number;
    } | undefined;
    if (!offer) return res.status(404).json({ error: 'Offer not found' });

    db.exec('BEGIN');
    try {
      db.prepare(`UPDATE trade_offers SET status = 'cancelled' WHERE id = ?`).run(offerId);
      db.prepare(`
        INSERT INTO inventory (player_id, resource_id, quantity) VALUES (?, ?, ?)
        ON CONFLICT(player_id, resource_id) DO UPDATE SET quantity = quantity + excluded.quantity
      `).run(playerId, offer.resource_id, offer.quantity);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: String(e) });
    }
    broadcastEvent('trade:cancelled', { offerId });
    res.json({ state: buildFullPlayerState(playerId) });
  });

  // Alliances & Joint Projects
  router.post('/alliances/create', (req, res) => {
    const { playerId, name, tag } = req.body as { playerId: string; name: string; tag: string };
    if (!name || name.trim().length < 3) return res.status(400).json({ error: 'Alliance name too short' });

    const existingMember = db.prepare('SELECT 1 FROM alliance_members WHERE player_id = ?').get(playerId);
    if (existingMember) return res.status(400).json({ error: 'Already in an alliance' });

    const player = db.prepare('SELECT cash FROM players WHERE id = ?').get(playerId) as { cash: number } | undefined;
    if (!player || player.cash < 25000) return res.status(400).json({ error: 'Requires $25,000 founding charter fee' });

    const id = `ally_${crypto.randomUUID().slice(0, 10)}`;
    const now = Date.now();
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE players SET cash = cash - 25000, xp = xp + 250 WHERE id = ?').run(playerId);
      db.prepare(`INSERT INTO alliances (id, name, tag, leader_id, treasury, project_progress, created_at) VALUES (?, ?, ?, ?, 10000, 10000, ?)`).run(
        id,
        name.trim().slice(0, 32),
        (tag || 'DE').toUpperCase().slice(0, 4),
        playerId,
        now
      );
      db.prepare(`INSERT INTO alliance_members (alliance_id, player_id, role, contributed, joined_at) VALUES (?, ?, 'leader', 25000, ?)`).run(id, playerId, now);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      return res.status(400).json({ error: 'Alliance name already taken or invalid' });
    }
    broadcastEvent('alliance:updated', { allianceId: id });
    res.json({ state: buildFullPlayerState(playerId) });
  });

  router.post('/alliances/join', (req, res) => {
    const { playerId, allianceId } = req.body as { playerId: string; allianceId: string };
    const player = db.prepare('SELECT id FROM players WHERE id = ?').get(playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const existingMember = db.prepare('SELECT 1 FROM alliance_members WHERE player_id = ?').get(playerId);
    if (existingMember) return res.status(400).json({ error: 'Already in an alliance' });

    const ally = db.prepare('SELECT 1 FROM alliances WHERE id = ?').get(allianceId);
    if (!ally) return res.status(404).json({ error: 'Alliance not found' });

    db.prepare(`INSERT INTO alliance_members (alliance_id, player_id, role, contributed, joined_at) VALUES (?, ?, 'member', 0, ?)`).run(allianceId, playerId, Date.now());
    broadcastEvent('alliance:updated', { allianceId });
    res.json({ state: buildFullPlayerState(playerId) });
  });

  router.post('/alliances/contribute', (req, res) => {
    const { playerId, amount } = req.body as { playerId: string; amount: number };
    const amt = Math.floor(Number(amount));
    if (!Number.isFinite(amt) || amt < 1000) return res.status(400).json({ error: 'Minimum contribution is $1,000' });

    const player = db.prepare('SELECT cash FROM players WHERE id = ?').get(playerId) as { cash: number } | undefined;
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const member = db.prepare('SELECT alliance_id FROM alliance_members WHERE player_id = ?').get(playerId) as { alliance_id: string } | undefined;
    if (!member) return res.status(400).json({ error: 'Not in an alliance' });

    if (player.cash < amt) return res.status(400).json({ error: 'Insufficient funds' });

    db.exec('BEGIN');
    try {
      db.prepare('UPDATE players SET cash = cash - ?, xp = xp + ? WHERE id = ?').run(amt, Math.round(amt / 100), playerId);
      db.prepare('UPDATE alliance_members SET contributed = contributed + ? WHERE player_id = ?').run(amt, playerId);
      db.prepare('UPDATE alliances SET treasury = treasury + ?, project_progress = MIN(project_target, project_progress + ?) WHERE id = ?').run(amt, amt, member.alliance_id);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: String(e) });
    }
    broadcastEvent('alliance:updated', { allianceId: member.alliance_id });
    res.json({ state: buildFullPlayerState(playerId) });
  });

  // Claim Mission
  router.post('/missions/claim', (req, res) => {
    const { playerId, missionId } = req.body as { playerId: string; missionId: string };
    const m = missionMap.get(missionId);
    if (!m) return res.status(400).json({ error: 'Invalid mission' });

    const player = db.prepare('SELECT xp, trades_count FROM players WHERE id = ?').get(playerId) as { xp: number; trades_count: number } | undefined;
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const already = db.prepare('SELECT 1 FROM claimed_missions WHERE player_id = ? AND mission_id = ?').get(playerId, missionId);
    if (already) return res.status(400).json({ error: 'Mission already claimed' });

    const financials = calculatePlayerFinancials(playerId);
    const companiesCount = (db.prepare('SELECT COUNT(*) as c FROM companies WHERE player_id = ?').get(playerId) as { c: number }).c;
    const researchCount = (db.prepare(`SELECT COUNT(*) as c FROM player_research WHERE player_id = ? AND status = 'completed'`).get(playerId) as { c: number }).c;
    const tradesCount = player.trades_count;

    const metrics: Record<string, number> = {
      companiesCount,
      buildingsCount: financials.buildingsCount,
      employeesCount: financials.employeesCount,
      researchCount,
      netWorth: financials.netWorth,
      tradesCount,
    };

    if ((metrics[m.metric] ?? 0) < m.target) {
      return res.status(400).json({ error: 'Mission requirements not yet met' });
    }

    const newXp = player.xp + m.rewardXp;
    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO claimed_missions (player_id, mission_id, claimed_at) VALUES (?, ?, ?)').run(playerId, missionId, Date.now());
      db.prepare('UPDATE players SET cash = cash + ?, xp = ?, level = ? WHERE id = ?').run(m.rewardCash, newXp, computeLevelFromXp(newXp), playerId);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: String(e) });
    }
    res.json({ state: buildFullPlayerState(playerId) });
  });

  // Cosmetics & Settings (Fair monetization: zero pay-to-win)
  router.post('/cosmetics/buy', (req, res) => {
    const { playerId, cosmeticId } = req.body as { playerId: string; cosmeticId: string };
    const cos = cosmeticMap.get(cosmeticId);
    if (!cos) return res.status(400).json({ error: 'Cosmetic not found' });

    const player = db.prepare('SELECT credits FROM players WHERE id = ?').get(playerId) as { credits: number } | undefined;
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const owned = db.prepare('SELECT 1 FROM cosmetics_owned WHERE player_id = ? AND cosmetic_id = ?').get(playerId, cosmeticId);
    if (owned) {
      db.prepare('UPDATE players SET active_skin = ? WHERE id = ?').run(cosmeticId, playerId);
      return res.json({ state: buildFullPlayerState(playerId) });
    }

    if (player.credits < cos.priceCredits) return res.status(400).json({ error: 'Not enough Empire Credits' });

    db.exec('BEGIN');
    try {
      db.prepare('UPDATE players SET credits = credits - ?, active_skin = ? WHERE id = ?').run(cos.priceCredits, cosmeticId, playerId);
      db.prepare('INSERT INTO cosmetics_owned (player_id, cosmetic_id, unlocked_at) VALUES (?, ?, ?)').run(playerId, cosmeticId, Date.now());
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: String(e) });
    }
    res.json({ state: buildFullPlayerState(playerId) });
  });

  router.post('/settings/update', (req, res) => {
    const { playerId, language, settings, empireName } = req.body as {
      playerId: string;
      language?: string;
      settings?: Record<string, unknown>;
      empireName?: string;
    };
    const player = db.prepare('SELECT id FROM players WHERE id = ?').get(playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (language) db.prepare('UPDATE players SET language = ? WHERE id = ?').run(language === 'en' ? 'en' : 'de', playerId);
    if (settings) db.prepare('UPDATE players SET settings_json = ? WHERE id = ?').run(JSON.stringify(settings), playerId);
    if (empireName && empireName.trim().length >= 2) {
      db.prepare('UPDATE players SET empire_name = ? WHERE id = ?').run(empireName.trim().slice(0, 40), playerId);
    }
    res.json({ state: buildFullPlayerState(playerId) });
  });

  // Leaderboard & Visit Real Empire
  router.get('/leaderboard', (_req, res) => {
    const players = db.prepare('SELECT id, name, empire_name, level, xp, cash, last_active_at FROM players ORDER BY xp DESC LIMIT 50').all() as Array<{
      id: string;
      name: string;
      empire_name: string;
      level: number;
      xp: number;
      cash: number;
      last_active_at: number;
    }>;

    const rankings = players.map((p) => {
      const fin = calculatePlayerFinancials(p.id);
      return {
        playerId: p.id,
        name: p.name,
        empireName: p.empire_name,
        level: p.level,
        netWorth: fin.netWorth,
        companyValue: fin.companyValue,
        buildingsCount: fin.buildingsCount,
        employeesCount: fin.employeesCount,
        revenuePerHour: fin.revenuePerHour,
        lastActiveAt: p.last_active_at,
      };
    });

    rankings.sort((a, b) => b.netWorth - a.netWorth);
    res.json({ rankings });
  });

  router.get('/visit/:targetPlayerId', (req, res) => {
    const state = buildFullPlayerState(req.params.targetPlayerId);
    if (!state) return res.status(404).json({ error: 'Empire not found' });
    res.json({
      player: {
        id: state.player.id,
        name: state.player.name,
        empire_name: state.player.empire_name,
        level: state.player.level,
      },
      financials: state.financials,
      ownedPlots: state.ownedPlots,
      buildings: state.buildings,
      companies: state.companies,
    });
  });

  return router;
}
