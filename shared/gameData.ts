export interface IndustryDef {
  id: string;
  nameDe: string;
  nameEn: string;
  descDe: string;
  descEn: string;
  foundingCost: number;
  primaryProduct: string;
  baseDemand: number;
  color: string;
  icon: string;
}

export interface BuildingDef {
  id: string;
  nameDe: string;
  nameEn: string;
  category: 'commercial' | 'industrial' | 'tech' | 'logistics' | 'energy' | 'residential';
  industryId: string;
  cost: number;
  materials: Record<string, number>;
  maintenancePerHour: number;
  energyUsePerHour: number;
  energyOutputPerHour: number;
  employeeSlots: number;
  baseOutputPerHour: number;
  baseRevenuePerHour: number;
  buildTimeSec: number;
  requiredTech: string | null;
  maxLevel: number;
  heightScale: number;
  color: string;
}

export interface ResourceDef {
  id: string;
  nameDe: string;
  nameEn: string;
  unit: string;
  basePrice: number;
  minPrice: number;
  maxPrice: number;
  volatility: number;
  isRaw: boolean;
}

export interface TechDef {
  id: string;
  branch: string;
  branchNameDe: string;
  branchNameEn: string;
  nameDe: string;
  nameEn: string;
  descDe: string;
  descEn: string;
  cost: number;
  researchTimeSec: number;
  prereq: string | null;
  effectKey: string;
  effectValue: number;
}

export interface MissionDef {
  id: string;
  type: 'story' | 'daily' | 'weekly' | 'milestone';
  titleDe: string;
  titleEn: string;
  descDe: string;
  descEn: string;
  metric: string;
  target: number;
  rewardCash: number;
  rewardXp: number;
}

export interface CosmeticDef {
  id: string;
  category: 'skin' | 'logo' | 'decoration';
  nameDe: string;
  nameEn: string;
  descDe: string;
  descEn: string;
  priceCredits: number;
  primaryColor: string;
  accentColor: string;
}

