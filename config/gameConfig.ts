export interface DistrictDef {
  id: string;
  nameDe: string;
  nameEn: string;
  landMultiplier: number;
  taxRate: number;
  bonusDe: string;
  bonusEn: string;
  accentColor: string;
}

export interface PlotBlueprint {
  id: string;
  code: string;
  district: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  basePrice: number;
  zoneType: 'commercial' | 'industrial' | 'tech' | 'logistics' | 'residential' | 'energy';
}

export const GAME_CONFIG = {
  APP_NAME: 'DIGITALEMPIRE',
  VERSION: '1.0.0',
  STARTING_CASH: 100000,
  STARTING_MATERIALS: {
    steel: 0,
    concrete: 0,
    silicon: 0,
  },
  TICK_INTERVAL_MS: 2500, // 1 game hour every 2.5 seconds
  MAX_OFFLINE_HOURS: 24,
  XP_PER_LEVEL_BASE: 500,
  XP_LEVEL_EXPONENT: 1.38,
  CITY_GRID_HALF: 140,
  BLOCK_SIZE: 32,
  ROAD_WIDTH: 8,
};

export const DISTRICTS: Record<string, DistrictDef> = {
  downtown: {
    id: 'downtown',
    nameDe: 'Finanzzentrum',
    nameEn: 'Financial Downtown',
    landMultiplier: 1.65,
    taxRate: 0.16,
    bonusDe: '+20% Dienstleistungs- & Bankumsatz',
    bonusEn: '+20% Services & Banking Revenue',
    accentColor: '#38bdf8',
  },
  techpark: {
    id: 'techpark',
    nameDe: 'Technologiepark',
    nameEn: 'Tech Innovation Park',
    landMultiplier: 1.35,
    taxRate: 0.13,
    bonusDe: '+20% Forschungs- & Software-Output',
    bonusEn: '+20% Research & Software Output',
    accentColor: '#818cf8',
  },
  industrial: {
    id: 'industrial',
    nameDe: 'Industriegürtel',
    nameEn: 'Industrial Belt',
    landMultiplier: 0.85,
    taxRate: 0.11,
    bonusDe: '+25% Produktionskapazität',
    bonusEn: '+25% Production Capacity',
    accentColor: '#f59e0b',
  },
  harbor: {
    id: 'harbor',
    nameDe: 'Hafen & Logistik',
    nameEn: 'Harbor Logistics',
    landMultiplier: 1.1,
    taxRate: 0.12,
    bonusDe: '-30% Transportkosten',
    bonusEn: '-30% Transport Costs',
    accentColor: '#2dd4bf',
  },
  residential: {
    id: 'residential',
    nameDe: 'Wohn- & Handelsviertel',
    nameEn: 'Residential & Retail',
    landMultiplier: 1.15,
    taxRate: 0.14,
    bonusDe: '+25% Einzelhandels-Nachfrage',
    bonusEn: '+25% Retail Demand',
    accentColor: '#fb7185',
  },
  energy: {
    id: 'energy',
    nameDe: 'Energiekorridor',
    nameEn: 'Energy Corridor',
    landMultiplier: 0.9,
    taxRate: 0.10,
    bonusDe: '+30% Stromerzeugung',
    bonusEn: '+30% Power Generation',
    accentColor: '#34d399',
  },
};

function generateCityPlots(): PlotBlueprint[] {
  const plots: PlotBlueprint[] = [];
  // City blocks centered on a 4x4 grid of blocks (spacing = 40 units between road centers)
  // Roads run at x = -80, -40, 0, 40, 80 and z = -80, -40, 0, 40, 80
  // Inside each 32x32 block (center at -60, -20, +20, +60), we place 3 buildable plots (12x12 each) + ambient structures
  const blockCenters = [-60, -20, 20, 60];
  let idx = 1;

  const districtForBlock = (bx: number, bz: number): { district: string; zone: PlotBlueprint['zoneType'] } => {
    if (bx >= 20 && bz >= 20 && bx <= 20 && bz <= 20) return { district: 'downtown', zone: 'commercial' };
    if (bx === -20 && bz === -20) return { district: 'downtown', zone: 'commercial' };
    if (bx === 20 && bz === -20) return { district: 'techpark', zone: 'tech' };
    if (bx === 60 && bz <= -20) return { district: 'techpark', zone: 'tech' };
    if (bx === -60 && bz >= 20) return { district: 'harbor', zone: 'logistics' };
    if (bx === -20 && bz === 60) return { district: 'harbor', zone: 'logistics' };
    if (bx === -60 && bz <= -20) return { district: 'industrial', zone: 'industrial' };
    if (bx === -20 && bz === -60) return { district: 'industrial', zone: 'industrial' };
    if (bx === 60 && bz >= 20) return { district: 'energy', zone: 'energy' };
    if (bx === 20 && bz === 60) return { district: 'residential', zone: 'residential' };
    if (bx === -20 && bz === 20) return { district: 'downtown', zone: 'commercial' };
    return { district: 'residential', zone: 'residential' };
  };

  for (const bz of blockCenters) {
    for (const bx of blockCenters) {
      const { district, zone } = districtForBlock(bx, bz);
      const mult = DISTRICTS[district].landMultiplier;
      // 3 interactive plots per block (total 48 plots)
      const offsets = [
        { dx: -7.5, dz: -7.5 },
        { dx: 7.5, dz: -7.5 },
        { dx: -7.5, dz: 7.5 },
      ];
      for (const off of offsets) {
        const basePrice = Math.round((15000 + ((idx * 3719) % 18000)) * mult / 500) * 500;
        plots.push({
          id: `plot_${idx}`,
          code: `${district.slice(0, 2).toUpperCase()}-${String(idx).padStart(2, '0')}`,
          district,
          x: bx + off.dx,
          z: bz + off.dz,
          width: 12.5,
          depth: 12.5,
          basePrice,
          zoneType: zone,
        });
        idx++;
      }
    }
  }
  return plots;
}

export const PLOT_BLUEPRINTS: PlotBlueprint[] = generateCityPlots();
