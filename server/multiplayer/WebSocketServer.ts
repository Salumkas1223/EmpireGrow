import type http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { db } from '../database/db.ts';

interface ClientMeta {
  ws: WebSocket;
  playerId: string;
  name: string;
  empireName: string;
}

export class RealtimeHub {
  private wss: WebSocketServer;
  private clients = new Map<WebSocket, ClientMeta>();

  constructor(server: http.Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws) => {
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(String(raw)) as { type: string; payload?: Record<string, string> };
          if (msg.type === 'auth' && msg.payload?.playerId) {
            const exists = db.prepare('SELECT id FROM players WHERE id = ?').get(msg.payload.playerId);
            if (!exists) {
              ws.send(JSON.stringify({ type: 'session:expired' }));
              return;
            }
            this.clients.set(ws, {
              ws,
              playerId: msg.payload.playerId,
              name: msg.payload.name || 'CEO',
              empireName: msg.payload.empireName || 'Empire',
            });
            this.broadcastPresence();
          } else if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', payload: { ts: Date.now() } }));
          }
        } catch {
          // Ignore malformed frames
        }
      });

      ws.on('close', () => {
        if (this.clients.has(ws)) {
          this.clients.delete(ws);
          this.broadcastPresence();
        }
      });
    });
  }

  public getActivePlayerIds(): string[] {
    const ids = new Set<string>();
    for (const meta of this.clients.values()) {
      ids.add(meta.playerId);
    }
    return Array.from(ids);
  }

  public getOnlinePlayers() {
    const seen = new Map<string, { playerId: string; name: string; empireName: string }>();
    for (const meta of this.clients.values()) {
      seen.set(meta.playerId, {
        playerId: meta.playerId,
        name: meta.name,
        empireName: meta.empireName,
      });
    }
    return Array.from(seen.values());
  }

  public broadcastPresence(): void {
    this.broadcast('presence:update', { onlinePlayers: this.getOnlinePlayers() });
  }

  public broadcast(type: string, payload: unknown, targetPlayerId?: string): void {
    const frame = JSON.stringify({ type, payload });
    for (const [ws, meta] of this.clients.entries()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (targetPlayerId && meta.playerId !== targetPlayerId) continue;
      ws.send(frame);
    }
  }
}
