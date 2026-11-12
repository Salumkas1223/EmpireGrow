import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createProceduralTextures } from './ProceduralTextures.js';
import { buildTerrainAndRoads } from './TerrainAndRoads.js';
import { AtmosphereSystem } from './AtmosphereSystem.js';
import { TrafficSystem } from './TrafficSystem.js';
import { SmokeAndParticles } from './SmokeAndParticles.js';
import { PlotSystem } from '../buildings/PlotSystem.js';
import { store } from '../core/StateStore.js';
import { PLOT_BLUEPRINTS } from '../../../config/gameConfig.ts';

const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();

function detectSoftwareGl() {
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2') || probe.getContext('webgl');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param) || '');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export class CityWorld {
  constructor(mountEl) {
    this.mountEl = mountEl;
    this.isSoftwareGl = detectSoftwareGl();
    this.disposed = false;
    this.frameId = 0;
    this.lastFrameTime = performance.now();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(mountEl.clientWidth || window.innerWidth, mountEl.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountEl.appendChild(this.renderer.domElement);

    // WebGL context loss guard
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      cancelAnimationFrame(this.frameId);
      clearTimeout(this.frameId);
    });

    // Scene & Studio Environment Reflection (RoomEnvironment on all devices)
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Camera & OrbitControls
    const aspect = (mountEl.clientWidth || window.innerWidth) / Math.max(1, mountEl.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(46, aspect, 0.5, 850);
    this.camera.position.set(62, 38, 68);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.minDistance = 18;
    this.controls.maxDistance = 210;
    this.controls.target.set(-10, 0, -10);

    // Smooth camera preset transition state
    this.camTransition = null;
    this.controls.addEventListener('start', () => {
      this.camTransition = null; // User manual control immediately cancels preset glide
    });

    // Build World Subsystems
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);
    this.terrain = buildTerrainAndRoads(this.scene, this.textures);
    this.atmosphere = new AtmosphereSystem(this.scene, this.isSoftwareGl);
    this.traffic = new TrafficSystem(this.scene, this.terrain, this.textures);
    this.smoke = new SmokeAndParticles(this.scene);
    this.plots = new PlotSystem(this.scene, this.textures);
    this._windowMaterials = [...this.terrain.ambientWindowMaterials];

    // Raycasting (dedicated layer 1 for interactive plot pads)
    this.raycaster = new THREE.Raycaster();
    this.raycaster.layers.set(1);
    this.pointer = new THREE.Vector2();
    this.hoveredPlotId = null;
    this.lastHoverRaycast = 0;
    this.pointerDownPos = { x: 0, y: 0 };

    // Keyboard held movement
    this.keys = {};
    this._bindEvents();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this._lastSyncSig = '';
    this._startLoop();
  }

  _bindEvents() {
    const dom = this.renderer.domElement;

    this._onPointerDown = (e) => {
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    this._onPointerMove = (e) => {
      const now = performance.now();
      if (now - this.lastHoverRaycast < 45) return;
      this.lastHoverRaycast = now;

      const rect = dom.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.plots.hitMeshes, false);
      const hitPlot = hits.length > 0 ? hits[0].object.userData.plotId : null;
      if (hitPlot !== this.hoveredPlotId) {
        this.hoveredPlotId = hitPlot;
        dom.style.cursor = hitPlot ? 'pointer' : 'grab';
        this.syncFromStore(true);
      }
    };

    this._onPointerUp = (e) => {
      if (store.phase !== 'playing') return;
      const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
      if (dist > 6) return; // Ignore camera drag releases

      const rect = dom.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.plots.hitMeshes, false);
      if (hits.length > 0) {
        const plotId = hits[0].object.userData.plotId;
        store.selectPlot(plotId);
      }
    };

    this._onKeyDown = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
      this.keys[e.code] = true;
    };

    this._onKeyUp = (e) => {
      this.keys[e.code] = false;
    };

    this._onBlur = () => {
      this.keys = {};
    };

    this._onResize = () => {
      const w = this.mountEl.clientWidth || window.innerWidth;
      const h = this.mountEl.clientHeight || window.innerHeight;
      this.camera.aspect = w / Math.max(1, h);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };

    dom.addEventListener('pointerdown', this._onPointerDown);
    dom.addEventListener('pointermove', this._onPointerMove);
    dom.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('resize', this._onResize);
  }

  setCameraPreset(preset, targetPlotId = null) {
    const presets = {
      overview: { pos: new THREE.Vector3(82, 62, 92), target: new THREE.Vector3(-8, 0, -8) },
      downtown: { pos: new THREE.Vector3(24, 34, 38), target: new THREE.Vector3(-12, 4, -12) },
      harbor: { pos: new THREE.Vector3(-25, 28, 148), target: new THREE.Vector3(-55, 2, 105) },
      airport: { pos: new THREE.Vector3(145, 32, 35), target: new THREE.Vector3(112, 3, -10) },
      industrial: { pos: new THREE.Vector3(-92, 34, -85), target: new THREE.Vector3(-48, 2, -45) },
    };

    if (preset === 'plot' && targetPlotId) {
      const bp = PLOT_BLUEPRINTS.find((p) => p.id === targetPlotId);
      if (bp) {
        this.camTransition = {
          pos: new THREE.Vector3(bp.x + 22, 22, bp.z + 24),
          target: new THREE.Vector3(bp.x, 2, bp.z),
        };
        return;
      }
    }

    const p = presets[preset];
    if (p) {
      this.camTransition = { pos: p.pos.clone(), target: p.target.clone() };
    }
  }

  syncFromStore(force = false) {
    const viewSource = store.visitingEmpire || store.state;
    if (!viewSource) return;

    const sig = JSON.stringify({
      owned: viewSource.ownedPlots,
      bld: viewSource.buildings,
      sel: store.selectedPlotId,
      hov: this.hoveredPlotId,
    });
    if (!force && sig === this._lastSyncSig) return;
    this._lastSyncSig = sig;

    const smokePos = this.plots.syncState(viewSource.ownedPlots, viewSource.buildings, store.selectedPlotId, this.hoveredPlotId);
    this.smoke.setEmitters(smokePos);
    this._windowMaterials = [...this.terrain.ambientWindowMaterials, ...this.plots.windowMaterials];
  }

  _startLoop() {
    const afterDraw = (cb) => {
      const gl = this.renderer.getContext();
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
        const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const rawDt = (now - this.lastFrameTime) / 1000;
      this.lastFrameTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      // Update atmosphere from server world clock (or user preview override)
      const worldState = store.state?.world;
      const hour = store.localTimeOverride !== null ? store.localTimeOverride : ((worldState?.gameHour ?? 10) % 24);
      const weather = store.localWeatherOverride || worldState?.weather || 'clear';
      this.atmosphere.setTargetState(hour, weather);
      this.atmosphere.update(dt, this.terrain.streetLampBulbs, this._windowMaterials, this.textures.waterBump, this.terrain.roadMaterials);

      // Title screen gentle camera pan
      if (store.phase === 'title') {
        const angle = now * 0.00012;
        this.camera.position.set(Math.cos(angle) * 76, 38, Math.sin(angle) * 76);
        this.controls.target.set(0, 8, 0);
      } else {
        // Keyboard WASD/Arrow camera panning
        const panSpeed = 52 * dt;
        this.camera.getWorldDirection(_vec3A);
        _vec3A.y = 0;
        _vec3A.normalize();
        _vec3B.crossVectors(_vec3A, this.camera.up).normalize();

        if (this.keys['KeyW'] || this.keys['ArrowUp']) {
          this.camera.position.addScaledVector(_vec3A, panSpeed);
          this.controls.target.addScaledVector(_vec3A, panSpeed);
          this.camTransition = null;
        }
        if (this.keys['KeyS'] || this.keys['ArrowDown']) {
          this.camera.position.addScaledVector(_vec3A, -panSpeed);
          this.controls.target.addScaledVector(_vec3A, -panSpeed);
          this.camTransition = null;
        }
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) {
          this.camera.position.addScaledVector(_vec3B, -panSpeed);
          this.controls.target.addScaledVector(_vec3B, -panSpeed);
          this.camTransition = null;
        }
        if (this.keys['KeyD'] || this.keys['ArrowRight']) {
          this.camera.position.addScaledVector(_vec3B, panSpeed);
          this.controls.target.addScaledVector(_vec3B, panSpeed);
          this.camTransition = null;
        }

        // Smooth camera preset damping
        if (this.camTransition) {
          this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.camTransition.pos.x, 4.5, dt);
          this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, this.camTransition.pos.y, 4.5, dt);
          this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, this.camTransition.pos.z, 4.5, dt);
          this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, this.camTransition.target.x, 4.5, dt);
          this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, this.camTransition.target.y, 4.5, dt);
          this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, this.camTransition.target.z, 4.5, dt);
          if (this.camera.position.distanceTo(this.camTransition.pos) < 0.35) {
            this.camTransition = null;
          }
        }
      }

      this.controls.update();
      this.terrain.update(dt);
      this.traffic.update(dt, this.atmosphere.daylight);
      this.plots.update(dt);
      this.smoke.update(dt);

      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    this.frameId = requestAnimationFrame(tick);
  }
}
