import * as THREE from 'three';

export class AtmosphereSystem {
  constructor(scene, isSoftwareGl) {
    this.scene = scene;
    this.isSoftwareGl = isSoftwareGl;
    this.currentHour = 10;
    this.targetHour = 10;
    this.weather = 'clear';
    this.elapsed = 0;
    this.daylight = 1.0;

    this.fog = new THREE.FogExp2(0x162235, 0.0019);
    scene.fog = this.fog;
    scene.background = new THREE.Color(0x162235);

    // Atmospheric Gradient Sky Dome + Procedural Drifting Clouds + Stars
    this.skyUniforms = {
      topColor: { value: new THREE.Color(0x1d4e89) },
      bottomColor: { value: new THREE.Color(0x88b4dc) },
      sunDir: { value: new THREE.Vector3(0.5, 0.5, 0.3).normalize() },
      sunColor: { value: new THREE.Color(0xfff1d6) },
      starOpacity: { value: 0.0 },
      cloudCoverage: { value: 0.32 },
      time: { value: 0.0 },
    };
    const skyGeo = new THREE.SphereGeometry(540, 28, 18);
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
          for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p *= 2.04;
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
          vec3 col = mix(bottomColor, topColor, pow(h, 0.65));

          float sunAmt = max(dot(dir, sunDir), 0.0);
          col += sunColor * pow(sunAmt, 20.0) * 0.42;
          col += sunColor * pow(sunAmt, 240.0) * 1.3;

          if (starOpacity > 0.01 && dir.y > 0.05) {
            float s = starHash(floor(dir * 270.0));
            if (s > 0.9965) col += vec3(0.85, 0.92, 1.0) * starOpacity;
          }

          if (dir.y > 0.03) {
            vec2 uv = dir.xz / (dir.y + 0.18) * 1.45 + vec2(time * 0.012, time * 0.006);
            float c = fbm(uv);
            float mask = smoothstep(1.0 - cloudCoverage, 1.0 - cloudCoverage + 0.28, c);
            vec3 cloudCol = mix(bottomColor * 1.08, vec3(0.96, 0.97, 1.0), clamp(sunDir.y * 1.4 + 0.2, 0.18, 0.95));
            col = mix(col, cloudCol, mask * smoothstep(0.03, 0.22, dir.y) * 0.72);
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    scene.add(this.skyDome);

    // Warm/Cool Contrast Lighting Rig (<= 3 shadow casters)
    this.hemiLight = new THREE.HemisphereLight(0xa5d8ff, 0x1e293b, 0.85);
    scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff1d6, 2.05);
    this.sunLight.position.set(95, 130, 75);
    if (!isSoftwareGl) {
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.width = 2048;
      this.sunLight.shadow.mapSize.height = 2048;
      const d = 128;
      this.sunLight.shadow.camera.left = -d;
      this.sunLight.shadow.camera.right = d;
      this.sunLight.shadow.camera.top = d;
      this.sunLight.shadow.camera.bottom = -d;
      this.sunLight.shadow.camera.near = 10;
      this.sunLight.shadow.camera.far = 360;
      this.sunLight.shadow.bias = -0.0005;
      this.sunLight.shadow.normalBias = 0.02;
    }
    scene.add(this.sunLight);

    this.rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.55);
    this.rimLight.position.set(-95, 55, -85);
    scene.add(this.rimLight);

