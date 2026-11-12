import { store } from './StateStore.js';

export class NetworkClient {
  constructor() {
    this.ws = null;
    this.playerId = null;
    this.playerMeta = null;
    this.reconnectTimer = null;
  }

  connect(playerId, name, empireName) {
    this.playerId = playerId;
    this.playerMeta = { playerId, name, empireName };
    this._openSocket();
  }

  _openSocket() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws`;
    this.ws = new WebSocket(url);

    this.ws.addEventListener('open', () => {
      if (this.playerMeta) {
        this.ws.send(JSON.stringify({ type: 'auth', payload: this.playerMeta }));
      }
    });

    this.ws.addEventListener('message', async (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'session:expired' && this.playerMeta && !this._recoveringSession) {
          this._recoveringSession = true;
          try {
            const res = await store.api('/session', this.playerMeta);
            if (res?.state) store.setState(res.state, 'api');
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify({ type: 'auth', payload: this.playerMeta }));
            }
          } catch {
            // Will retry on next reconnect if needed
          } finally {
            this._recoveringSession = false;
          }
        } else if (msg.type === 'state:tick' && msg.payload) {
          store.setState(msg.payload, 'tick');
        } else if (msg.type === 'presence:update' && msg.payload) {
          store.setOnlinePlayers(msg.payload.onlinePlayers);
        } else if (msg.type === 'trade:created' || msg.type === 'trade:completed' || msg.type === 'trade:cancelled' || msg.type === 'alliance:updated') {
          if (this.playerId) {
            store.api(`/state/${this.playerId}`).catch(() => {});
          }
        }
      } catch {
        // Ignore invalid JSON
      }
    });

    this.ws.addEventListener('close', () => {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        if (this.playerMeta) this._openSocket();
      }, 2500);
    });
  }
}

export const network = new NetworkClient();
