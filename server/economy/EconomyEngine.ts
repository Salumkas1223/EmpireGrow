import { db, getPlayerResearchBonus, getWorldState, setWorldState } from '../database/db.ts';
import { GAME_CONFIG, DISTRICTS, PLOT_BLUEPRINTS } from '../../config/gameConfig.ts';
import { BUILDINGS, INDUSTRIES, RESOURCES } from '../../shared/gameData.ts';

export interface PlayerFinancialSummary {
  cash: number;
  debt: number;
  creditLimit: number;
  interestRate: number;
  interestPerHour: number;
  netWorth: number;
  revenuePerHour: number;
  expensesPerHour: number;
  netProfitPerHour: number;
  operatingMargin: number;
  supplyChainEfficiency: number;
  companyValue: number;
  buildingsCount: number;
  employeesCount: number;
  plotsCount: number;
  energyGenerated: number;
  energyUsed: number;
  energyNetCost: number;
  taxesPerHour: number;
  wagesPerHour: number;
  maintenancePerHour: number;
  transportPerHour: number;
}

const SUPPLY_CHAIN_INPUTS: Record<string, Record<string, number>> = {
  workshop_factory: { steel: 0.4, concrete: 0.4 },
  tech_lab: { silicon: 0.45 },
  ai_datacenter: { silicon: 0.35 },
  ev_gigafactory: { steel: 0.5, lithium: 0.35 },
  food_campus: { grain: 0.6 },
};

const buildingMap = new Map(BUILDINGS.map((b) => [b.id, b]));
const industryMap = new Map(INDUSTRIES.map((i) => [i.id, i]));
const plotMap = new Map(PLOT_BLUEPRINTS.map((p) => [p.id, p]));

export function computeLevelFromXp(xp: number): number {
  let level = 1;
  let threshold = GAME_CONFIG.XP_PER_LEVEL_BASE;
  let remaining = xp;
  while (remaining >= threshold && level < 99) {
    remaining -= threshold;
    level++;
    threshold = Math.round(GAME_CONFIG.XP_PER_LEVEL_BASE * Math.pow(level, GAME_CONFIG.XP_LEVEL_EXPONENT));
  }
  return level;
}

export function xpForNextLevel(level: number): number {
  let total = 0;
  for (let l = 1; l <= level; l++) {
    total += Math.round(GAME_CONFIG.XP_PER_LEVEL_BASE * Math.pow(l, GAME_CONFIG.XP_LEVEL_EXPONENT));
  }
  return total;
}

