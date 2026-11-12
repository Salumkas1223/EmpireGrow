class StateStore {
  constructor() {
    this.state = null;
    this.catalog = null;
    this.onlinePlayers = [];
    this.leaderboard = [];
    this.candidates = [];
    this.selectedPlotId = null;
    this.buildRotation = 0;
    this.activeMenu = null; // null = closed (85%+ 3D viewport unobstructed), or 'dashboard'..'settings'
    this.visitingEmpire = null; // null or { player, financials, ownedPlots, buildings, companies }
    this.offlineReport = null;
    this.hudCollapsed = false;
    this.phase = 'title'; // 'title' | 'playing'
    this.localWeatherOverride = null;
    this.localTimeOverride = null; // null or 0..23
    this.listeners = new Set();
    this.toasts = [];
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(reason = 'update') {
    for (const fn of this.listeners) {
      fn(this, reason);
    }
  }

  setCatalog(catalog) {
    this.catalog = catalog;
    this.emit('catalog');
  }

  setState(newState, reason = 'state') {
    this.state = newState;
    this.emit(reason);
  }

  setOnlinePlayers(list) {
    this.onlinePlayers = list || [];
    this.emit('presence');
  }

  setLeaderboard(list) {
    this.leaderboard = list || [];
    this.emit('leaderboard');
  }

  setCandidates(list) {
    this.candidates = list || [];
    this.emit('candidates');
  }

  selectPlot(plotId) {
    this.selectedPlotId = plotId;
    this.emit('selection');
  }

  rotatePreview() {
    this.buildRotation = (this.buildRotation + 1) % 4;
    this.emit('rotation');
  }

  setMenu(menuId) {
    this.activeMenu = this.activeMenu === menuId ? null : menuId;
    this.emit('menu');
  }

  openMenu(menuId) {
    this.activeMenu = menuId;
    this.emit('menu');
  }

  closeMenu() {
    this.activeMenu = null;
    this.emit('menu');
  }

  setPhase(phase) {
    this.phase = phase;
    this.emit('phase');
  }

  toggleHud() {
    this.hudCollapsed = !this.hudCollapsed;
    this.emit('hud');
  }

  setVisiting(empireData) {
    this.visitingEmpire = empireData;
    this.selectedPlotId = null;
    this.emit('visiting');
  }

  notify(message, kind = 'info') {
    const id = Date.now() + Math.random();
    this.toasts.push({ id, message, kind });
    if (this.toasts.length > 4) this.toasts.shift();
    this.emit('toast');
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
      this.emit('toast');
    }, 3600);
  }

  async api(path, body = null) {
    const opts = body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : { method: 'GET' };

    const res = await fetch(`/api${path}`, opts);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }
    if (data.state) {
      this.setState(data.state, 'api');
    }
    return data;
  }
}

export const store = new StateStore();