export const INDUSTRIES: IndustryDef[] = [
  {
    id: 'tech',
    nameDe: 'Technologieunternehmen',
    nameEn: 'Technology Corp',
    descDe: 'Entwickelt Mikrochips, Hardware und Cloud-Infrastruktur.',
    descEn: 'Develops microchips, hardware, and cloud infrastructure.',
    foundingCost: 35000,
    primaryProduct: 'microchip',
    baseDemand: 1.25,
    color: '#38bdf8',
    icon: 'cpu',
  },
  {
    id: 'software',
    nameDe: 'Softwareunternehmen',
    nameEn: 'Software Studio',
    descDe: 'Erstellt Enterprise-SaaS, KI-Plattformen und digitale Lizenzen.',
    descEn: 'Builds enterprise SaaS, AI platforms, and digital licenses.',
    foundingCost: 24000,
    primaryProduct: 'software_license',
    baseDemand: 1.35,
    color: '#818cf8',
    icon: 'code',
  },
  {
    id: 'automotive',
    nameDe: 'Automobilhersteller',
    nameEn: 'Automotive Works',
    descDe: 'Produziert Elektrofahrzeuge und autonome Nutzflotten.',
    descEn: 'Manufactures electric vehicles and autonomous commercial fleets.',
    foundingCost: 55000,
    primaryProduct: 'ev_vehicle',
    baseDemand: 1.1,
    color: '#f97316',
    icon: 'car',
  },
  {
    id: 'food',
    nameDe: 'Lebensmittelunternehmen',
    nameEn: 'Food & Agribusiness',
    descDe: 'Stabile Grundversorgung mit Agrarrohstoffen und Konsumgütern.',
    descEn: 'Resilient consumer staples, agricultural processing, and beverages.',
    foundingCost: 18000,
    primaryProduct: 'consumer_goods',
    baseDemand: 1.4,
    color: '#84cc16',
    icon: 'wheat',
  },
  {
    id: 'logistics',
    nameDe: 'Logistikunternehmen',
    nameEn: 'Global Logistics',
    descDe: 'Betreibt Frachtterminals und senkt Transportkosten im Imperium.',
    descEn: 'Operates freight terminals and reduces empire-wide transport costs.',
    foundingCost: 28000,
    primaryProduct: 'freight_service',
    baseDemand: 1.2,
    color: '#2dd4bf',
    icon: 'ship',
  },
  {
    id: 'energy',
    nameDe: 'Energieunternehmen',
    nameEn: 'Energy & Grid',
    descDe: 'Erzeugt sauberen Strom für eigene Fabriken und das Stadtnetz.',
    descEn: 'Generates clean electricity for your factories and the city grid.',
    foundingCost: 32000,
    primaryProduct: 'energy_unit',
    baseDemand: 1.3,
    color: '#10b981',
    icon: 'zap',
  },
  {
    id: 'realestate',
    nameDe: 'Immobilienunternehmen',
    nameEn: 'Real Estate Group',
    descDe: 'Erwirtschaftet stetige Mieteinnahmen aus Bürotürmen & Wohnanlagen.',
    descEn: 'Generates steady rental yield from office towers and residences.',
    foundingCost: 40000,
    primaryProduct: 'lease_yield',
    baseDemand: 1.15,
    color: '#eab308',
    icon: 'building',
  },
  {
    id: 'banking',
    nameDe: 'Bank & Finanzinstitut',
    nameEn: 'Banking & Finance',
    descDe: 'Erhöht Zinserträge, Kapitalrendite und Handelsfinanzierung.',
    descEn: 'Boosts capital yields, corporate credit lines, and market liquidity.',
    foundingCost: 60000,
    primaryProduct: 'financial_yield',
    baseDemand: 1.2,
    color: '#f59e0b',
    icon: 'landmark',
  },
  {
    id: 'retail',
    nameDe: 'Einzelhandelsunternehmen',
    nameEn: 'Retail & Commerce',
    descDe: 'Verkauft Konsumgüter und Elektronik direkt an Stadtbewohner.',
    descEn: 'Sells consumer goods and electronics directly to city citizens.',
    foundingCost: 22000,
    primaryProduct: 'consumer_goods',
    baseDemand: 1.35,
    color: '#fb7185',
    icon: 'shopping-bag',
  },
  {
    id: 'manufacturing',
    nameDe: 'Produktionsunternehmen',
    nameEn: 'Industrial Manufacturing',
    descDe: 'Verarbeitet Stahl, Beton und Baustoffe für die gesamte Stadt.',
    descEn: 'Processes steel, concrete, and industrial parts for city growth.',
    foundingCost: 26000,
    primaryProduct: 'steel',
    baseDemand: 1.25,
    color: '#94a3b8',
    icon: 'factory',
  },
];

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'startup_office',
    nameDe: 'Gründerbüro',
    nameEn: 'Startup Office',
    category: 'commercial',
    industryId: 'software',
    cost: 18000,
    materials: { concrete: 12, steel: 6 },
    maintenancePerHour: 220,
    energyUsePerHour: 15,
    energyOutputPerHour: 0,
    employeeSlots: 6,
    baseOutputPerHour: 12,
    baseRevenuePerHour: 1450,
    buildTimeSec: 18,
    requiredTech: null,
    maxLevel: 5,
    heightScale: 1.0,
    color: '#6366f1',
  },
  {
    id: 'workshop_factory',
    nameDe: 'Fertigungswerk',
    nameEn: 'Manufacturing Plant',
    category: 'industrial',
    industryId: 'manufacturing',
    cost: 28000,
    materials: { concrete: 18, steel: 16 },
    maintenancePerHour: 380,
    energyUsePerHour: 45,
    energyOutputPerHour: 0,
    employeeSlots: 12,
    baseOutputPerHour: 18,
    baseRevenuePerHour: 2150,
    buildTimeSec: 25,
    requiredTech: null,
    maxLevel: 5,
    heightScale: 0.9,
    color: '#f59e0b',
  },
  {
    id: 'retail_plaza',
    nameDe: 'Einkaufszentrum',
    nameEn: 'Shopping Mall',
    category: 'residential',
    industryId: 'retail',
    cost: 34000,
    materials: { concrete: 20, steel: 14 },
    maintenancePerHour: 420,
    energyUsePerHour: 35,
    energyOutputPerHour: 0,
    employeeSlots: 14,
    baseOutputPerHour: 20,
    baseRevenuePerHour: 2600,
    buildTimeSec: 26,
    requiredTech: null,
    maxLevel: 5,
    heightScale: 1.1,
    color: '#fb7185',
  },
  {
    id: 'solar_station',
    nameDe: 'Solarkraftwerk',
    nameEn: 'Solar Power Plant',
    category: 'energy',
    industryId: 'energy',
    cost: 30000,
    materials: { steel: 14, silicon: 8 },
    maintenancePerHour: 240,
    energyUsePerHour: 0,
    energyOutputPerHour: 110,
    employeeSlots: 5,
    baseOutputPerHour: 30,
    baseRevenuePerHour: 1950,
    buildTimeSec: 20,
    requiredTech: null,
    maxLevel: 5,
    heightScale: 0.7,
    color: '#10b981',
  },
  {
    id: 'logistics_hub',
    nameDe: 'Logistikterminal',
    nameEn: 'Logistics Terminal',
    category: 'logistics',
    industryId: 'logistics',
    cost: 36000,
    materials: { concrete: 22, steel: 18 },
    maintenancePerHour: 410,
    energyUsePerHour: 28,
    energyOutputPerHour: 0,
    employeeSlots: 10,
    baseOutputPerHour: 22,
    baseRevenuePerHour: 2700,
    buildTimeSec: 28,
    requiredTech: null,
    maxLevel: 5,
    heightScale: 0.85,
    color: '#14b8a6',
  },
  {
    id: 'food_campus',
    nameDe: 'Agrar- & Lebensmittelwerk',
    nameEn: 'Food Processing Campus',
    category: 'industrial',
    industryId: 'food',
    cost: 26000,
    materials: { concrete: 16, steel: 10 },
    maintenancePerHour: 310,
    energyUsePerHour: 26,
    energyOutputPerHour: 0,
    employeeSlots: 10,
    baseOutputPerHour: 24,
    baseRevenuePerHour: 2100,
    buildTimeSec: 22,
    requiredTech: null,
    maxLevel: 5,
    heightScale: 0.85,
    color: '#84cc16',
  },
  {
    id: 'residential_tower',
    nameDe: 'Wohn- & Business-Turm',
    nameEn: 'Residential Tower',
    category: 'residential',
    industryId: 'realestate',
    cost: 48000,
    materials: { concrete: 30, steel: 22 },
    maintenancePerHour: 450,
    energyUsePerHour: 30,
    energyOutputPerHour: 0,
    employeeSlots: 8,
    baseOutputPerHour: 16,
    baseRevenuePerHour: 3400,
    buildTimeSec: 36,
    requiredTech: null,
    maxLevel: 5,
    heightScale: 1.6,
    color: '#eab308',
  },
  {
    id: 'tech_lab',
    nameDe: 'Tech- & Chipfabrik',
    nameEn: 'Semiconductor Fab',
    category: 'tech',
    industryId: 'tech',
    cost: 62000,
    materials: { concrete: 25, steel: 24, silicon: 18 },
    maintenancePerHour: 680,
    energyUsePerHour: 70,
    energyOutputPerHour: 0,
    employeeSlots: 18,
    baseOutputPerHour: 26,
    baseRevenuePerHour: 4800,
    buildTimeSec: 42,
    requiredTech: 'production_1',
    maxLevel: 5,
    heightScale: 1.35,
    color: '#38bdf8',
  },
  {
    id: 'ev_gigafactory',
    nameDe: 'Automobil-Gigafactory',
    nameEn: 'EV Gigafactory',
    category: 'industrial',
    industryId: 'automotive',
    cost: 88000,
    materials: { concrete: 36, steel: 40, silicon: 14 },
    maintenancePerHour: 920,
    energyUsePerHour: 95,
    energyOutputPerHour: 0,
    employeeSlots: 28,
    baseOutputPerHour: 16,
    baseRevenuePerHour: 6800,
    buildTimeSec: 50,
    requiredTech: 'robotics_1',
    maxLevel: 5,
    heightScale: 1.2,
    color: '#f97316',
  },
  {
    id: 'bank_hq',
    nameDe: 'Finanz- & Bankentower',
    nameEn: 'Financial Bank Tower',
    category: 'commercial',
    industryId: 'banking',
    cost: 95000,
    materials: { concrete: 34, steel: 32, silicon: 10 },
    maintenancePerHour: 840,
    energyUsePerHour: 55,
    energyOutputPerHour: 0,
    employeeSlots: 20,
    baseOutputPerHour: 20,
    baseRevenuePerHour: 7400,
    buildTimeSec: 55,
    requiredTech: 'management_1',
    maxLevel: 5,
    heightScale: 2.1,
    color: '#f59e0b',
  },
  {
    id: 'ai_datacenter',
    nameDe: 'KI-Rechenzentrum',
    nameEn: 'AI Quantum Datacenter',
    category: 'tech',
    industryId: 'software',
    cost: 115000,
    materials: { concrete: 32, steel: 30, silicon: 28 },
    maintenancePerHour: 1050,
    energyUsePerHour: 130,
    energyOutputPerHour: 0,
    employeeSlots: 16,
    baseOutputPerHour: 34,
    baseRevenuePerHour: 9200,
    buildTimeSec: 65,
    requiredTech: 'ai_1',
    maxLevel: 5,
    heightScale: 1.5,
    color: '#818cf8',
  },
  {
    id: 'global_skyscraper',
    nameDe: 'Konzern-Wolkenkratzer',
    nameEn: 'Global HQ Skyscraper',
    category: 'commercial',
    industryId: 'realestate',
    cost: 160000,
    materials: { concrete: 50, steel: 55, silicon: 22 },
    maintenancePerHour: 1400,
    energyUsePerHour: 110,
    energyOutputPerHour: 0,
    employeeSlots: 40,
    baseOutputPerHour: 40,
    baseRevenuePerHour: 13500,
    buildTimeSec: 80,
    requiredTech: 'management_2',
    maxLevel: 5,
    heightScale: 2.8,
    color: '#38bdf8',
  },
];