export function stepMarketEconomy(gameHour: number): void {
  const world = getWorldState();
  const cycleRoll = Math.sin(gameHour * 0.08);
  let cycle = 'growth';
  let demandCycleMod = 1.05;
  let headlineDe = 'Stabiles Stadtwachstum stützt Industrie- und Logistiknachfrage.';
  let headlineEn = 'Steady urban expansion supports industrial and logistics demand.';
  if (cycleRoll > 0.65) {
    cycle = 'boom';
    demandCycleMod = 1.24;
    headlineDe = 'Wirtschaftsboom: Hohe Industrieinvestitionen treiben Stahl-, Chip- und Fahrzeugpreise.';
    headlineEn = 'Economic Boom: High industrial CapEx lifts steel, microchip, and EV demand.';
  } else if (cycleRoll < -0.65) {
    cycle = 'recession';
    demandCycleMod = 0.82;
    headlineDe = 'Konjunkturdelle: Höhere Kreditzinsen dämpfen Baukredite und Rohstoffpreise.';
    headlineEn = 'Market Contraction: Tighter credit rates cool capital spending and commodity demand.';
  } else if (world.weather === 'rain' && gameHour % 24 >= 10 && gameHour % 24 <= 18) {
    cycle = 'energy_peak';
    demandCycleMod = 1.0;
    headlineDe = 'Schlechtwetter-Spitze: Geringerer Solarertrag erhöht Strompreise im Stadtnetz.';
    headlineEn = 'Storm Grid Peak: Reduced solar yield tightens municipal electricity supply.';
  }
  setWorldState('economicCycle', cycle);
  setWorldState('marketHeadlineDe', headlineDe);
  setWorldState('marketHeadlineEn', headlineEn);

  const inflation = Math.max(0.01, Math.min(0.065, 0.022 + cycleRoll * 0.014));
  setWorldState('inflationRate', inflation.toFixed(4));

  const rows = db.prepare('SELECT * FROM market_prices').all() as Array<{
    resource_id: string;
    current_price: number;
    supply: number;
    demand: number;
    trend: number;
    history_json: string;
  }>;

  const updateStmt = db.prepare(`
    UPDATE market_prices
    SET current_price = ?, supply = ?, demand = ?, trend = ?, history_json = ?
    WHERE resource_id = ?
  `);

  for (const row of rows) {
    const def = RESOURCES.find((r) => r.id === row.resource_id);
    if (!def) continue;

    // Mean-reverting supply & demand + economic cycle + realistic noise
    const targetSupply = 1000;
    const targetDemand = 1000 * demandCycleMod;
    const nextSupply = row.supply * 0.9 + targetSupply * 0.1 + (Math.random() - 0.5) * 40;
    const nextDemand = row.demand * 0.9 + targetDemand * 0.1 + (Math.random() - 0.5) * 45;

    const imbalance = (nextDemand - nextSupply) / Math.max(200, nextSupply);
    const meanRevert = (def.basePrice - row.current_price) * 0.06;
    const delta = row.current_price * (imbalance * def.volatility + (Math.random() - 0.5) * 0.018) + meanRevert;
    const nextPrice = Math.round(Math.max(def.minPrice, Math.min(def.maxPrice, row.current_price + delta)) * 100) / 100;
    const trend = Math.round(((nextPrice - row.current_price) / Math.max(1, row.current_price)) * 1000) / 10;

    const history: number[] = JSON.parse(row.history_json || '[]');
    history.push(nextPrice);
    if (history.length > 24) history.shift();

    updateStmt.run(nextPrice, Math.round(nextSupply), Math.round(nextDemand), trend, JSON.stringify(history), row.resource_id);
  }
}

