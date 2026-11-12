import { CityWorld } from '../world/CityWorld.js';
import { UIManager } from '../ui/UIManager.js';
import { store } from './StateStore.js';
import { setLanguage } from '../../../localization/i18n.js';

async function bootstrap() {
  const appEl = document.getElementById('app');
  if (!appEl) return;

  // Isolated 3D WebGL mount container + sibling DOM UI overlay
  appEl.innerHTML = `
    <div id="canvas-mount" class="fixed inset-0 z-0"></div>
    <div id="ui-root" class="fixed inset-0 z-10 pointer-events-none"></div>
  `;

  const canvasMount = document.getElementById('canvas-mount');
  const uiRoot = document.getElementById('ui-root');

  setLanguage('de');

  const cityWorld = new CityWorld(canvasMount);
  new UIManager(uiRoot, cityWorld);

  try {
    const catalog = await store.api('/catalog');
    store.setCatalog(catalog);
  } catch (err) {
    console.error('Failed to load catalog:', err);
  }
}

bootstrap();