export function getUpgradeDurationSec(baseBuildTimeSec: number, currentLevel: number): number {
  return Math.max(10, Math.round(baseBuildTimeSec * (0.5 + Math.max(1, currentLevel) * 0.65)));
}

export const RESOURCES: ResourceDef[] = [
  { id: 'steel', nameDe: 'Industriestahl', nameEn: 'Industrial Steel', unit: 't', basePrice: 420, minPrice: 240, maxPrice: 820, volatility: 0.06, isRaw: true },
  { id: 'concrete', nameDe: 'Spezialbeton', nameEn: 'Structural Concrete', unit: 't', basePrice: 210, minPrice: 120, maxPrice: 420, volatility: 0.04, isRaw: true },
  { id: 'silicon', nameDe: 'Hochreines Silizium', nameEn: 'Pure Silicon', unit: 'kg', basePrice: 860, minPrice: 480, maxPrice: 1650, volatility: 0.08, isRaw: true },
  { id: 'lithium', nameDe: 'Lithium-Zellen', nameEn: 'Lithium Cells', unit: 'u', basePrice: 1150, minPrice: 650, maxPrice: 2200, volatility: 0.09, isRaw: true },
  { id: 'energy_unit', nameDe: 'Stromkontingent', nameEn: 'Grid Power MWh', unit: 'MWh', basePrice: 180, minPrice: 80, maxPrice: 460, volatility: 0.10, isRaw: true },
  { id: 'grain', nameDe: 'Agrarrohstoffe', nameEn: 'Agri Commodities', unit: 't', basePrice: 160, minPrice: 90, maxPrice: 320, volatility: 0.05, isRaw: true },
  { id: 'microchip', nameDe: 'Mikrochips', nameEn: 'Microchips', unit: 'box', basePrice: 2400, minPrice: 1500, maxPrice: 4200, volatility: 0.07, isRaw: false },
  { id: 'software_license', nameDe: 'Enterprise-Lizenzen', nameEn: 'Enterprise Licenses', unit: 'lic', basePrice: 1950, minPrice: 1100, maxPrice: 3500, volatility: 0.05, isRaw: false },
  { id: 'ev_vehicle', nameDe: 'Elektrofahrzeuge', nameEn: 'EV Vehicles', unit: 'veh', basePrice: 18500, minPrice: 12000, maxPrice: 29000, volatility: 0.06, isRaw: false },
  { id: 'consumer_goods', nameDe: 'Konsumgüter', nameEn: 'Consumer Goods', unit: 'pal', basePrice: 950, minPrice: 550, maxPrice: 1800, volatility: 0.04, isRaw: false },
];

