import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { initDatabase } from './server/database/db.ts';
import { createApiRouter } from './server/api/routes.ts';
import { RealtimeHub } from './server/multiplayer/WebSocketServer.ts';
import { startSimulationLoop } from './server/systems/SimulationLoop.ts';

async function bootstrap() {
  initDatabase();

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const server = http.createServer(app);
  const hub = new RealtimeHub(server);

  app.use('/api', createApiRouter((type, payload, targetId) => hub.broadcast(type, payload, targetId)));
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, online: hub.getOnlinePlayers().length });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  startSimulationLoop(hub);

  const PORT = Number(process.env.DEFAULT_APP_PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`DIGITALEMPIRE server listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start DIGITALEMPIRE server:', err);
  process.exit(1);
});
