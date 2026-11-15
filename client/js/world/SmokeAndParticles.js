import * as THREE from 'three';

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _camQuat = new THREE.Quaternion();
const _rollQuat = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);

function makeAlphaBillboardMat(map, options = {}) {
  const mat = new THREE.MeshBasicMaterial({
    map: map || null,
    color: options.color ?? 0xffffff,
    transparent: true,
    opacity: options.opacity ?? 1.0,
    depthWrite: false,
    blending: options.blending ?? THREE.NormalBlending,
    side: options.side ?? THREE.FrontSide,
  });

  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute float aAlpha;\nvarying float vAlpha;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n  vAlpha = aAlpha;`
    );
    shader.fragmentShader = `varying float vAlpha;\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>\n  diffuseColor.a *= vAlpha;`
    );
  };
  return mat;
}

export class SmokeAndParticles {
  constructor(scene, textures = null, isSoftwareGl = false) {
    this.isSoftwareGl = isSoftwareGl;
    this.emitters = [];
    this.constructionSites = [];
    this.elapsed = 0;

    // 1. Volumetric Camera-Facing Smoke / Contrail / Spray Plumes
    this.maxPuffs = isSoftwareGl ? 110 : 240;
    const puffGeo = new THREE.PlaneGeometry(1, 1);
    this.puffAlphas = new Float32Array(this.maxPuffs);
    puffGeo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(this.puffAlphas, 1));

    this.puffMesh = new THREE.InstancedMesh(
      puffGeo,
      makeAlphaBillboardMat(textures?.smokePuffMap, { opacity: 0.72 }),
      this.maxPuffs
    );
    this.puffMesh.frustumCulled = false;
    this.puffMesh.renderOrder = 3;
    _color.setHex(0xdce4ee);
    for (let i = 0; i < this.maxPuffs; i++) {
      this.puffMesh.setColorAt(i, _color);
    }
    this.puffMesh.instanceColor.needsUpdate = true;
    scene.add(this.puffMesh);

    this.puffs = Array.from({ length: this.maxPuffs }, () => ({
      active: false,
      x: 0,
      y: -100,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      age: 0,
      life: 3.5,
      startScale: 0.8,
      endScale: 3.2,
      maxAlpha: 0.55,
      roll: Math.random() * Math.PI * 2,
      rollSpeed: (Math.random() - 0.5) * 0.7,
    }));
    this.puffCursor = 0;

    // 2. Incandescent Construction Welding Sparks (Additive HDR Embers)
    this.maxSparks = isSoftwareGl ? 36 : 96;
    const sparkGeo = new THREE.PlaneGeometry(0.32, 0.32);
    this.sparkAlphas = new Float32Array(this.maxSparks);
    sparkGeo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(this.sparkAlphas, 1));

    this.sparkMesh = new THREE.InstancedMesh(
      sparkGeo,
      makeAlphaBillboardMat(textures?.sparkMap, {
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
      }),
      this.maxSparks
    );
    this.sparkMesh.frustumCulled = false;
    this.sparkMesh.renderOrder = 4;
    _color.setHex(0xfb923c);
    for (let i = 0; i < this.maxSparks; i++) {
      this.sparkMesh.setColorAt(i, _color);
    }
    this.sparkMesh.instanceColor.needsUpdate = true;
    scene.add(this.sparkMesh);

    this.sparks = Array.from({ length: this.maxSparks }, () => ({
      active: false,
      x: 0,
      y: -100,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      age: 0,
      life: 0.75,
      baseScale: 1.0,
    }));
    this.sparkCursor = 0;

    // 3. Ocean Ship & Tugboat Bow / Stern Wake Foam Rings
    this.maxWakes = isSoftwareGl ? 36 : 84;
    const wakeGeo = new THREE.PlaneGeometry(1, 1);
    wakeGeo.rotateX(-Math.PI / 2);
    this.wakeAlphas = new Float32Array(this.maxWakes);
    wakeGeo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(this.wakeAlphas, 1));

    this.wakeMesh = new THREE.InstancedMesh(
      wakeGeo,
      makeAlphaBillboardMat(textures?.splashRingMap, {
        color: 0xe0f2fe,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
      }),
      this.maxWakes
    );
    this.wakeMesh.frustumCulled = false;
    this.wakeMesh.renderOrder = 2;
    scene.add(this.wakeMesh);

    this.wakes = Array.from({ length: this.maxWakes }, () => ({
      active: false,
      x: 0,
      y: -0.37,
      z: 0,
      vx: 0,
      vz: 0,
      age: 0,
      life: 2.8,
      startScale: 2.2,
      endScale: 8.5,
      maxAlpha: 0.52,
    }));
    this.wakeCursor = 0;

    this._smokeTimer = 0;
    this._contrailTimer = 0;
    this._wakeTimer = 0;
    this._sparkTimer = 0;
    this._sprayTimer = 0;
    this._movingCarsTmp = [];
  }

  setEmitters(positions, constructionSites = []) {
    this.emitters = positions || [];
    this.constructionSites = constructionSites || [];
  }

  _spawnPuff(x, y, z, vx, vy, vz, life, startScale, endScale, maxAlpha, hexColor) {
    const idx = this.puffCursor;
    this.puffCursor = (this.puffCursor + 1) % this.maxPuffs;
    const p = this.puffs[idx];
    p.active = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.age = 0;
    p.life = life;
    p.startScale = startScale;
    p.endScale = endScale;
    p.maxAlpha = maxAlpha;
    p.roll = Math.random() * Math.PI * 2;
    p.rollSpeed = (Math.random() - 0.5) * 0.8;
    _color.setHex(hexColor);
    this.puffMesh.setColorAt(idx, _color);
    if (this.puffMesh.instanceColor) this.puffMesh.instanceColor.needsUpdate = true;
  }

  _spawnSpark(x, y, z, vx, vy, vz, life, scale, hexColor) {
    const idx = this.sparkCursor;
    this.sparkCursor = (this.sparkCursor + 1) % this.maxSparks;
    const s = this.sparks[idx];
    s.active = true;
    s.x = x;
    s.y = y;
    s.z = z;
    s.vx = vx;
    s.vy = vy;
    s.vz = vz;
    s.age = 0;
    s.life = life;
    s.baseScale = scale;
    _color.setHex(hexColor);
    this.sparkMesh.setColorAt(idx, _color);
    if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;
  }

  _spawnWake(x, z, vx, vz, life, startScale, endScale, maxAlpha) {
    const idx = this.wakeCursor;
    this.wakeCursor = (this.wakeCursor + 1) % this.maxWakes;
    const w = this.wakes[idx];
    w.active = true;
    w.x = x;
    w.y = -0.37;
    w.z = z;
    w.vx = vx;
    w.vz = vz;
    w.age = 0;
    w.life = life;
    w.startScale = startScale;
    w.endScale = endScale;
    w.maxAlpha = maxAlpha;
  }

  update(dt, camera = null, traffic = null, weather = 'clear') {
    this.elapsed += dt;

    // A. Building Chimney / Cooling Tower Plumes + Ship Funnel Plume
    this._smokeTimer += dt;
    if (this._smokeTimer >= 0.18) {
      this._smokeTimer = 0;
      for (const em of this.emitters) {
        this._spawnPuff(
          em.x + (Math.random() - 0.5) * 0.25,
          em.y,
          em.z + (Math.random() - 0.5) * 0.25,
          0.95 + (Math.random() - 0.5) * 0.45,
          2.25 + Math.random() * 0.65,
          0.35 + (Math.random() - 0.5) * 0.45,
          3.4 + Math.random() * 1.1,
          0.95,
          4.1,
          0.62,
          0xdce4ee
        );
      }
      if (traffic?.effectEmitters) {
        const fn = traffic.effectEmitters.shipFunnel;
        this._spawnPuff(
          fn.x,
          fn.y,
          fn.z,
          -traffic.effectEmitters.shipDir * 0.8 + 0.55,
          1.9,
          0.25 + (Math.random() - 0.5) * 0.3,
          2.6,
          0.9,
          3.6,
          0.45,
          0x94a3b8
        );
      }
    }

    // B. Jetliner Twin-Engine High-Altitude Condensation Trails
    this._contrailTimer += dt;
    if (traffic?.effectEmitters && this._contrailTimer >= 0.09) {
      this._contrailTimer = 0;
      const eL = traffic.effectEmitters.planeEngineL;
      const eR = traffic.effectEmitters.planeEngineR;
      this._spawnPuff(eL.x, eL.y, eL.z, 0.2, 0.08, 0.1, 2.2, 0.55, 2.55, 0.36, 0xf8fafc);
      this._spawnPuff(eR.x, eR.y, eR.z, 0.2, 0.08, 0.1, 2.2, 0.55, 2.55, 0.36, 0xf8fafc);
    }

    // C. Ocean Ship & Tugboat Kelvin V-Wake Bow Ripples + Prop-Wash Stern Foam
    this._wakeTimer += dt;
    if (traffic?.effectEmitters && this._wakeTimer >= 0.22) {
      this._wakeTimer = 0;
      const { shipPos, shipDir, tugPos, tugDir } = traffic.effectEmitters;
      this._spawnWake(shipPos.x + shipDir * 16.5, shipPos.z - 2.2, -shipDir * 0.35, -1.25, 2.8, 2.4, 8.6, 0.52);
      this._spawnWake(shipPos.x + shipDir * 16.5, shipPos.z + 2.2, -shipDir * 0.35, 1.25, 2.8, 2.4, 8.6, 0.52);
      this._spawnWake(shipPos.x - shipDir * 16.2, shipPos.z, -shipDir * 1.4, 0, 3.2, 3.2, 10.6, 0.56);
      this._spawnWake(tugPos.x + tugDir * 4.2, tugPos.z - 1.1, -tugDir * 0.25, -0.85, 2.0, 1.4, 5.2, 0.46);
      this._spawnWake(tugPos.x + tugDir * 4.2, tugPos.z + 1.1, -tugDir * 0.25, 0.85, 2.0, 1.4, 5.2, 0.46);
      this._spawnWake(tugPos.x - tugDir * 4.4, tugPos.z, -tugDir * 1.1, 0, 2.3, 1.8, 6.0, 0.50);
    }

    // D. Active Construction Welding Spark Showers & Site Dust Puffs
    this._sparkTimer += dt;
    if (this.constructionSites.length > 0 && this._sparkTimer >= 0.07) {
      this._sparkTimer = 0;
      for (const site of this.constructionSites) {
        if (Math.random() < 0.72) {
          const sx = site.x + (Math.random() - 0.5) * 4.2;
          const sy = site.y + Math.random() * 2.4;
          const sz = site.z + (Math.random() - 0.5) * 4.2;
          const count = this.isSoftwareGl ? 1 : 3;
          for (let k = 0; k < count; k++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 2.2 + Math.random() * 3.8;
            this._spawnSpark(
              sx,
              sy,
              sz,
              Math.cos(ang) * spd,
              2.4 + Math.random() * 3.4,
              Math.sin(ang) * spd,
              0.55 + Math.random() * 0.35,
              0.8 + Math.random() * 0.7,
              k === 0 ? 0xfff7cc : 0xfb923c
            );
          }
          if (Math.random() < 0.18) {
            this._spawnPuff(sx, 0.65, sz, (Math.random() - 0.5) * 0.8, 0.9, (Math.random() - 0.5) * 0.8, 1.9, 0.9, 2.6, 0.30, 0xcbd5e1);
          }
        }
      }
    }

    // E. Wet-Asphalt Tire Spray Plumes During Rainstorms
    this._sprayTimer += dt;
    if (weather === 'rain' && traffic && this._sprayTimer >= 0.14) {
      this._sprayTimer = 0;
      const cars = traffic.getMovingVehicleSpots(this._movingCarsTmp);
      const step = this.isSoftwareGl ? 6 : 3;
      for (let i = 0; i < cars.length; i += step) {
        const c = cars[i];
        const backX = c.axis === 'x' ? -c.dir * 1.6 : 0;
        const backZ = c.axis === 'z' ? -c.dir * 1.6 : 0;
        this._spawnPuff(
          c.x + backX,
          0.32,
          c.z + backZ,
          backX * 0.7,
          0.55,
          backZ * 0.7,
          0.65,
          0.65,
          1.65,
          0.26,
          0xdbeafe
        );
      }
    }

    if (camera) {
      _camQuat.copy(camera.quaternion);
    } else {
      _camQuat.identity();
    }

    // Update Volumetric Smoke / Vapor Puffs
    const windX = Math.sin(this.elapsed * 0.45) * 0.35 + 0.55;
    for (let i = 0; i < this.maxPuffs; i++) {
      const p = this.puffs[i];
      if (!p.active) {
        this.puffAlphas[i] = 0;
        _dummy.position.set(0, -120, 0);
        _dummy.scale.set(0.001, 0.001, 0.001);
        _dummy.updateMatrix();
        this.puffMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        this.puffAlphas[i] = 0;
        continue;
      }

      const t = p.age / p.life;
      p.x += (p.vx + windX * t) * dt;
      p.y += p.vy * (1.0 - t * 0.25) * dt;
      p.z += p.vz * dt;
      p.roll += p.rollSpeed * dt;

      const fadeIn = Math.min(1, t / 0.16);
      const fadeOut = Math.pow(Math.max(0, 1 - (t - 0.16) / 0.84), 1.35);
      this.puffAlphas[i] = p.maxAlpha * fadeIn * fadeOut;

      const s = THREE.MathUtils.lerp(p.startScale, p.endScale, Math.pow(t, 0.78));
      _dummy.position.set(p.x, p.y, p.z);
      _rollQuat.setFromAxisAngle(_zAxis, p.roll);
      _dummy.quaternion.copy(_camQuat).multiply(_rollQuat);
      _dummy.scale.set(s, s, 1);
      _dummy.updateMatrix();
      this.puffMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.puffMesh.instanceMatrix.needsUpdate = true;
    this.puffMesh.geometry.attributes.aAlpha.needsUpdate = true;

    // Update Welding Sparks
    for (let i = 0; i < this.maxSparks; i++) {
      const s = this.sparks[i];
      if (!s.active) {
        this.sparkAlphas[i] = 0;
        _dummy.position.set(0, -120, 0);
        _dummy.scale.set(0.001, 0.001, 0.001);
        _dummy.updateMatrix();
        this.sparkMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      s.age += dt;
      if (s.age >= s.life) {
        s.active = false;
        this.sparkAlphas[i] = 0;
        continue;
      }

      s.vy -= 14.5 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (s.y < 0.28 && s.vy < 0) {
        s.y = 0.28;
        s.vy = -s.vy * 0.38;
        s.vx *= 0.65;
        s.vz *= 0.65;
      }

      const t = s.age / s.life;
      this.sparkAlphas[i] = Math.max(0, 1.0 - Math.pow(t, 1.4));
      const sc = s.baseScale * (1.15 - t * 0.55);
      _dummy.position.set(s.x, s.y, s.z);
      _dummy.quaternion.copy(_camQuat);
      _dummy.scale.set(sc, sc, 1);
      _dummy.updateMatrix();
      this.sparkMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    this.sparkMesh.geometry.attributes.aAlpha.needsUpdate = true;

    // Update Ocean Wake Foam Rings
    for (let i = 0; i < this.maxWakes; i++) {
      const w = this.wakes[i];
      if (!w.active) {
        this.wakeAlphas[i] = 0;
        _dummy.position.set(0, -120, 0);
        _dummy.scale.set(0.001, 0.001, 0.001);
        _dummy.updateMatrix();
        this.wakeMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      w.age += dt;
      if (w.age >= w.life) {
        w.active = false;
        this.wakeAlphas[i] = 0;
        continue;
      }

      const t = w.age / w.life;
      w.x += w.vx * dt;
      w.z += w.vz * dt;

      const fadeIn = Math.min(1, t / 0.12);
      const fadeOut = Math.max(0, 1.0 - t);
      this.wakeAlphas[i] = w.maxAlpha * fadeIn * fadeOut;

      const sc = THREE.MathUtils.lerp(w.startScale, w.endScale, Math.pow(t, 0.72));
      _dummy.position.set(w.x, w.y, w.z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(sc, 1, sc * 0.78);
      _dummy.updateMatrix();
      this.wakeMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.wakeMesh.instanceMatrix.needsUpdate = true;
    this.wakeMesh.geometry.attributes.aAlpha.needsUpdate = true;
  }
}