export function calculatePlayerFinancials(playerId: string): PlayerFinancialSummary {
  const player = db.prepare('SELECT cash, debt FROM players WHERE id = ?').get(playerId) as { cash: number; debt: number } | undefined;
  const cash = player?.cash ?? 0;
  const debt = player?.debt ?? 0;

  const world = getWorldState();
  const bonus = getPlayerResearchBonus(playerId);

  const invRows = db.prepare('SELECT resource_id, quantity FROM inventory WHERE player_id = ?').all(playerId) as Array<{ resource_id: string; quantity: number }>;
  const invMap = new Map(invRows.map((i) => [i.resource_id, i.quantity]));

  const ownedPlots = db.prepare('SELECT plot_id FROM owned_plots WHERE player_id = ?').all(playerId) as Array<{ plot_id: string }>;
  const buildings = db.prepare('SELECT * FROM buildings WHERE player_id = ?').all(playerId) as Array<{
    id: string;
    plot_id: string;
    company_id: string | null;
    building_type: string;
    level: number;
    is_constructing: number;
  }>;
  const companies = db.prepare('SELECT * FROM companies WHERE player_id = ?').all(playerId) as Array<{
    id: string;
    industry_id: string;
    price_multiplier: number;
    reputation: number;
    auto_managed: number;
  }>;
  const employees = db.prepare('SELECT * FROM employees WHERE player_id = ?').all(playerId) as Array<{
    company_id: string | null;
    role: string;
    skill: number;
    salary: number;
    productivity: number;
    satisfaction: number;
  }>;

  const marketRows = db.prepare('SELECT resource_id, current_price FROM market_prices').all() as Array<{ resource_id: string; current_price: number }>;
  const priceMap = new Map(marketRows.map((m) => [m.resource_id, m.current_price]));
  const energyMarketPrice = priceMap.get('energy_unit') ?? 180;

  const companyById = new Map(companies.map((c) => [c.id, c]));

  // Calculate employee boost per company
  const empByCompany = new Map<string, { count: number; avgProd: number; totalSalary: number; hasManager: boolean }>();
  let totalWages = 0;
  for (const emp of employees) {
    totalWages += emp.salary;
    if (emp.company_id) {
      const entry = empByCompany.get(emp.company_id) ?? { count: 0, avgProd: 0, totalSalary: 0, hasManager: false };
      entry.count++;
      entry.avgProd += emp.productivity * (0.85 + emp.skill * 0.08) * (0.65 + emp.satisfaction / 250);
      entry.totalSalary += emp.salary;
      if (emp.role === 'manager') entry.hasManager = true;
      empByCompany.set(emp.company_id, entry);
    }
  }

  // Alliance bonus
  const allianceRow = db.prepare(`
    SELECT a.project_progress, a.project_target
    FROM alliance_members am JOIN alliances a ON a.id = am.alliance_id
    WHERE am.player_id = ?
  `).get(playerId) as { project_progress: number; project_target: number } | undefined;
  const allianceBoost = allianceRow ? 1 + Math.min(0.15, (allianceRow.project_progress / Math.max(1, allianceRow.project_target)) * 0.15) : 1;

  const cycleMult = world.economicCycle === 'boom' ? 1.18 : world.economicCycle === 'recession' ? 0.84 : 1.0;
  const weatherSolarMult = world.weather === 'clear' ? 1.15 : world.weather === 'rain' ? 0.72 : 0.9;

  let revenuePerHour = 0;
  let maintenancePerHour = 0;
  let energyGenerated = 0;
  let energyUsed = 0;
  let taxesPerHour = 0;
  let transportPerHour = 0;
  let assetValue = 0;
  let supplySum = 0;
  let operationalCount = 0;

  for (const p of ownedPlots) {
    const bp = plotMap.get(p.plot_id);
    if (bp) assetValue += bp.basePrice * 0.9;
  }

  for (const b of buildings) {
    const def = buildingMap.get(b.building_type);
    if (!def) continue;
    const levelMult = 1 + (b.level - 1) * 0.45;
    assetValue += def.cost * levelMult * 0.85;

    if (b.is_constructing === 1) continue;
    operationalCount++;

    const reqInputs = SUPPLY_CHAIN_INPUTS[b.building_type];
    let supplyMult = 1.0;
    if (reqInputs) {
      const hasAllInputs = Object.entries(reqInputs).every(([resId, qty]) => (invMap.get(resId) ?? 0) >= qty);
      supplyMult = hasAllInputs ? 1.3 : 0.85;
    }
    supplySum += supplyMult;

    const plot = plotMap.get(b.plot_id);
    const district = plot ? DISTRICTS[plot.district] : undefined;

    let districtRevBoost = 1.0;
    let districtPowerBoost = 1.0;
    let districtTransportDiscount = 0;
    if (district) {
      if (district.id === 'downtown' && (def.industryId === 'banking' || def.industryId === 'realestate')) districtRevBoost = 1.2;
      if (district.id === 'techpark' && (def.industryId === 'tech' || def.industryId === 'software')) districtRevBoost = 1.2;
      if (district.id === 'industrial' && (def.industryId === 'manufacturing' || def.industryId === 'automotive')) districtRevBoost = 1.25;
      if (district.id === 'residential' && def.industryId === 'retail') districtRevBoost = 1.25;
      if (district.id === 'energy' && def.industryId === 'energy') districtPowerBoost = 1.3;
      if (district.id === 'harbor') districtTransportDiscount = 0.3;
    }

    const comp = b.company_id ? companyById.get(b.company_id) : undefined;
    const ind = industryMap.get(comp?.industry_id ?? def.industryId);

    // Price elasticity: raising price above 1.0 lowers demand curve, sweet spot ~1.05-1.15 with high reputation
    const priceMult = comp ? comp.price_multiplier : 1.0;
    const repBonus = comp ? 0.85 + (comp.reputation / 100) * 0.35 : 1.0;
    const elasticity = Math.max(0.25, 1.55 - 0.55 * Math.pow(priceMult, 1.45));

    const empGroup = b.company_id ? empByCompany.get(b.company_id) : undefined;
    const empFactor = empGroup && empGroup.count > 0
      ? Math.min(1.65, 0.85 + (empGroup.avgProd / empGroup.count) * 0.35 + (empGroup.hasManager ? 0.12 : 0))
      : 0.78; // Base automated baseline when no staff assigned yet

    const techRevBoost = 1 + bonus.revenueMult + bonus.outputMult * 0.6 + bonus.demandMult * 0.4 + ((def.industryId === 'tech' || def.industryId === 'software') ? bonus.techRevenueMult : 0);

    const grossRev =
      def.baseRevenuePerHour *
      levelMult *
      (ind?.baseDemand ?? 1.0) *
      districtRevBoost *
      priceMult *
      elasticity *
      repBonus *
      empFactor *
      techRevBoost *
      supplyMult *
      cycleMult *
      allianceBoost *
      (1 + bonus.productivityMult * 0.5);

    revenuePerHour += grossRev;

    const maint = def.maintenancePerHour * (1 + (b.level - 1) * 0.3) * (1 - bonus.maintDiscount) * (1 + world.inflationRate);
    maintenancePerHour += maint;

    const eGen = def.energyOutputPerHour * levelMult * districtPowerBoost * (def.id === 'solar_station' ? weatherSolarMult : 1.0);
    const eUse = def.energyUsePerHour * (1 + (b.level - 1) * 0.25);
    energyGenerated += eGen;
    energyUsed += eUse;

    const transportBase = grossRev * 0.06 * (1 - districtTransportDiscount) * (1 - Math.min(0.45, bonus.transportDiscount));
    transportPerHour += transportBase;

    const effectiveTaxRate = Math.max(0.05, (district?.taxRate ?? 0.12) - bonus.taxDiscount);
    taxesPerHour += Math.max(0, grossRev - maint) * effectiveTaxRate;
  }

  // Net energy cost or surplus revenue
  const netEnergyDelta = energyUsed - energyGenerated;
  const energyUnitRate = (energyMarketPrice / 100) * (1 - Math.min(0.45, bonus.energyDiscount));
  let energyNetCost = 0;
  if (netEnergyDelta > 0) {
    energyNetCost = netEnergyDelta * energyUnitRate;
  } else if (netEnergyDelta < 0) {
    // Surplus power sold to city grid
    revenuePerHour += Math.abs(netEnergyDelta) * energyUnitRate * 0.65;
  }

  const hasBank = companies.some((c) => c.industry_id === 'banking');
  const interestRate = Math.max(
    0.035,
    0.065 + (world.economicCycle === 'recession' ? 0.02 : world.economicCycle === 'boom' ? -0.005 : 0) - (hasBank ? 0.015 : 0)
  );
  const interestPerHour = Math.round((debt * interestRate) / 24);

  const wagesPerHour = totalWages * (1 - bonus.wageDiscount);
  const expensesPerHour = maintenancePerHour + wagesPerHour + energyNetCost + transportPerHour + taxesPerHour + interestPerHour;
  const netProfitPerHour = revenuePerHour - expensesPerHour;
  const operatingMargin = revenuePerHour > 0 ? Math.round(((revenuePerHour - expensesPerHour) / revenuePerHour) * 1000) / 10 : 0;
  const supplyChainEfficiency = operationalCount > 0 ? Math.round((supplySum / operationalCount) * 100) : 100;

  // Company valuation = 18 * netProfitPerHour (floor 0) + company count base + asset value * 0.4
  const companyValue = Math.max(0, Math.round(netProfitPerHour * 18 + companies.length * 25000));
  const grossEquity = cash + assetValue + companyValue * 0.5;
  const creditLimit = Math.max(50000, Math.round(grossEquity * 0.65));
  const netWorth = Math.round(grossEquity - debt);

  return {
    cash: Math.round(cash),
    debt: Math.round(debt),
    creditLimit,
    interestRate: Math.round(interestRate * 1000) / 10,
    interestPerHour,
    netWorth,
    revenuePerHour: Math.round(revenuePerHour),
    expensesPerHour: Math.round(expensesPerHour),
    netProfitPerHour: Math.round(netProfitPerHour),
    operatingMargin,
    supplyChainEfficiency,
    companyValue,
    buildingsCount: buildings.length,
    employeesCount: employees.length,
    plotsCount: ownedPlots.length,
    energyGenerated: Math.round(energyGenerated),
    energyUsed: Math.round(energyUsed),
    energyNetCost: Math.round(energyNetCost),
    taxesPerHour: Math.round(taxesPerHour),
    wagesPerHour: Math.round(wagesPerHour),
    maintenancePerHour: Math.round(maintenancePerHour),
    transportPerHour: Math.round(transportPerHour),
  };
}

