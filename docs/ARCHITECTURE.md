# DIGITALEMPIRE — System Architecture

## Overview
DIGITALEMPIRE is a server-authoritative 3D business & city-building simulation built with Vanilla JavaScript + Three.js (WebGL) on the client and Node.js + Express + WebSockets (`ws`) + SQLite (`node:sqlite`) on the server.

## Modular Directory Layout
- `/client/css/styles.css` — Tailwind CSS v4 + dark architectural UI tokens
- `/client/js/core/` — `main.js`, `StateStore.js`, `NetworkClient.js`
- `/client/js/world/` — `CityWorld.js`, `TerrainAndRoads.js`, `TrafficSystem.js`, `AtmosphereSystem.js`, `SmokeAndParticles.js`, `ProceduralTextures.js`
- `/client/js/buildings/` — `BuildingFactory.js`, `PlotSystem.js`
- `/client/js/economy/` — `FinancialCharts.js`
- `/client/js/audio/` — `SoundEngine.js` (100% procedural Web Audio API)
- `/client/js/ui/` — `UIManager.js`, `TitleScreen.js`, `MenuViews.js` (14 menus)
- `/server/database/db.ts` — SQLite WAL persistence with PostgreSQL-ready schema
- `/server/economy/EconomyEngine.ts` — Supply/demand, prices, taxes, wages, energy grid, offline progress
- `/server/multiplayer/WebSocketServer.ts` — Real-time WebSocket presence and broadcasts
- `/server/systems/SimulationLoop.ts` — Authoritative world clock, weather, market & player tick loop
- `/server/api/routes.ts` — REST endpoints validating every economic action server-side
- `/shared/gameData.ts` — Industries, buildings, resources, research, missions, cosmetics
- `/config/gameConfig.ts` — City grid, districts, and 48 plot blueprints
- `/localization/` — `i18n.js`, `de.json`, `en.json`

## PostgreSQL Migration Path
All SQLite tables in `/server/database/db.ts` use standard relational schemas (`players`, `owned_plots`, `buildings`, `companies`, `employees`, `inventory`, `player_research`, `market_prices`, `trade_offers`, `alliances`, `alliance_members`, `financial_history`, `cosmetics_owned`). Replacing `DatabaseSync` with a `pg.Pool` adapter in `db.ts` enables horizontal scaling without altering game logic.
