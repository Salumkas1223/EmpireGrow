import * as THREE from 'three';

const _dummy = new THREE.Object3D();
const _camPos = new THREE.Vector3();

export class AtmosphereSystem {
  constructor(scene, isSoftwareGl, textures = null, streetLampCoords = []) {
    this.scene = scene;
    this.isSoftwareGl = isSoftwareGl;
    this.textures = textures;
    this.streetLampCoords = streetLampCoords;
    this.currentHour = 10;
    this.targetHour = 10;
    this.weather = 'clear';
    this.elapsed = 0;
    this.daylight = 1.0;

    this.fog = new THREE.FogExp2(0x162235, 0.00118);
    scene.fog = this.fog;
    scene.background = new THREE.Color(0x162235);

    // 1. Physically Inspired Rayleigh/Mie Atmospheric Sky + Silver-Lined Lit Clouds + Moon/Stars + Lightning
    this.skyUniforms = {
      topColor: { value: new THREE.Color(0x1a4882) },
      bottomColor: { value: new THREE.Color(0x8bb6df) },
      sunDir: { value: new THREE.Vector3(0.5, 0.5, 0.3).normalize() },
      sunColor: { value: new THREE.Color(0xfff1d6) },
      starOpacity: { value: 0.0 },
      cloudCoverage: { value: 0.30 },
      cloudDarkness: { value: 0.0 },
      lightning: { value: 0.0 },
      time: { value: 0.0 },
    };

    const skyGeo = new THREE.SphereGeometry(780, 36, 22);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform vec3 sunDir;
        uniform vec3 sunColor;
        uniform float starOpacity;
        uniform float cloudCoverage;
        uniform float cloudDarkness;
        uniform float lightning;
        uniform float time;
        varying vec3 vWorldPos;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
          for (int i = 0; i < 5; i++) {
            v += a * noise(p);
            p = rot * p * 2.03;
            a *= 0.5;
          }
          return v;
        }
        float starHash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        void main() {
          vec3 dir = normalize(vWorldPos);
          float h = clamp(dir.y * 1.15, 0.0, 1.0);
          vec3 col = mix(bottomColor, topColor, pow(h, 0.62));

          // Atmospheric horizon Mie scattering + warm crepuscular coastal glow toward sun azimuth
          float sunDot = max(dot(dir, sunDir), 0.0);
          float horizonBand = exp(-max(dir.y, 0.0) * 6.0);
          col += sunColor * pow(sunDot, 2.8) * horizonBand * 0.34 * (1.0 - cloudDarkness * 0.65);

          // Crisp Sun Disc + Soft Corona (attenuated by overcast/rain)
          float clearFactor = 1.0 - cloudDarkness * 0.85;
          col += sunColor * pow(sunDot, 16.0) * 0.38 * clearFactor;
          col += sunColor * pow(sunDot, 180.0) * 1.25 * clearFactor;
          float sunDisc = smoothstep(0.9991, 0.9996, dot(dir, sunDir));
          col += sunColor * sunDisc * 2.8 * clearFactor;

          // Subtle Lunar Disc at Night
          vec3 moonDir = normalize(vec3(-sunDir.x, max(0.18, -sunDir.y + 0.35), -sunDir.z));
          float moonDisc = smoothstep(0.99935, 0.99965, dot(dir, moonDir));
          col += vec3(0.76, 0.86, 1.0) * moonDisc * starOpacity * 1.15;
          col += vec3(0.35, 0.48, 0.72) * pow(max(dot(dir, moonDir), 0.0), 48.0) * starOpacity * 0.25;

          // Twinkling Stars in Night Sky
          if (starOpacity > 0.01 && dir.y > 0.04) {
            vec3 starCell = floor(dir * 290.0);
            float s = starHash(starCell);
            if (s > 0.9962) {
              float twink = 0.65 + 0.35 * sin(time * (1.8 + fract(s * 73.0) * 2.5) + s * 100.0);
              col += vec3(0.86, 0.92, 1.0) * starOpacity * twink * smoothstep(0.04, 0.22, dir.y);
            }
          }

          // High-altitude feathery Cirrus cloud streaks + lower Cumulus deck with sunward silver lining
          if (dir.y > 0.02) {
            vec2 cirrusUv = dir.xz / (dir.y + 0.22) * vec2(0.85, 2.2) + vec2(time * 0.008, time * 0.003);
            float cirrusNoise = fbm(cirrusUv * 1.7 + vec2(fbm(cirrusUv * 0.9) * 1.4, 0.0));
            float cirrusMask = smoothstep(0.56, 0.82, cirrusNoise) * smoothstep(0.04, 0.28, dir.y) * (1.0 - cloudDarkness * 0.6);
            vec3 cirrusCol = mix(vec3(0.92, 0.96, 1.0), sunColor, 0.32) * clamp(sunDir.y * 1.4 + 0.28, 0.16, 1.0);
            col = mix(col, cirrusCol, cirrusMask * 0.32);

            vec2 uv = dir.xz / (dir.y + 0.16) * 1.35 + vec2(time * 0.014, time * 0.007);
            float c1 = fbm(uv);
            float c2 = fbm(uv * 1.85 + vec2(-time * 0.009, time * 0.005));
            float density = c1 * 0.68 + c2 * 0.32;
            float thresh = 1.0 - cloudCoverage;
            float mask = smoothstep(thresh, thresh + 0.25, density);

            // Directional shadow sample toward sun for 3D cloud thickness
            vec2 sunOffset = normalize(sunDir.xz + vec2(0.001, 0.001)) * 0.10;
            float cLit = fbm(uv + sunOffset);
            float selfShadow = clamp(0.56 + (density - cLit) * 2.5, 0.24, 1.0);

            vec3 brightTop = mix(vec3(0.98, 0.985, 1.0), sunColor, 0.26) * clamp(sunDir.y * 1.35 + 0.26, 0.14, 1.0);
            vec3 shadowBase = mix(bottomColor * 0.72, vec3(0.24, 0.30, 0.38), cloudDarkness * 0.75);
            vec3 cloudCol = mix(shadowBase, brightTop, selfShadow);
            // Silver-lining rim highlight near sun
            cloudCol += sunColor * pow(sunDot, 12.0) * (1.0 - mask * 0.45) * 0.56 * clearFactor;
            // Distant storm lightning sheet illumination inside clouds
            cloudCol += vec3(0.68, 0.82, 1.0) * lightning * (0.45 + mask * 0.9);

            float horizonFade = smoothstep(0.02, 0.22, dir.y);
            col = mix(col, cloudCol, mask * horizonFade * 0.85);
          }

          // Atmospheric horizon mist blend
          col = mix(col, bottomColor * (1.0 + lightning * 0.35), exp(-max(dir.y, 0.0) * 12.0) * 0.50);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    scene.add(this.skyDome);

    // 2. Warm/Cool Contrast Lighting Rig + Storm Lightning Flash Fill
    this.hemiLight = new THREE.HemisphereLight(0xa5d8ff, 0x4b5c47, 0.92);
    scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff5e4, 2.65);
    this.sunLight.position.set(95, 130, 75);
    this.shadowHalfSpan = 148;
    if (!isSoftwareGl) {
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.width = 2048;
      this.sunLight.shadow.mapSize.height = 2048;
      const d = this.shadowHalfSpan;
      this.sunLight.shadow.camera.left = -d;
      this.sunLight.shadow.camera.right = d;
      this.sunLight.shadow.camera.top = d;
      this.sunLight.shadow.camera.bottom = -d;
      this.sunLight.shadow.camera.near = 10;
      this.sunLight.shadow.camera.far = 420;
      this.sunLight.shadow.bias = -0.00035;
      this.sunLight.shadow.normalBias = 0.018;
      this.sunLight.shadow.radius = 2.4;
    }
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    this.rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.62);
    this.rimLight.position.set(-95, 55, -85);
    scene.add(this.rimLight);

    this.lightningTimer = 6.5;
    this.lightningIntensity = 0;

    // 3. Instanced Wind-Slanted Volumetric Rain Streaks (Replacing square Points)
    this.rainCount = isSoftwareGl ? 360 : 1200;
    const streakGeo = new THREE.PlaneGeometry(0.065, 2.15);
    const streakMat = new THREE.MeshBasicMaterial({
      map: textures?.rainStreakMap || null,
      color: 0xdbeafe,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.rainMesh = new THREE.InstancedMesh(streakGeo, streakMat, this.rainCount);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    this.rainDrops = Array.from({ length: this.rainCount }, () => ({
      x: (Math.random() - 0.5) * 268,
      y: Math.random() * 72,
      z: (Math.random() - 0.5) * 268,
      speed: 48 + Math.random() * 18,
      lenScale: 0.78 + Math.random() * 0.55,
    }));
    scene.add(this.rainMesh);

    // 4. Instanced Ground & Asphalt Rain Splash Impact Ripples
    this.splashCount = isSoftwareGl ? 45 : 140;
    const splashGeo = new THREE.PlaneGeometry(0.92, 0.92);
    splashGeo.rotateX(-Math.PI / 2);
    const splashMat = new THREE.MeshBasicMaterial({
      map: textures?.splashRingMap || null,
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.splashMesh = new THREE.InstancedMesh(splashGeo, splashMat, this.splashCount);
    this.splashMesh.frustumCulled = false;
    this.splashMesh.visible = false;
    this.splashes = Array.from({ length: this.splashCount }, (_, i) => ({
      x: (Math.random() - 0.5) * 256,
      z: (Math.random() - 0.5) * 256,
      y: 0.062,
      age: (i / this.splashCount) * 0.36,
      life: 0.30 + (i % 5) * 0.04,
    }));
    scene.add(this.splashMesh);

    // 5. Night Streetlamp Optical Glow Halos + Asphalt Light Pools (Zero extra PointLights)
    this.lampHalos = null;
    this.lampPools = null;
    if (streetLampCoords && streetLampCoords.length > 0 && textures?.lightHaloMap) {
      const haloGeo = new THREE.PlaneGeometry(2.8, 2.8);
      this.lampHaloMat = new THREE.MeshBasicMaterial({
        map: textures.lightHaloMap,
        color: 0xffd27d,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.lampHalos = new THREE.InstancedMesh(haloGeo, this.lampHaloMat, streetLampCoords.length);
      this.lampHalos.frustumCulled = false;
      this.lampHalos.visible = false;

      const poolGeo = new THREE.PlaneGeometry(7.4, 7.4);
      poolGeo.rotateX(-Math.PI / 2);
      this.lampPoolMat = new THREE.MeshBasicMaterial({
        map: textures.lightHaloMap,
        color: 0xfde68a,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.lampPools = new THREE.InstancedMesh(poolGeo, this.lampPoolMat, streetLampCoords.length);
      this.lampPools.frustumCulled = false;
      this.lampPools.visible = false;

      streetLampCoords.forEach(([lx, , lz], idx) => {
        _dummy.position.set(lx, 0.052, lz);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        this.lampPools.setMatrixAt(idx, _dummy.matrix);
      });
      this.lampPools.instanceMatrix.needsUpdate = true;
      scene.add(this.lampHalos, this.lampPools);
    }

    this._skyCol = new THREE.Color();
    this._topCol = new THREE.Color();
    this._waterCol = new THREE.Color();
    this._groundBounceDay = new THREE.Color(0x52654c);
    this._groundBounceSunset = new THREE.Color(0x543a2e);
    this._groundBounceNight = new THREE.Color(0x131c2c);
    this._dayHorizon = new THREE.Color(0xa6d2f7);
    this._dayZenith = new THREE.Color(0x124794);
    this._sunsetHorizon = new THREE.Color(0xec7e44);
    this._sunsetZenith = new THREE.Color(0x251e49);
    this._nightHorizon = new THREE.Color(0x0c172b);
    this._nightZenith = new THREE.Color(0x030711);
    this._overcastCol = new THREE.Color(0x526072);
    this._waterDay = new THREE.Color(0x053a54);
    this._waterSunset = new THREE.Color(0x093044);
    this._waterNight = new THREE.Color(0x021120);
    this._waterStorm = new THREE.Color(0x162d3b);
  }

  setTargetState(gameHour, weather) {
    this.targetHour = ((gameHour % 24) + 24) % 24;
    this.weather = weather || 'clear';
  }

  update(dt, streetLampBulbs, windowMaterials, waterBump, roadMaterials = [], camera = null, oceanUniforms = null, focusTarget = null) {
    this.elapsed += dt;
    this.skyUniforms.time.value = this.elapsed;

    let diff = this.targetHour - this.currentHour;
    if (diff > 12) diff -= 24;
    if (diff < -12) diff += 24;
    this.currentHour = (this.currentHour + diff * Math.min(1, dt * 1.8) + 24) % 24;

    const h = this.currentHour;
    const sunAngle = ((h - 6) / 24) * Math.PI * 2;
    const elev = Math.sin(sunAngle);
    const daylight = THREE.MathUtils.clamp((elev + 0.18) / 0.85, 0, 1);
    this.daylight = daylight;

    // Texel-snapped shadow frustum following camera focus target so 2048x2048 shadows stay razor-sharp across the entire 6x6 city
    const texelStep = (this.shadowHalfSpan * 2) / 2048;
    const tx = focusTarget ? Math.round(THREE.MathUtils.clamp(focusTarget.x, -100, 100) / texelStep) * texelStep : 0;
    const tz = focusTarget ? Math.round(THREE.MathUtils.clamp(focusTarget.z, -100, 100) / texelStep) * texelStep : 0;
    this.sunLight.target.position.set(tx, 0, tz);
    this.sunLight.position.set(tx + Math.cos(sunAngle) * 150, Math.max(22, elev * 155 + 26), tz + 78);
    this.skyUniforms.sunDir.value.set(Math.cos(sunAngle) * 150, Math.max(22, elev * 155 + 26), 78).normalize();

    if (daylight > 0.45) {
      const k = (daylight - 0.45) / 0.55;
      this._skyCol.copy(this._sunsetHorizon).lerp(this._dayHorizon, k);
      this._topCol.copy(this._sunsetZenith).lerp(this._dayZenith, k);
    } else if (daylight > 0.08) {
      const k = (daylight - 0.08) / 0.37;
      this._skyCol.copy(this._nightHorizon).lerp(this._sunsetHorizon, k);
      this._topCol.copy(this._nightZenith).lerp(this._sunsetZenith, k);
    } else {
      this._skyCol.copy(this._nightHorizon);
      this._topCol.copy(this._nightZenith);
    }

    let fogDensity = 0.00088;
    let weatherDim = 1.0;
    let cloudCov = 0.30;
    let cloudDark = 0.0;
    let roadWet = 0.0;

    if (this.weather === 'overcast') {
      this._skyCol.lerp(this._overcastCol, 0.55);
      this._topCol.lerp(this._overcastCol, 0.55);
      fogDensity = 0.0026;
      weatherDim = 0.75;
      cloudCov = 0.76;
      cloudDark = 0.55;
    } else if (this.weather === 'rain') {
      this._skyCol.lerp(this._overcastCol, 0.74);
      this._topCol.lerp(this._overcastCol, 0.74);
      fogDensity = 0.0036;
      weatherDim = 0.62;
      cloudCov = 0.90;
      cloudDark = 0.88;
      roadWet = 1.0;
    } else if (this.weather === 'fog') {
      this._skyCol.lerp(this._overcastCol, 0.62);
      this._topCol.lerp(this._overcastCol, 0.62);
      fogDensity = 0.0062;
      weatherDim = 0.76;
      cloudCov = 0.56;
      cloudDark = 0.45;
    }

    // Subtle Distant Storm Lightning in Rainstorms
    if (this.weather === 'rain' && !this.isSoftwareGl) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningIntensity = 1.0;
        this.lightningTimer = 7.5 + Math.random() * 11.0;
      }
    }
    this.lightningIntensity = Math.max(0, this.lightningIntensity - dt * 4.8);
    const flicker = this.lightningIntensity > 0.1
      ? this.lightningIntensity * (0.55 + 0.45 * Math.sin(this.elapsed * 55))
      : 0;

    this.skyUniforms.cloudCoverage.value = THREE.MathUtils.lerp(this.skyUniforms.cloudCoverage.value, cloudCov, Math.min(1, dt * 1.5));
    this.skyUniforms.cloudDarkness.value = THREE.MathUtils.lerp(this.skyUniforms.cloudDarkness.value, cloudDark, Math.min(1, dt * 1.5));
    this.skyUniforms.lightning.value = flicker;
    this.skyUniforms.bottomColor.value.copy(this._skyCol);
    this.skyUniforms.topColor.value.copy(this._topCol);
    this.skyUniforms.starOpacity.value = Math.max(0, 1 - daylight * 3.5) * (this.weather === 'clear' ? 0.92 : 0.08);
    this.scene.background.copy(this._skyCol);
    this.fog.color.copy(this._skyCol);
    this.fog.density = THREE.MathUtils.lerp(this.fog.density, fogDensity, Math.min(1, dt * 2));

    this.sunLight.intensity = THREE.MathUtils.lerp(0.32, 2.75, daylight) * weatherDim + flicker * 0.95;
    if (flicker > 0.25) {
      this.sunLight.color.setHex(0xdbeafe);
    } else if (daylight < 0.16) {
      this.sunLight.color.setHex(0x93c5fd);
    } else if (daylight < 0.52) {
      this.sunLight.color.setHex(0xfdba74);
    } else {
      this.sunLight.color.setHex(0xfff8eb);
    }
    this.hemiLight.color.copy(this._skyCol).lerp(this._topCol, 0.35);
    if (daylight > 0.45) {
      this.hemiLight.groundColor.copy(this._groundBounceSunset).lerp(this._groundBounceDay, (daylight - 0.45) / 0.55);
    } else {
      this.hemiLight.groundColor.copy(this._groundBounceNight).lerp(this._groundBounceSunset, daylight / 0.45);
    }
    this.hemiLight.intensity = THREE.MathUtils.lerp(0.38, 1.02, daylight) * weatherDim + flicker * 0.42;
    this.rimLight.intensity = THREE.MathUtils.lerp(0.34, 0.72, daylight) * weatherDim;
    this.rimLight.color.setHex(daylight < 0.45 ? 0x60a5fa : 0x93c5fd);

    // Dynamic IBL environment reflection strength (bright coastal sky mirror by day, moody deep glow at night)
    this.scene.environmentIntensity = THREE.MathUtils.lerp(0.32, 1.15, daylight) * (0.72 + 0.28 * weatherDim);

    // Sync ultra-realistic Water shader uniforms with sun, sky dome, storm chop & live camera eye
    if (oceanUniforms) {
      if (daylight > 0.45) {
        this._waterCol.copy(this._waterSunset).lerp(this._waterDay, (daylight - 0.45) / 0.55);
      } else {
        this._waterCol.copy(this._waterNight).lerp(this._waterSunset, daylight / 0.45);
      }
      if (this.weather === 'rain' || this.weather === 'overcast') {
        this._waterCol.lerp(this._waterStorm, 0.52);
      }
      oceanUniforms.sunDirection.value.copy(this.skyUniforms.sunDir.value);
      oceanUniforms.sunColor.value.copy(this.sunLight.color);
      oceanUniforms.waterColor.value.copy(this._waterCol);
      oceanUniforms.uSkyTop.value.copy(this._topCol);
      oceanUniforms.uSkyBottom.value.copy(this._skyCol);
      oceanUniforms.uDaylight.value = daylight;
      oceanUniforms.uRainChop.value = THREE.MathUtils.lerp(oceanUniforms.uRainChop.value, this.weather === 'rain' ? 1.0 : 0.0, Math.min(1, dt * 1.4));
      if (camera) {
        camera.getWorldPosition(_camPos);
        oceanUniforms.eye.value.copy(_camPos);
      }
    }

    // Wet mirror-sheen asphalt puddle reflections during rain (modulated by roadRoughMap)
    for (const rMat of roadMaterials) {
      rMat.roughness = THREE.MathUtils.lerp(rMat.roughness, roadWet > 0.5 ? 0.28 : 0.86, Math.min(1, dt * 1.5));
      rMat.metalness = THREE.MathUtils.lerp(rMat.metalness, roadWet > 0.5 ? 0.42 : 0.05, Math.min(1, dt * 1.5));
    }

    const nightGlow = Math.max(0, 1.0 - daylight);
    for (const mat of streetLampBulbs) {
      mat.emissiveIntensity = 0.25 + nightGlow * 2.8;
    }
    for (const mat of windowMaterials) {
      mat.emissiveIntensity = 0.18 + nightGlow * 1.5;
    }

    // Volumetric Streetlight Night Halos & Ground Pools
    if (this.lampHalos && this.lampPools) {
      const showHalos = nightGlow > 0.12;
      this.lampHalos.visible = showHalos;
      this.lampPools.visible = showHalos;
      if (showHalos) {
        this.lampHaloMat.opacity = nightGlow * 0.58;
        this.lampPoolMat.opacity = nightGlow * (roadWet > 0.5 ? 0.26 : 0.14);
        if (camera) {
          camera.getWorldPosition(_camPos);
          for (let i = 0; i < this.streetLampCoords.length; i++) {
            const [lx, ly, lz] = this.streetLampCoords[i];
            _dummy.position.set(lx, ly - 0.08, lz);
            _dummy.lookAt(_camPos);
            _dummy.scale.set(1, 1, 1);
            _dummy.updateMatrix();
            this.lampHalos.setMatrixAt(i, _dummy.matrix);
          }
          this.lampHalos.instanceMatrix.needsUpdate = true;
        }
      }
    }

    if (waterBump) {
      waterBump.offset.x = (waterBump.offset.x + dt * 0.035) % 1;
      waterBump.offset.y = (waterBump.offset.y + dt * 0.022) % 1;
    }

    // Wind-slanted Rain Streaks + Expanding Ground Splash Ripples
    const isRaining = this.weather === 'rain';
    this.rainMesh.visible = isRaining;
    this.splashMesh.visible = isRaining;

    if (isRaining) {
      const camYaw = camera ? Math.atan2(camera.position.x, camera.position.z) : 0;
      for (let i = 0; i < this.rainCount; i++) {
        const d = this.rainDrops[i];
        d.y -= d.speed * dt;
        d.x += 5.5 * dt;
        if (d.y < 0.2) {
          d.y = 64 + Math.random() * 14;
          d.x = (Math.random() - 0.5) * 268;
          d.z = (Math.random() - 0.5) * 268;
        }
        _dummy.position.set(d.x, d.y, d.z);
        _dummy.rotation.set(0, camYaw, -0.11);
        _dummy.scale.set(1, d.lenScale, 1);
        _dummy.updateMatrix();
        this.rainMesh.setMatrixAt(i, _dummy.matrix);
      }
      this.rainMesh.instanceMatrix.needsUpdate = true;

      for (let i = 0; i < this.splashCount; i++) {
        const s = this.splashes[i];
        s.age += dt;
        if (s.age >= s.life) {
          s.age = 0;
          s.x = (Math.random() - 0.5) * 256;
          s.z = (Math.random() - 0.5) * 256;
          s.y = (s.z > 156 && s.x < 48) ? -0.41 : 0.062;
        }
        const t = s.age / s.life;
        const ringScale = 0.25 + t * 1.15;
        _dummy.position.set(s.x, s.y, s.z);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(ringScale, 1, ringScale);
        _dummy.updateMatrix();
        this.splashMesh.setMatrixAt(i, _dummy.matrix);
      }
      this.splashMesh.instanceMatrix.needsUpdate = true;
    }
  }
}