    // Rain particle system
    this.rainCount = isSoftwareGl ? 600 : 1800;
    const rainGeo = new THREE.BufferGeometry();
    this.rainPos = new Float32Array(this.rainCount * 3);
    for (let i = 0; i < this.rainCount; i++) {
      this.rainPos[i * 3] = (Math.random() - 0.5) * 240;
      this.rainPos[i * 3 + 1] = Math.random() * 80;
      this.rainPos[i * 3 + 2] = (Math.random() - 0.5) * 240;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0xbae6fd,
      size: 0.42,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
    });
    this.rainPoints = new THREE.Points(rainGeo, rainMat);
    this.rainPoints.visible = false;
    scene.add(this.rainPoints);

    this._skyCol = new THREE.Color();
    this._topCol = new THREE.Color();
    this._dayHorizon = new THREE.Color(0x88b4dc);
    this._dayZenith = new THREE.Color(0x1d4e89);
    this._sunsetHorizon = new THREE.Color(0xd97745);
    this._sunsetZenith = new THREE.Color(0x2d2448);
    this._nightHorizon = new THREE.Color(0x0c1526);
    this._nightZenith = new THREE.Color(0x04070f);
    this._overcastCol = new THREE.Color(0x475569);
  }

  setTargetState(gameHour, weather) {
    this.targetHour = ((gameHour % 24) + 24) % 24;
    this.weather = weather || 'clear';
  }

  update(dt, streetLampBulbs, windowMaterials, waterBump, roadMaterials = []) {
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

    this.sunLight.position.set(Math.cos(sunAngle) * 130, Math.max(18, elev * 135 + 24), 65);
    this.skyUniforms.sunDir.value.copy(this.sunLight.position).normalize();

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

    let fogDensity = 0.0017;
    let weatherDim = 1.0;
    let cloudCov = 0.28;
    let roadWet = 0.0;

    if (this.weather === 'overcast') {
      this._skyCol.lerp(this._overcastCol, 0.55);
      this._topCol.lerp(this._overcastCol, 0.55);
      fogDensity = 0.0028;
      weatherDim = 0.74;
      cloudCov = 0.75;
    } else if (this.weather === 'rain') {
      this._skyCol.lerp(this._overcastCol, 0.72);
      this._topCol.lerp(this._overcastCol, 0.72);
      fogDensity = 0.0038;
      weatherDim = 0.6;
      cloudCov = 0.88;
      roadWet = 1.0;
    } else if (this.weather === 'fog') {
      this._skyCol.lerp(this._overcastCol, 0.6);
      this._topCol.lerp(this._overcastCol, 0.6);
      fogDensity = 0.0062;
      weatherDim = 0.76;
      cloudCov = 0.55;
    }

    this.skyUniforms.cloudCoverage.value = THREE.MathUtils.lerp(this.skyUniforms.cloudCoverage.value, cloudCov, Math.min(1, dt * 1.5));
    this.skyUniforms.bottomColor.value.copy(this._skyCol);
    this.skyUniforms.topColor.value.copy(this._topCol);
    this.skyUniforms.starOpacity.value = Math.max(0, 1 - daylight * 3.5) * (this.weather === 'clear' ? 0.9 : 0.1);
    this.scene.background.copy(this._skyCol);
    this.fog.color.copy(this._skyCol);
    this.fog.density = THREE.MathUtils.lerp(this.fog.density, fogDensity, Math.min(1, dt * 2));

    this.sunLight.intensity = THREE.MathUtils.lerp(0.28, 2.1, daylight) * weatherDim;
    this.sunLight.color.setHex(daylight < 0.35 ? 0xfdba74 : 0xfff7e6);
    this.hemiLight.intensity = THREE.MathUtils.lerp(0.35, 0.9, daylight) * weatherDim;

    // Wet asphalt reflection sheen during rain
    for (const rMat of roadMaterials) {
      rMat.roughness = THREE.MathUtils.lerp(rMat.roughness, roadWet > 0.5 ? 0.18 : 0.82, Math.min(1, dt * 1.5));
      rMat.metalness = THREE.MathUtils.lerp(rMat.metalness, roadWet > 0.5 ? 0.45 : 0.06, Math.min(1, dt * 1.5));
    }

    const nightGlow = 1.0 - daylight;
    for (const mat of streetLampBulbs) {
      mat.emissiveIntensity = 0.25 + nightGlow * 2.6;
    }
    for (const mat of windowMaterials) {
      mat.emissiveIntensity = 0.18 + nightGlow * 1.45;
    }

    if (waterBump) {
      waterBump.offset.x = (waterBump.offset.x + dt * 0.03) % 1;
      waterBump.offset.y = (waterBump.offset.y + dt * 0.018) % 1;
    }

    this.rainPoints.visible = this.weather === 'rain';
    if (this.rainPoints.visible) {
      const arr = this.rainPoints.geometry.attributes.position.array;
      for (let i = 0; i < this.rainCount; i++) {
        arr[i * 3 + 1] -= dt * 42;
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3 + 1] = 75 + Math.random() * 10;
        }
      }
      this.rainPoints.geometry.attributes.position.needsUpdate = true;
    }
  }
}
