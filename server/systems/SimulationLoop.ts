import { getWorldState, setWorldState } from '../database/db.ts';
import { processPlayerTick, stepMarketEconomy } from '../economy/EconomyEngine.ts';
import { buildFullPlayerState } from '../api/routes.ts';
import type { RealtimeHub } from '../multiplayer/WebSocketServer.ts';
import { GAME_CONFIG } from '../../config/gameConfig.ts';

const WEATHERS = ['clear', 'clear', 'overcast', 'rain', 'clear', 'fog'];

export function startSimulationLoop(hub: RealtimeHub): NodeJS.Timeout {
  return setInterval(() => {
    try {
      const world = getWorldState();
      const nextHour = world.gameHour + 1;
      setWorldState('gameHour', String(nextHour));

      // Change weather deterministically every 12 game hours
      if (nextHour % 12 === 0) {
        const idx = Math.floor(nextHour / 12) % WEATHERS.length;
        setWorldState('weather', WEATHERS[idx]);
      }

      stepMarketEconomy(nextHour);

      const activeIds = hub.getActivePlayerIds();
      for (const pid of activeIds) {
        try {
          const ticked = processPlayerTick(pid, nextHour);
          if (!ticked) continue;
          const state = buildFullPlayerState(pid);
          if (state) {
            hub.broadcast('state:tick', state, pid);
          }
        } catch (err) {
          console.error(`Simulation tick failed for player ${pid}:`, err);
        }
      }
    } catch (err) {
      console.error('World simulation tick error:', err);
    }
  }, GAME_CONFIG.TICK_INTERVAL_MS);
}
