import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

function createOutdoorEnvironmentTexture(renderer) {
  const envScene = new THREE.Scene();

  // High-resolution 1024x512 equirectangular sky-to-earth dome so glass, water & car paint reflect crisp clouds + azure sky
  const envCanvas = document.createElement('canvas');
  envCanvas.width = 1024;
  envCanvas.height = 512;
  const ctx = envCanvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.00, '#0a357d'); // Deep zenith cobalt sky
  grad.addColorStop(0.24, '#1d5fb0'); // Mid azure sky
  grad.addColorStop(0.45, '#86c8ff'); // Bright coastal sky
  grad.addColorStop(0.495, '#eef7ff'); // Luminous horizon haze
  grad.addColorStop(0.525, '#6d8364'); // Warm sunlit coastal greenery bounce
  grad.addColorStop(0.70, '#36493d'); // Earth foliage bounce
  grad.addColorStop(1.00, '#18222e'); // Deep ground nadir
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  // Soft sunlit cumulus reflection wisps across upper sky dome
  for (let i = 0; i < 68; i++) {
    const cx = (i * 173) % 1024;
    const cy = 58 + ((i * 89) % 162);
    const rx = 44 + (i % 6) * 22;
    const ry = 12 + (i % 4) * 7;
    const cg = ctx.createRadialGradient(cx, cy, 4, cx, cy, rx);
    cg.addColorStop(0, 'rgba(255, 255, 255, 0.50)');
    cg.addColorStop(0.55, 'rgba(224, 242, 254, 0.22)');
    cg.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const skyTex = new THREE.CanvasTexture(envCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(50, 36, 22),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })
  );
  envScene.add(dome);

  // True HDR Solar Disc + Soft Key Corona (> 1.0 RGB) for crisp metallic/glass specular glints
  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(4.4, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(8.5, 7.2, 5.2) })
  );
  sunDisc.position.set(24, 30, 18);
  envScene.add(sunDisc);

  const sunHalo = new THREE.Mesh(
    new THREE.SphereGeometry(11.0, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 1.5), transparent: true, opacity: 0.44 })
  );
  sunHalo.position.copy(sunDisc.position);
  envScene.add(sunHalo);

  // Cool azure sky fill bounce lobe on opposite side
  const skyFill = new THREE.Mesh(
    new THREE.SphereGeometry(15, 14, 10),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 1.40, 2.05), transparent: true, opacity: 0.36 })
  );
  skyFill.position.set(-28, 18, -22);
  envScene.add(skyFill);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envTex = pmrem.fromScene(envScene, 0.015).texture;
  skyTex.dispose();
  dome.geometry.dispose();
  dome.material.dispose();
  sunDisc.geometry.dispose();
  sunDisc.material.dispose();
  sunHalo.geometry.dispose();
  sunHalo.material.dispose();
  skyFill.geometry.dispose();
  skyFill.material.dispose();
  pmrem.dispose();
  return envTex;
}

const CinematicGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.13 },
    uWarmth: { value: 0.048 },
    uContrast: { value: 1.065 },
    uVibrance: { value: 0.20 },
    uClarity: { value: 0.25 },
    uTexelSize: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uWarmth;
    uniform float uContrast;
    uniform float uVibrance;
    uniform float uClarity;
    uniform vec2 uTexelSize;
    varying vec2 vUv;

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 col = max(tex.rgb, vec3(0.0));

      // Subtle 4-tap micro-contrast clarity sharpen for crisp facade mullions & foliage
      vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, uTexelSize.y)).rgb;
      vec3 s = texture2D(tDiffuse, vUv - vec2(0.0, uTexelSize.y)).rgb;
      vec3 e = texture2D(tDiffuse, vUv + vec2(uTexelSize.x, 0.0)).rgb;
      vec3 w = texture2D(tDiffuse, vUv - vec2(uTexelSize.x, 0.0)).rgb;
      vec3 blur = (n + s + e + w) * 0.25;
      float detail = dot(col - blur, vec3(0.2126, 0.7152, 0.0722));
      col = max(col + detail * uClarity * clamp(1.2 - dot(col, vec3(0.333)), 0.15, 1.0), vec3(0.0));

      // Preserve HDR highlights (> 1.0) for ACES OutputPass while grading mid/shadow tonal curve
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 midShadow = min(col, vec3(1.0));
      vec3 hdrExcess = max(col - vec3(1.0), vec3(0.0));

      // Gentle photographic S-curve micro-contrast on LDR range
      midShadow = clamp((midShadow - 0.5) * uContrast + 0.5, 0.0, 1.0);

      // Filmic natural vibrance (lifts muted midtones without oversaturating already vivid colors)
      float maxC = max(midShadow.r, max(midShadow.g, midShadow.b));
      float minC = min(midShadow.r, min(midShadow.g, midShadow.b));
      float sat = maxC - minC;
      float vibAmt = (1.0 - smoothstep(0.15, 0.85, sat)) * uVibrance;
      midShadow = mix(vec3(dot(midShadow, vec3(0.2126, 0.7152, 0.0722))), midShadow, 1.0 + vibAmt);

      // Warm sunlit highlights + crisp sapphire shadow depth
      vec3 coolShadow = vec3(0.95, 0.98, 1.04);
      vec3 warmHigh = vec3(1.0 + uWarmth, 1.0 + uWarmth * 0.45, 1.0 - uWarmth * 0.65);
      midShadow *= mix(coolShadow, warmHigh, smoothstep(0.08, 0.78, luma));

      col = max(midShadow, vec3(0.0)) + hdrExcess;

      // Subtle optical lens vignette
      vec2 centered = vUv - 0.5;
      float dist = dot(centered, centered);
      col *= 1.0 - dist * uVignette;

      gl_FragColor = vec4(col, tex.a);
    }
  `,
};
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

    // Renderer (AgX Filmic preserves saturated skies, golds, emerald greens & neon lights without hue clipping)
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.12;
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

    // Scene & Procedural Outdoor HDR Sky/Sun Environment Reflection on all devices
    this.scene = new THREE.Scene();
    this.scene.environment = createOutdoorEnvironmentTexture(this.renderer);

    // Camera & OrbitControls (scenic 3/4 coastal overview framing city, waterfront marina, lighthouse & mountains)
    const aspect = (mountEl.clientWidth || window.innerWidth) / Math.max(1, mountEl.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.5, 1300);
    this.camera.position.set(92, 46, 146);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.minDistance = 16;
    this.controls.maxDistance = 320;
    this.controls.target.set(-10, 2, 18);

    // Smooth camera preset transition state
    this.camTransition = null;
    this.controls.addEventListener('start', () => {
      this.camTransition = null; // User manual control immediately cancels preset glide
    });

    // Build World Subsystems
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);
    this.terrain = buildTerrainAndRoads(this.scene, this.textures, this.isSoftwareGl);
    this.atmosphere = new AtmosphereSystem(this.scene, this.isSoftwareGl, this.textures, this.terrain.streetLampCoords);
    this.traffic = new TrafficSystem(this.scene, this.terrain, this.textures);
    this.smoke = new SmokeAndParticles(this.scene, this.textures, this.isSoftwareGl);
    this.plots = new PlotSystem(this.scene, this.textures);
    this._windowMaterials = [...this.terrain.ambientWindowMaterials];

    // Hardware-only Selective HDR Bloom + Micro-Clarity Post-Processing
    this.composer = null;
    this.bloomPass = null;
    if (!this.isSoftwareGl) {
      try {
        const w = mountEl.clientWidth || window.innerWidth;
        const h = mountEl.clientHeight || window.innerHeight;
        const rt = new THREE.WebGLRenderTarget(w, h, {
          type: THREE.HalfFloatType,
          samples: 4,
        });
        this.composer = new EffectComposer(this.renderer, rt);
        this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.composer.setSize(w, h);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.48, 0.94);
        this.composer.addPass(this.bloomPass);
        this.gradePass = new ShaderPass(CinematicGradeShader);
        this.gradePass.uniforms.uTexelSize.value.set(1 / Math.max(1, w), 1 / Math.max(1, h));
        this.composer.addPass(this.gradePass);
        this.composer.addPass(new OutputPass());
      } catch {
        this.composer = null;
      }
    }

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
      const hitPlot =
        hits.length > 0
          ? (hits[0].object.userData.plotIds?.[hits[0].instanceId] ?? hits[0].object.userData.plotId ?? null)
          : null;
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
        const plotId = hits[0].object.userData.plotIds?.[hits[0].instanceId] ?? hits[0].object.userData.plotId;
        if (plotId) store.selectPlot(plotId);
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
      if (this.composer) {
        this.composer.setSize(w, h);
      }
      if (this.bloomPass) {
        this.bloomPass.resolution.set(w, h);
      }
      if (this.gradePass) {
        this.gradePass.uniforms.uTexelSize.value.set(1 / Math.max(1, w), 1 / Math.max(1, h));
      }
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
      overview: { pos: new THREE.Vector3(122, 92, 136), target: new THREE.Vector3(-6, 0, -6) },
      downtown: { pos: new THREE.Vector3(36, 42, 52), target: new THREE.Vector3(-8, 4, -14) },
      harbor: { pos: new THREE.Vector3(-32, 34, 198), target: new THREE.Vector3(-75, 2, 142) },
      airport: { pos: new THREE.Vector3(198, 42, 48), target: new THREE.Vector3(154, 3, -10) },
      industrial: { pos: new THREE.Vector3(-124, 40, -118), target: new THREE.Vector3(-78, 2, -62) },
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

    const { smokePositions, constructionSites } = this.plots.syncState(
      viewSource.ownedPlots,
      viewSource.buildings,
      store.selectedPlotId,
      this.hoveredPlotId
    );
    this.smoke.setEmitters(smokePositions, constructionSites);
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
      this.atmosphere.update(
        dt,
        this.terrain.streetLampBulbs,
        this._windowMaterials,
        this.textures.waterBump,
        this.terrain.roadMaterials,
        this.camera,
        this.terrain.oceanUniforms,
        this.controls.target
      );

      // Title screen cinematic low coastal skyline glide (bay, marina yachts, lighthouse, palm promenade & mountains)
      if (store.phase === 'title') {
        const angle = now * 0.00011 + 0.55;
        const elevation = 30 + Math.sin(now * 0.00023) * 5;
        this.camera.position.set(Math.cos(angle) * 144, elevation, 42 + Math.sin(angle) * 136);
        this.controls.target.set(-14, 6, 48);
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
      this.smoke.update(dt, this.camera, this.traffic, weather);

      // Dynamic photographic exposure & subtle warmth shift from noon -> golden hour -> night
      const dl = this.atmosphere.daylight;
      this.renderer.toneMappingExposure = THREE.MathUtils.lerp(1.16, 1.07, dl);
      if (this.gradePass) {
        const goldenMask = Math.exp(-Math.pow((dl - 0.36) / 0.24, 2));
        this.gradePass.uniforms.uWarmth.value = 0.035 + goldenMask * 0.055;
      }

      if (this.composer) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }

      if (this.isSoftwareGl) {
        afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    this.frameId = requestAnimationFrame(tick);
  }
}