export const TECHNOLOGIES: TechDef[] = [
  { id: 'automation_1', branch: 'automation', branchNameDe: 'Automatisierung', branchNameEn: 'Automation', nameDe: 'Prozess-Automatisierung I', nameEn: 'Process Automation I', descDe: '+15% Produktionsoutput in allen Werken.', descEn: '+15% production output across all facilities.', cost: 18000, researchTimeSec: 8, prereq: null, effectKey: 'output_mult', effectValue: 0.15 },
  { id: 'automation_2', branch: 'automation', branchNameDe: 'Automatisierung', branchNameEn: 'Automation', nameDe: 'Autonome Lieferketten', nameEn: 'Autonomous Pipelines', descDe: '+25% Produktionsoutput & -10% Unterhalt.', descEn: '+25% output & -10% maintenance.', cost: 55000, researchTimeSec: 12, prereq: 'automation_1', effectKey: 'output_mult', effectValue: 0.25 },
  { id: 'ai_1', branch: 'ai', branchNameDe: 'Künstliche Intelligenz', branchNameEn: 'Artificial Intelligence', nameDe: 'KI-Marktanalyse', nameEn: 'AI Market Forecasting', descDe: 'Schaltet KI-Rechenzentrum frei & +15% Software-Umsatz.', descEn: 'Unlocks AI Datacenter & +15% software revenue.', cost: 36000, researchTimeSec: 10, prereq: null, effectKey: 'tech_revenue_mult', effectValue: 0.15 },
  { id: 'ai_2', branch: 'ai', branchNameDe: 'Künstliche Intelligenz', branchNameEn: 'Artificial Intelligence', nameDe: 'Neuronale Unternehmenssteuerung', nameEn: 'Neural Enterprise Ops', descDe: '+20% Mitarbeiter-Produktivität.', descEn: '+20% workforce productivity.', cost: 85000, researchTimeSec: 14, prereq: 'ai_1', effectKey: 'productivity_mult', effectValue: 0.20 },
  { id: 'robotics_1', branch: 'robotics', branchNameDe: 'Robotik', branchNameEn: 'Robotics', nameDe: 'Industrierobotik', nameEn: 'Industrial Robotics', descDe: 'Schaltet EV-Gigafactory frei & +12% Fabrik-Effizienz.', descEn: 'Unlocks EV Gigafactory & +12% factory efficiency.', cost: 34000, researchTimeSec: 10, prereq: null, effectKey: 'output_mult', effectValue: 0.12 },
  { id: 'robotics_2', branch: 'robotics', branchNameDe: 'Robotik', branchNameEn: 'Robotics', nameDe: 'Vollrobotische Montage', nameEn: 'Zero-Touch Assembly', descDe: '-20% Lohnkosten-Belastung durch Robotik.', descEn: '-20% wage overhead via robotics.', cost: 78000, researchTimeSec: 14, prereq: 'robotics_1', effectKey: 'wage_discount', effectValue: 0.20 },
  { id: 'energy_1', branch: 'energy', branchNameDe: 'Energie', branchNameEn: 'Energy', nameDe: 'Smart-Grid-Speicher', nameEn: 'Smart Grid Storage', descDe: '-18% Energiekosten & +20% Solarertrag.', descEn: '-18% energy costs & +20% solar yield.', cost: 22000, researchTimeSec: 8, prereq: null, effectKey: 'energy_discount', effectValue: 0.18 },
  { id: 'energy_2', branch: 'energy', branchNameDe: 'Energie', branchNameEn: 'Energy', nameDe: 'Hocheffizienz-Netze', nameEn: 'Superconducting Grids', descDe: '-25% Energiekosten imperiumweit.', descEn: '-25% empire-wide energy costs.', cost: 64000, researchTimeSec: 12, prereq: 'energy_1', effectKey: 'energy_discount', effectValue: 0.25 },
  { id: 'transport_1', branch: 'transport', branchNameDe: 'Transport', branchNameEn: 'Transport', nameDe: 'Elektro-Flottenlogistik', nameEn: 'EV Fleet Logistics', descDe: '-20% Transportkosten.', descEn: '-20% transport costs.', cost: 20000, researchTimeSec: 8, prereq: null, effectKey: 'transport_discount', effectValue: 0.20 },
  { id: 'transport_2', branch: 'transport', branchNameDe: 'Transport', branchNameEn: 'Transport', nameDe: 'Autonome Frachtkorridore', nameEn: 'Autonomous Freight', descDe: '-25% Transportkosten & +10% Exportmarge.', descEn: '-25% transport costs & +10% export margin.', cost: 58000, researchTimeSec: 12, prereq: 'transport_1', effectKey: 'transport_discount', effectValue: 0.25 },
  { id: 'production_1', branch: 'production', branchNameDe: 'Produktion', branchNameEn: 'Production', nameDe: 'Reinraum-Fertigung', nameEn: 'Cleanroom Fabrication', descDe: 'Schaltet Tech- & Chipfabrik frei.', descEn: 'Unlocks Semiconductor Fab.', cost: 26000, researchTimeSec: 9, prereq: null, effectKey: 'output_mult', effectValue: 0.10 },
  { id: 'production_2', branch: 'production', branchNameDe: 'Produktion', branchNameEn: 'Production', nameDe: 'Präzisions-Metallurgie', nameEn: 'Precision Metallurgy', descDe: '-15% Materialkosten beim Bauen.', descEn: '-15% building material consumption.', cost: 62000, researchTimeSec: 12, prereq: 'production_1', effectKey: 'build_discount', effectValue: 0.15 },
  { id: 'marketing_1', branch: 'marketing', branchNameDe: 'Marketing', branchNameEn: 'Marketing', nameDe: 'Digitale Markenstrategie', nameEn: 'Digital Brand Engine', descDe: '+15% Kundennachfrage & Reputation.', descEn: '+15% market demand & brand reputation.', cost: 20000, researchTimeSec: 8, prereq: null, effectKey: 'demand_mult', effectValue: 0.15 },
  { id: 'marketing_2', branch: 'marketing', branchNameDe: 'Marketing', branchNameEn: 'Marketing', nameDe: 'Globale Kampagnen', nameEn: 'Global Campaigns', descDe: '+25% Kundennachfrage für alle Produkte.', descEn: '+25% global product demand.', cost: 56000, researchTimeSec: 12, prereq: 'marketing_1', effectKey: 'demand_mult', effectValue: 0.25 },
  { id: 'logistics_1', branch: 'logistics', branchNameDe: 'Logistik', branchNameEn: 'Logistics', nameDe: 'Container-Optimierung', nameEn: 'Container Optimization', descDe: '+20% Lagerkapazität & Handelstempo.', descEn: '+20% cargo efficiency & trade throughput.', cost: 22000, researchTimeSec: 8, prereq: null, effectKey: 'revenue_mult', effectValue: 0.08 },
  { id: 'logistics_2', branch: 'logistics', branchNameDe: 'Logistik', branchNameEn: 'Logistics', nameDe: 'Weltweite Luftfracht', nameEn: 'Global Air Freight', descDe: '+12% Gesamterlös auf alle Exporte.', descEn: '+12% global export revenue.', cost: 65000, researchTimeSec: 12, prereq: 'logistics_1', effectKey: 'revenue_mult', effectValue: 0.12 },
  { id: 'management_1', branch: 'management', branchNameDe: 'Unternehmensführung', branchNameEn: 'Corporate Management', nameDe: 'Holding-Strukturen', nameEn: 'Corporate Holdings', descDe: 'Schaltet Bankentower frei & -3% Steuerlast.', descEn: 'Unlocks Bank Tower & -3% effective tax.', cost: 38000, researchTimeSec: 10, prereq: null, effectKey: 'tax_discount', effectValue: 0.03 },
  { id: 'management_2', branch: 'management', branchNameDe: 'Unternehmensführung', branchNameEn: 'Corporate Management', nameDe: 'Globales Konzern-HQ', nameEn: 'Global Megacorp HQ', descDe: 'Schaltet Wolkenkratzer frei & +15% Gesamtumsatz.', descEn: 'Unlocks Global Skyscraper & +15% revenue.', cost: 110000, researchTimeSec: 15, prereq: 'management_1', effectKey: 'revenue_mult', effectValue: 0.15 },
];