export function processPlayerTick(playerId: string, gameHour: number): PlayerFinancialSummary | null {
  const playerRow = db.prepare('SELECT id, xp FROM players WHERE id = ?').get(playerId) as { id: string; xp: number } | undefined;
  if (!playerRow) {
    return null;
  }

  const now = Date.now();

  // Complete finished buildings & research
  db.prepare(`UPDATE buildings SET is_constructing = 0 WHERE player_id = ? AND is_constructing = 1 AND build_completes_at <= ?`).run(playerId, now);
  const finishedTechs = db.prepare(`SELECT tech_id FROM player_research WHERE player_id = ? AND status = 'researching' AND completes_at <= ?`).all(playerId, now) as Array<{ tech_id: string }>;
  if (finishedTechs.length > 0) {
    db.prepare(`UPDATE player_research SET status = 'completed' WHERE player_id = ? AND status = 'researching' AND completes_at <= ?`).run(playerId, now);
    db.prepare(`UPDATE players SET xp = xp + ? WHERE id = ?`).run(finishedTechs.length * 180, playerId);
  }

  // Produce resources into player inventory from active buildings
  const activeBuildings = db.prepare(`
    SELECT b.*, c.industry_id
    FROM buildings b
    LEFT JOIN companies c ON c.id = b.company_id
    WHERE b.player_id = ? AND b.is_constructing = 0
  `).all(playerId) as Array<{ building_type: string; level: number; industry_id: string | null }>;

  const invRows = db.prepare('SELECT resource_id, quantity FROM inventory WHERE player_id = ?').all(playerId) as Array<{ resource_id: string; quantity: number }>;
  const invMap = new Map(invRows.map((i) => [i.resource_id, i.quantity]));

  const bonus = getPlayerResearchBonus(playerId);
  const invUpsert = db.prepare(`
    INSERT INTO inventory (player_id, resource_id, quantity) VALUES (?, ?, ?)
    ON CONFLICT(player_id, resource_id) DO UPDATE SET quantity = quantity + excluded.quantity
  `);
  const invConsume = db.prepare(`UPDATE inventory SET quantity = MAX(0, quantity - ?) WHERE player_id = ? AND resource_id = ?`);

  for (const b of activeBuildings) {
    const def = buildingMap.get(b.building_type);
    if (!def) continue;
    const ind = industryMap.get(b.industry_id ?? def.industryId);
    if (!ind) continue;

    let supplyBonus = 1.0;
    const reqInputs = SUPPLY_CHAIN_INPUTS[b.building_type];
    if (reqInputs) {
      const hasAll = Object.entries(reqInputs).every(([resId, qty]) => (invMap.get(resId) ?? 0) >= qty);
      if (hasAll) {
        supplyBonus = 1.25;
        for (const [resId, qty] of Object.entries(reqInputs)) {
          invMap.set(resId, (invMap.get(resId) ?? 0) - qty);
          invConsume.run(qty, playerId, resId);
        }
      } else {
        supplyBonus = 0.85;
      }
    }

    const prodRes = RESOURCES.find((r) => r.id === ind.primaryProduct);
    if (prodRes) {
      const produced = Math.max(1, Math.round(def.baseOutputPerHour * 0.25 * (1 + (b.level - 1) * 0.4) * (1 + bonus.outputMult) * supplyBonus));
      invUpsert.run(playerId, prodRes.id, produced);
    }
  }

  // Manager automation: if a company has a manager & auto_managed=1, gently optimize priceMultiplier toward 1.08
  db.prepare(`
    UPDATE companies
    SET price_multiplier = ROUND(price_multiplier + (1.08 - price_multiplier) * 0.25, 2),
        reputation = MIN(100.0, reputation + 0.15)
    WHERE player_id = ? AND auto_managed = 1
  `).run(playerId);

  const summary = calculatePlayerFinancials(playerId);
  const xpGain = Math.max(2, Math.round(Math.max(0, summary.revenuePerHour) / 450));

  const latestPlayer = db.prepare('SELECT xp FROM players WHERE id = ?').get(playerId) as { xp: number } | undefined;
  if (!latestPlayer) return summary;
  const newXp = latestPlayer.xp + xpGain;
  const newLevel = computeLevelFromXp(newXp);

  // Apply 1 game-hour of net profit (scaled slightly so 2.5s real tick feels rewarding & balanced)
  const tickCashDelta = summary.netProfitPerHour / 4;

  db.prepare(`
    UPDATE players
    SET cash = MAX(0, cash + ?), xp = ?, level = ?, last_active_at = ?
    WHERE id = ?
  `).run(tickCashDelta, newXp, newLevel, now, playerId);

  // Update company cumulative revenue/expenses
  db.prepare(`
    UPDATE companies
    SET revenue_total = revenue_total + ?, expenses_total = expenses_total + ?
    WHERE player_id = ?
  `).run(Math.round(summary.revenuePerHour / 4), Math.round(summary.expensesPerHour / 4), playerId);

  // Record history every 2 game hours
  if (gameHour % 2 === 0) {
    db.prepare(`
      INSERT INTO financial_history (player_id, game_hour, cash, net_worth, revenue_hr, expenses_hr, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(playerId, gameHour, summary.cash + tickCashDelta, summary.netWorth, summary.revenuePerHour, summary.expensesPerHour, now);

    // Keep last 40 points per player
    db.prepare(`
      DELETE FROM financial_history
      WHERE player_id = ? AND id NOT IN (
        SELECT id FROM financial_history WHERE player_id = ? ORDER BY id DESC LIMIT 40
      )
    `).run(playerId, playerId);
  }

  return summary;
}

export function calculateOfflineProgress(playerId: string): { elapsedMinutes: number; cashEarned: number; xpEarned: number } | null {
  const row = db.prepare('SELECT last_active_at, xp FROM players WHERE id = ?').get(playerId) as { last_active_at: number; xp: number } | undefined;
  if (!row) return null;

  const now = Date.now();
  const elapsedMs = now - row.last_active_at;
  if (elapsedMs < 60_000) {
    db.prepare('UPDATE players SET last_active_at = ? WHERE id = ?').run(now, playerId);
    return null;
  }

  const elapsedHours = Math.min(GAME_CONFIG.MAX_OFFLINE_HOURS, elapsedMs / 3_600_000);
  const summary = calculatePlayerFinancials(playerId);
  // Offline income accrues at 65% efficiency of net hourly profit (never bankrupts offline)
  const cashEarned = Math.max(0, Math.round(summary.netProfitPerHour * elapsedHours * 0.65));
  const xpEarned = Math.max(5, Math.round(elapsedHours * 35));
  const newXp = row.xp + xpEarned;
  const newLevel = computeLevelFromXp(newXp);

  db.prepare('UPDATE players SET cash = cash + ?, xp = ?, level = ?, last_active_at = ? WHERE id = ?').run(
    cashEarned,
    newXp,
    newLevel,
    now,
    playerId
  );

  return {
    elapsedMinutes: Math.round(elapsedMs / 60_000),
    cashEarned,
    xpEarned,
  };
}