export const MISSIONS: MissionDef[] = [
  { id: 'm_first_company', type: 'story', titleDe: 'Gründergeist', titleEn: 'Founder Spirit', descDe: 'Gründe dein erstes eigenes Unternehmen.', descEn: 'Found your very first company.', metric: 'companiesCount', target: 1, rewardCash: 15000, rewardXp: 250 },
  { id: 'm_first_building', type: 'story', titleDe: 'Erster Spatenstich', titleEn: 'First Groundbreaking', descDe: 'Errichte dein erstes Gebäude auf einem Grundstück.', descEn: 'Construct your first building on a city plot.', metric: 'buildingsCount', target: 1, rewardCash: 20000, rewardXp: 350 },
  { id: 'm_hire_staff', type: 'story', titleDe: 'Teamaufbau', titleEn: 'Build Your Team', descDe: 'Stelle mindestens 3 Mitarbeiter oder Manager ein.', descEn: 'Hire at least 3 employees or managers.', metric: 'employeesCount', target: 3, rewardCash: 18000, rewardXp: 300 },
  { id: 'm_research_1', type: 'story', titleDe: 'Innovationskraft', titleEn: 'Innovation Drive', descDe: 'Schließe deine erste Technologie-Forschung ab.', descEn: 'Complete your first technology research.', metric: 'researchCount', target: 1, rewardCash: 25000, rewardXp: 400 },
  { id: 'm_expand_3', type: 'milestone', titleDe: 'Stadtentwickler', titleEn: 'Urban Developer', descDe: 'Besitze 3 Gebäude gleichzeitig in der Metropole.', descEn: 'Own 3 buildings simultaneously in the city.', metric: 'buildingsCount', target: 3, rewardCash: 45000, rewardXp: 700 },
  { id: 'm_networth_500k', type: 'milestone', titleDe: 'Halbe Million', titleEn: 'Half-Millionaire', descDe: 'Erreiche ein Gesamtvermögen von 500.000 $.', descEn: 'Reach a total net worth of $500,000.', metric: 'netWorth', target: 500000, rewardCash: 60000, rewardXp: 1000 },
  { id: 'm_daily_trade', type: 'daily', titleDe: 'Tagesaufgabe: Marktaktivität', titleEn: 'Daily Task: Market Trader', descDe: 'Führe heute 2 Rohstoff- oder Handelsgeschäfte durch.', descEn: 'Complete 2 market or trade orders today.', metric: 'tradesCount', target: 2, rewardCash: 14000, rewardXp: 220 },
  { id: 'm_weekly_empire', type: 'weekly', titleDe: 'Wochenaufgabe: Multi-Konzern', titleEn: 'Weekly Task: Multi-Corp', descDe: 'Führe 3 Unternehmen in unterschiedlichen Branchen.', descEn: 'Operate 3 companies across industries.', metric: 'companiesCount', target: 3, rewardCash: 75000, rewardXp: 1200 },
];

export const COSMETICS: CosmeticDef[] = [
  { id: 'skin_default', category: 'skin', nameDe: 'Standard Urban Glass', nameEn: 'Standard Urban Glass', descDe: 'Klassische moderne Glas- und Stahlarchitektur.', descEn: 'Classic modern glass and steel architecture.', priceCredits: 0, primaryColor: '#1e293b', accentColor: '#38bdf8' },
  { id: 'skin_obsidian', category: 'skin', nameDe: 'Obsidian Stealth', nameEn: 'Obsidian Stealth', descDe: 'Tiefschwarzes Rauchglas mit kühlem Platinrahmen.', descEn: 'Deep obsidian smoked glass with platinum trim.', priceCredits: 150, primaryColor: '#090d16', accentColor: '#94a3b8' },
  { id: 'skin_emerald', category: 'skin', nameDe: 'Emerald Eco-Tower', nameEn: 'Emerald Eco-Tower', descDe: 'Nachhaltige Smaragd-Fassade mit grünen Akzenten.', descEn: 'Sustainable emerald glass with botanical accents.', priceCredits: 200, primaryColor: '#064e3b', accentColor: '#34d399' },
  { id: 'skin_royal_gold', category: 'skin', nameDe: 'Executive Gold', nameEn: 'Executive Gold', descDe: 'Exklusive Champagner-Gold-Fassade für Konzernzentralen.', descEn: 'Exclusive champagne-gold facade for flagship towers.', priceCredits: 350, primaryColor: '#1c1917', accentColor: '#f59e0b' },
  { id: 'deco_monument', category: 'decoration', nameDe: 'Konzern-Skulptur', nameEn: 'Corporate Plaza Sculpture', descDe: 'Rein kosmetisches Wahrzeichen auf deinem Hauptquartier.', descEn: 'Purely cosmetic architectural centerpiece.', priceCredits: 250, primaryColor: '#0f172a', accentColor: '#818cf8' },
];

export const EMPLOYEE_FIRST_NAMES = ['Lukas', 'Elena', 'Marcus', 'Sofia', 'Jonas', 'Klara', 'Henrik', 'Nadia', 'Felix', 'Amelie', 'David', 'Hannah', 'Tobias', 'Mila', 'Julian', 'Lea'];
export const EMPLOYEE_LAST_NAMES = ['Weber', 'Keller', 'Vance', 'Becker', 'Lindqvist', 'Hoffmann', 'Mercer', 'Richter', 'Fischer', 'Sato', 'Bauer', 'Klein', 'Novak', 'Meyer'];
export const EMPLOYEE_ROLES = [
  { id: 'worker', nameDe: 'Produktionsfachkraft', nameEn: 'Production Specialist', baseSalary: 45 },
  { id: 'engineer', nameDe: 'Systemingenieur', nameEn: 'Systems Engineer', baseSalary: 72 },
  { id: 'analyst', nameDe: 'Finanzanalyst', nameEn: 'Financial Analyst', baseSalary: 68 },
  { id: 'marketer', nameDe: 'Markenstratege', nameEn: 'Brand Strategist', baseSalary: 62 },
  { id: 'logistics', nameDe: 'Logistikkoordinator', nameEn: 'Logistics Coordinator', baseSalary: 56 },
  { id: 'manager', nameDe: 'Executive Manager', nameEn: 'Executive Manager', baseSalary: 115 },
];
