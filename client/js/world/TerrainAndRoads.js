import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Water } from 'three/addons/objects/Water.js';

function mergeTexturedParts(parts) {
  const cleaned = parts.map((g) => {
    if (g.index && !g.attributes.normal) g.computeVertexNormals();
    const ng = g.index ? g.toNonIndexed() : g.clone();
    for (const key of Object.keys(ng.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv') {
        ng.deleteAttribute(key);
      }
    }
    return ng;
  });
  const merged = mergeGeometries(cleaned, false);
  cleaned.forEach((g) => g.dispose());
  return merged;
}

function perturbGeo(geo, amp = 0.22, freq = 2.6, seed = 1.0) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n =
      Math.sin(x * freq + seed) * Math.cos(y * (freq * 1.1) - seed * 0.7) * Math.sin(z * freq + seed * 1.3);
    const scale = 1 + n * amp;
    pos.setXYZ(i, x * scale, y * (1 + n * amp * 0.65), z * scale);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Continuous procedural world heightfield:
 * - City basin [-139..139, -139..139], harbor quay, and airstrip are graded flat at y = 0.
 * - South-West bay slopes organically through sandy beaches below sea level (-0.45m).
 * - North, East & West countryside rise into layered rolling hills & mountain ridges.
 */
export function groundHeightAt(x, z) {
  // Distance outside flat urban grid
  const dxCity = Math.max(0, Math.abs(x) - 139);
  const dzCity = Math.max(0, Math.abs(z) - 139);
  const cityDist = Math.hypot(dxCity, dzCity);

  // Keep coastal airstrip apron flat at (x in 136..186, z in -132..114)
  const dxAir = Math.max(0, Math.max(136 - x, x - 186));
  const dzAir = Math.max(0, Math.max(-132 - z, z - 114));
  const airDist = Math.hypot(dxAir, dzAir);

  // Keep harbor quay stone apron flat at (x in -156..6, z in 136..158)
  const dxQuay = Math.max(0, Math.max(-156 - x, x - 6));
  const dzQuay = Math.max(0, Math.max(136 - z, z - 158));
  const quayDist = Math.hypot(dxQuay, dzQuay);

  const flatMask = smoothstep(0, 18, Math.min(cityDist, airDist, quayDist));

  // South / South-West ocean bay & marina basin depression
  const seaBlendZ = smoothstep(138, 174, z);
  const seaBlendX = 1.0 - smoothstep(64, 128, x);
  const seaMask = seaBlendZ * seaBlendX;

  // Multi-octave organic FBM ridge height
  const h1 = Math.sin(x * 0.015 + 0.5) * Math.cos(z * 0.013 - 0.3) * 15.0;
  const h2 = Math.sin(x * 0.032 - z * 0.025 + 1.2) * 7.2;
  const h3 = Math.cos(x * 0.072 + z * 0.060) * 2.5;
  const ridge = Math.abs(Math.sin(x * 0.010 - z * 0.008)) * 24.0;

  const distFromCenter = Math.hypot(x * 0.85, z);
  const outerLift = smoothstep(148, 360, distFromCenter) * (11.0 + ridge);

  const rawLand = Math.max(0.2, h1 + h2 + h3 + outerLift);
  const mountainH = rawLand * flatMask;
  const seaDepth = -4.2 * seaMask;

  // Coastal headland hills on far east & far north override sea mask smoothly
  return mountainH * (1.0 - seaMask * 0.92) + seaDepth;
}

function createRealisticOakGeometries() {
  const rootFlare = new THREE.CylinderGeometry(0.24, 0.46, 0.78, 9);
  rootFlare.translate(0, 0.38, 0);

  const lowerTrunk = new THREE.CylinderGeometry(0.18, 0.26, 1.55, 9);
  lowerTrunk.translate(0, 1.4, 0);

  const upperTrunk = new THREE.CylinderGeometry(0.12, 0.19, 1.2, 8);
  upperTrunk.rotateZ(0.08);
  upperTrunk.translate(-0.04, 2.55, 0);

  const branchSpecs = [
    { rx: 0.55, rz: 0.42, len: 1.45, x: -0.35, y: 2.65, z: 0.32 },
    { rx: -0.52, rz: -0.45, len: 1.50, x: 0.36, y: 2.75, z: -0.30 },
    { rx: 0.44, rz: -0.56, len: 1.38, x: 0.38, y: 2.55, z: 0.28 },
    { rx: -0.42, rz: 0.50, len: 1.40, x: -0.34, y: 2.85, z: -0.28 },
    { rx: 0.12, rz: -0.18, len: 1.25, x: 0.10, y: 3.15, z: 0.06 },
  ];
  const branches = branchSpecs.map((b) => {
    const g = new THREE.CylinderGeometry(0.055, 0.115, b.len, 7);
    g.rotateX(b.rx);
    g.rotateZ(b.rz);
    g.translate(b.x, b.y, b.z);
    return g;
  });

  const trunkGeo = mergeTexturedParts([rootFlare, lowerTrunk, upperTrunk, ...branches]);

  const lobeSpecs = [
    [0.0, 3.85, 0.0, 1.18, 0.92],
    [-0.95, 3.20, 0.65, 0.94, 0.85],
    [0.98, 3.30, -0.62, 0.96, 0.86],
    [0.88, 3.05, 0.72, 0.90, 0.82],
    [-0.86, 3.45, -0.68, 0.92, 0.88],
    [0.05, 3.45, 1.05, 0.84, 0.84],
    [-0.10, 3.38, -1.02, 0.86, 0.82],
    [1.18, 2.85, 0.05, 0.78, 0.78],
    [-1.16, 2.90, -0.05, 0.80, 0.76],
    [0.42, 4.15, 0.35, 0.84, 0.76],
    [-0.45, 4.10, -0.30, 0.80, 0.75],
    [0.45, 2.75, 0.88, 0.70, 0.70],
    [-0.48, 2.78, -0.82, 0.72, 0.72],
    [0.0, 4.45, 0.0, 0.76, 0.68],
  ];
  const lobes = lobeSpecs.map(([lx, ly, lz, r, sy], idx) => {
    const g = new THREE.IcosahedronGeometry(r, 2);
    g.scale(1.0, sy, 1.0);
    perturbGeo(g, 0.25, 2.9, idx * 1.9 + 0.5);
    g.translate(lx, ly, lz);
    return g;
  });

  const canopyGeo = mergeTexturedParts(lobes);
  return { trunkGeo, canopyGeo };
}

function createRealisticPineGeometries() {
  const trunk = new THREE.CylinderGeometry(0.11, 0.30, 3.6, 8);
  trunk.translate(0, 1.8, 0);

  const tiers = [
    { y: 2.00, r: 1.56, h: 1.50, seed: 1.1 },
    { y: 2.82, r: 1.34, h: 1.38, seed: 2.3 },
    { y: 3.62, r: 1.08, h: 1.28, seed: 3.7 },
    { y: 4.38, r: 0.82, h: 1.16, seed: 4.9 },
    { y: 5.08, r: 0.50, h: 1.06, seed: 6.1 },
  ];
  const boughs = tiers.map((t) => {
    const c = new THREE.ConeGeometry(t.r, t.h, 11, 2);
    perturbGeo(c, 0.23, 3.4, t.seed);
    c.translate(0, t.y, 0);
    return c;
  });

  return { trunkGeo: trunk, canopyGeo: mergeTexturedParts(boughs) };
}

function createBushGeometry() {
  const parts = [
    [0, 0.42, 0, 0.62],
    [-0.38, 0.34, 0.24, 0.45],
    [0.36, 0.36, -0.22, 0.46],
    [0.14, 0.52, 0.32, 0.40],
  ].map(([x, y, z, r], i) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    perturbGeo(g, 0.24, 3.2, i * 2.1);
    g.scale(1.15, 0.82, 1.15);
    g.translate(x, y, z);
    return g;
  });
  return mergeTexturedParts(parts);
}

export function buildTerrainAndRoads(scene, textures, isSoftwareGl = false) {
  const worldGroup = new THREE.Group();
  const streetLampBulbs = [];
  const ambientWindowMaterials = [];
  const roadMaterials = [];
  const windUniforms = { uTime: { value: 0 } };
  const oceanUniforms = { uTime: { value: 0 } };

  const applyWindShader = (mat, strength = 0.08) => {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windUniforms.uTime;
      shader.vertexShader = `uniform float uTime;\n` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        float swayHeight = max(0.0, transformed.y - 1.6);
        transformed.x += sin(uTime * 1.4 + transformed.z * 0.7 + transformed.y * 0.5) * ${strength.toFixed(3)} * swayHeight;
        transformed.z += cos(uTime * 1.1 + transformed.x * 0.6) * ${(strength * 0.65).toFixed(3)} * swayHeight;
        `
      );
    };
  };

  // 1. Unified Continuous Sculpted Heightmap Terrain (1280x1280m, 240x240 grid) with Vertex-Color Biomes
  const terrainGeo = new THREE.PlaneGeometry(1280, 1280, 240, 240);
  terrainGeo.rotateX(-Math.PI / 2);
  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const tmpCol = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = groundHeightAt(x, z);
    posAttr.setY(i, y);

    // Local slope estimate for granite cliff exposure
    const hx = groundHeightAt(x + 2.5, z);
    const hz = groundHeightAt(x, z + 2.5);
    const slope = Math.hypot(hx - y, hz - y) / 2.5;

    // Biome vertex coloring: golden sandy coast -> urban meadow -> alpine forest -> granite ridge -> snow cap
    const isCoast = z > 135 && x < 126;
    if (y < 0.85 && isCoast) {
      // Wet-to-dry warm golden Mediterranean beach sand
      const dry = smoothstep(-1.4, 0.85, y);
      tmpCol.setRGB(0.68 + dry * 0.25, 0.60 + dry * 0.23, 0.43 + dry * 0.14);
    } else if (y > 23.2 && slope < 0.50) {
      // Crisp sunlit alpine snow caps
      const snow = smoothstep(23.2, 28.5, y);
      const rockTone = 0.52;
      tmpCol.setRGB(
        rockTone + snow * 0.44,
        rockTone * 0.99 + snow * 0.46,
        rockTone * 0.98 + snow * 0.49
      );
    } else if (slope > 0.30 || y > 19.5) {
      // Exposed granite cliff rock & sunlit highland stone
      const rockTone = 0.46 + Math.min(0.24, (y - 12) * 0.008);
      tmpCol.setRGB(rockTone * 1.03, rockTone, rockTone * 0.95);
    } else {
      // Natural undulating emerald meadow & alpine forest palette
      const elev = Math.min(1, y / 22);
      const patch = Math.sin(x * 0.045) * Math.cos(z * 0.045) * 0.07;
      tmpCol.setRGB(
        0.50 - elev * 0.12 + patch,
        0.68 - elev * 0.11 + patch * 0.7,
        0.43 - elev * 0.09
      );
    }
    colors[i * 3] = tmpCol.r;
    colors[i * 3 + 1] = tmpCol.g;
    colors[i * 3 + 2] = tmpCol.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainGrassMap = textures.grassMap.clone();
  terrainGrassMap.needsUpdate = true;
  terrainGrassMap.repeat.set(64, 64);
  const terrainGrassBump = textures.grassBump.clone();
  terrainGrassBump.needsUpdate = true;
  terrainGrassBump.repeat.set(64, 64);

  const terrainMat = new THREE.MeshStandardMaterial({
    map: terrainGrassMap,
    bumpMap: terrainGrassBump,
    bumpScale: 0.18,
    vertexColors: true,
    roughness: 0.93,
    metalness: 0.02,
  });
  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = oceanUniforms.uTime;
    shader.vertexShader = `varying vec3 vTerrWorldPos;\nvarying vec3 vTerrNormal;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `
      #include <beginnormal_vertex>
      vTerrNormal = normalize(objectNormal);
      `
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `
      #include <worldpos_vertex>
      vTerrWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      `
    );
    shader.fragmentShader = `uniform float uTime;\nvarying vec3 vTerrWorldPos;\nvarying vec3 vTerrNormal;\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `
      #include <roughnessmap_fragment>
      float isShoreBand = smoothstep(134.0, 148.0, vTerrWorldPos.z) * (1.0 - smoothstep(72.0, 128.0, vTerrWorldPos.x));
      float wetSand = isShoreBand * (1.0 - smoothstep(-0.55, 0.38, vTerrWorldPos.y));
      float terrSlope = 1.0 - clamp(vTerrNormal.y, 0.0, 1.0);
      roughnessFactor = mix(roughnessFactor, 0.88, smoothstep(0.16, 0.42, terrSlope));
      roughnessFactor = mix(roughnessFactor, 0.16, wetSand);
      `
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      float tSlope = 1.0 - clamp(vTerrNormal.y, 0.0, 1.0);
      float shoreMask = smoothstep(134.0, 148.0, vTerrWorldPos.z) * (1.0 - smoothstep(72.0, 128.0, vTerrWorldPos.x));

      // 1. Macro meadow patch variation to eliminate repeating grass tile seams
      float macroA = sin(vTerrWorldPos.x * 0.031 + vTerrWorldPos.z * 0.019) * cos(vTerrWorldPos.z * 0.029 - vTerrWorldPos.x * 0.017);
      float macroB = sin(vTerrWorldPos.x * 0.082 - vTerrWorldPos.z * 0.071);
      diffuseColor.rgb *= 1.0 + (macroA * 0.11 + macroB * 0.05) * (1.0 - smoothstep(0.14, 0.38, tSlope));

      // 2. Stratified Granite & Limestone Cliff Texture on steep slopes
      float rockBlend = smoothstep(0.12, 0.34, tSlope);
      if (rockBlend > 0.01) {
        float strata = sin(vTerrWorldPos.y * 2.25 + sin(vTerrWorldPos.x * 0.09 + vTerrWorldPos.z * 0.08) * 1.4);
        float grain = sin(vTerrWorldPos.x * 1.4) * cos(vTerrWorldPos.z * 1.3);
        vec3 strataRock = mix(vec3(0.32, 0.34, 0.37), vec3(0.56, 0.54, 0.50), 0.5 + 0.5 * strata);
        strataRock += grain * 0.035;
        diffuseColor.rgb = mix(diffuseColor.rgb, strataRock, rockBlend * 0.72);
      }

      // 3. Wind-blown Golden Beach Sand Dunes & Wet Mirror Shoreline
      float sandMask = shoreMask * (1.0 - smoothstep(0.35, 1.15, vTerrWorldPos.y));
      if (sandMask > 0.01) {
        float sandRipple = sin(vTerrWorldPos.x * 1.45 + vTerrWorldPos.z * 0.55 + sin(vTerrWorldPos.x * 0.18)) * 0.045;
        vec3 drySand = vec3(0.84, 0.74, 0.54) + sandRipple;
        diffuseColor.rgb = mix(diffuseColor.rgb, drySand, sandMask * 0.65);
      }

      // 4. Wet shoreline darkening & shallow underwater solar caustics
      float wetZone = shoreMask * (1.0 - smoothstep(-0.6, 0.34, vTerrWorldPos.y));
      diffuseColor.rgb *= mix(1.0, 0.60, wetZone);
      float subZone = shoreMask * smoothstep(-0.35, -1.65, vTerrWorldPos.y);
      if (subZone > 0.01) {
        float c1 = sin(vTerrWorldPos.x * 0.85 + uTime * 1.9 + sin(vTerrWorldPos.z * 0.65 - uTime * 1.3));
        float c2 = cos(vTerrWorldPos.z * 0.92 - uTime * 1.6 + cos(vTerrWorldPos.x * 0.58 + uTime * 1.1));
        float caustic = pow(max(0.0, 0.5 + 0.5 * c1 * c2), 3.0);
        diffuseColor.rgb += vec3(0.20, 0.34, 0.36) * caustic * subZone * 0.60;
      }
      `
    );
  };
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  worldGroup.add(terrainMesh);

  // 2. Ultra-Realistic Ocean Bay (Real-Time Planar Reflection Water + 3D Gerstner Swells + Depth Absorption + Lacy Surf Foam)
  const fountainWaterNormal = textures.waterNormalMap.clone();
  fountainWaterNormal.needsUpdate = true;
  fountainWaterNormal.repeat.set(3, 3);
  const fountainWaterMat = new THREE.MeshPhysicalMaterial({
    color: 0x0e7490,
    normalMap: fountainWaterNormal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.04,
    metalness: 0.45,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
  });

  const oceanGeo = new THREE.PlaneGeometry(1280, 480, 140, 70);
  const ocean = new Water(oceanGeo, {
    textureWidth: isSoftwareGl ? 256 : 1024,
    textureHeight: isSoftwareGl ? 256 : 1024,
    waterNormals: textures.waterNormalMap,
    sunDirection: new THREE.Vector3(0.5, 0.6, 0.3).normalize(),
    sunColor: 0xfff5e0,
    waterColor: 0x052d44,
    distortionScale: 2.6,
    fog: true,
  });
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(-140, -0.45, 365);

  if (isSoftwareGl) {
    // Keep software WebGL fast by skipping duplicate full-scene planar mirror render while using analytic sky Fresnel
    ocean.onBeforeRender = () => {};
  }

  // Inject 3D Gerstner wave swells, Beer-Lambert depth tint, SSS crests & shoreline foam into Water shader
  ocean.material.uniforms.uSkyTop = { value: new THREE.Color(0x1a4882) };
  ocean.material.uniforms.uSkyBottom = { value: new THREE.Color(0x8bb6df) };
  ocean.material.uniforms.uShallowColor = { value: new THREE.Color(0x0ea5a4) };
  ocean.material.uniforms.uHasMirror = { value: isSoftwareGl ? 0.0 : 1.0 };
  ocean.material.uniforms.uRainChop = { value: 0.0 };
  ocean.material.uniforms.uDaylight = { value: 1.0 };
  ocean.material.uniforms.size.value = 1.65;

  ocean.material.vertexShader = /* glsl */ `
    uniform mat4 textureMatrix;
    uniform float time;
    uniform float uRainChop;

    varying vec4 mirrorCoord;
    varying vec4 worldPosition;
    varying vec3 vWaveNormal;
    varying float vCrest;
    varying float vCoastShallow;

    #include <common>
    #include <fog_pars_vertex>
    #include <shadowmap_pars_vertex>
    #include <logdepthbuf_pars_vertex>

    void addGerstner(vec2 xz, vec2 dir, float freq, float amp, float spd, inout vec3 disp, inout vec2 dH) {
      float phase = dot(dir, xz) * freq + time * spd;
      float s = sin(phase);
      float c = cos(phase);
      disp.x += dir.x * amp * 0.42 * c;
      disp.z += dir.y * amp * 0.42 * c;
      disp.y += amp * s;
      dH += dir * (amp * freq * c);
    }

    void main() {
      vec4 baseW = modelMatrix * vec4(position, 1.0);
      vec2 xz = baseW.xz;

      // Damping near harbor wall & shoreline so waves break softly instead of clipping concrete pier
      float harborQuayDist = max(0.0, xz.y - 155.5);
      float shoreMask = smoothstep(-2.0, 14.0, harborQuayDist);
      float swellScale = (0.35 + 0.65 * shoreMask) * (1.0 + uRainChop * 0.45);

      vec3 disp = vec3(0.0);
      vec2 dH = vec2(0.0);
      addGerstner(xz, normalize(vec2(0.32, 0.95)), 0.085, 0.14 * swellScale, 1.45, disp, dH);
      addGerstner(xz, normalize(vec2(-0.68, 0.73)), 0.145, 0.095 * swellScale, 1.85, disp, dH);
      addGerstner(xz, normalize(vec2(0.84, -0.54)), 0.240, 0.055 * swellScale, 2.35, disp, dH);
      addGerstner(xz, normalize(vec2(-0.22, -0.97)), 0.390, 0.028 * swellScale, 2.90, disp, dH);

      vWaveNormal = normalize(vec3(-dH.x, 1.0, -dH.y));
      vCrest = clamp((disp.y / max(0.001, 0.28 * swellScale)) * 0.5 + 0.5, 0.0, 1.0);

      // Estimate shallow coastal water near sandy bay & yacht marina cove (x in -32..120, z in 145..206) & harbor pier edge
      float beachZ = 1.0 - smoothstep(155.0, 206.0, xz.y);
      float beachX = smoothstep(-32.0, 10.0, xz.x) * (1.0 - smoothstep(68.0, 122.0, xz.x));
      float quayNear = (1.0 - smoothstep(155.5, 174.0, xz.y)) * smoothstep(-158.0, -120.0, xz.x) * (1.0 - smoothstep(-2.0, 16.0, xz.x));
      vCoastShallow = clamp(beachZ * (0.48 + 0.52 * beachX) + quayNear * 0.55, 0.0, 1.0);

      vec4 displacedWorld = baseW + vec4(disp, 0.0);
      worldPosition = displacedWorld;
      mirrorCoord = textureMatrix * displacedWorld;

      vec4 mvPosition = viewMatrix * displacedWorld;
      gl_Position = projectionMatrix * mvPosition;

      #include <beginnormal_vertex>
      #include <defaultnormal_vertex>
      #include <logdepthbuf_vertex>
      #include <fog_vertex>
      #include <shadowmap_vertex>
    }
  `;

  ocean.material.fragmentShader = /* glsl */ `
    uniform sampler2D mirrorSampler;
    uniform float alpha;
    uniform float time;
    uniform float size;
    uniform float distortionScale;
    uniform sampler2D normalSampler;
    uniform vec3 sunColor;
    uniform vec3 sunDirection;
    uniform vec3 eye;
    uniform vec3 waterColor;
    uniform vec3 uSkyTop;
    uniform vec3 uSkyBottom;
    uniform vec3 uShallowColor;
    uniform float uHasMirror;
    uniform float uRainChop;
    uniform float uDaylight;

    varying vec4 mirrorCoord;
    varying vec4 worldPosition;
    varying vec3 vWaveNormal;
    varying float vCrest;
    varying float vCoastShallow;

    vec4 getNoise(vec2 uv) {
      vec2 uv0 = (uv / 88.0) + vec2(time / 16.0, time / 25.0);
      vec2 uv1 = uv / 96.0 - vec2(time / -18.0, time / 29.0);
      vec2 uv2 = uv / vec2(430.0, 470.0) + vec2(time / 48.0, time / 53.0);
      vec2 uv3 = uv / vec2(27.0, 31.0) - vec2(time / 22.0, time / -19.0);
      vec4 noise = texture2D(normalSampler, uv0) * 0.34 +
        texture2D(normalSampler, uv1) * 0.30 +
        texture2D(normalSampler, uv2) * 0.22 +
        texture2D(normalSampler, uv3) * 0.14;
      return noise * 2.0 - 1.0;
    }

    float hash21(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float valueNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    float foamFbm(vec2 p) {
      float v = 0.0;
      float a = 0.55;
      for (int i = 0; i < 3; i++) {
        v += a * valueNoise(p);
        p = p * 2.15 + vec2(3.1, -1.7);
        a *= 0.5;
      }
      return v;
    }

    #include <common>
    #include <packing>
    #include <bsdfs>
    #include <fog_pars_fragment>
    #include <logdepthbuf_pars_fragment>
    #include <lights_pars_begin>
    #include <shadowmap_pars_fragment>
    #include <shadowmask_pars_fragment>

    void main() {
      #include <logdepthbuf_fragment>

      vec4 noise = getNoise(worldPosition.xz * size);
      float chopGain = 1.0 + uRainChop * 0.45;
      vec3 rippleNormal = normalize(vec3(noise.x * 1.15 * chopGain, 1.0, noise.y * 1.15 * chopGain));
      vec3 surfaceNormal = normalize(vec3(
        vWaveNormal.x * 0.65 + rippleNormal.x * 0.68,
        1.0,
        vWaveNormal.z * 0.65 + rippleNormal.z * 0.68
      ));

      vec3 worldToEye = eye - worldPosition.xyz;
      vec3 eyeDirection = normalize(worldToEye);
      float distToEye = length(worldToEye);

      // Planar real-time reflection OR crisp analytic atmospheric reflection fallback
      vec3 sunDirN = normalize(sunDirection);
      vec3 reflVec = reflect(-eyeDirection, surfaceNormal);
      float reflElev = clamp(abs(reflVec.y), 0.0, 1.0);
      vec3 skyRefl = mix(uSkyBottom, uSkyTop, pow(reflElev, 0.65));
      float skySun = max(dot(normalize(reflVec), sunDirN), 0.0);
      skyRefl += sunColor * (pow(skySun, 24.0) * 0.35 + pow(skySun, 220.0) * 1.1);

      vec3 reflectionSample = skyRefl;
      if (uHasMirror > 0.5) {
        vec2 reflUv = mirrorCoord.xy / max(0.001, mirrorCoord.w);
        vec2 distUv = surfaceNormal.xz * (0.012 + 0.38 / (distToEye + 14.0)) * (distortionScale * 0.42);
        vec2 clampedUv = clamp(reflUv + distUv, vec2(0.003), vec2(0.997));
        vec3 mirrorTex = texture2D(mirrorSampler, clampedUv).rgb;
        float distanceBlend = smoothstep(210.0, 420.0, distToEye);
        reflectionSample = mix(mirrorTex, skyRefl, distanceBlend * 0.55);
      }

      // Physical Schlick Fresnel (water IOR = 1.333 -> F0 = 0.02)
      float NoV = clamp(dot(eyeDirection, surfaceNormal), 0.0, 1.0);
      float fresnel = 0.02 + 0.98 * pow(1.0 - NoV, 5.0);

      // Beer-Lambert shallow turquoise coastal body -> deep pelagic indigo-teal
      vec3 deepBody = waterColor * (0.65 + 0.45 * max(dot(surfaceNormal, sunDirN), 0.0));
      vec3 shallowBody = mix(uShallowColor, uShallowColor * 1.35, 0.5 + 0.5 * vCrest) * (0.45 + 0.55 * uDaylight);
      vec3 bodyCol = mix(deepBody, shallowBody, vCoastShallow * 0.85);

      // Subtle underwater caustic shimmer in clear shallow coast
      if (vCoastShallow > 0.05) {
        float caust = foamFbm(worldPosition.xz * 0.42 + vec2(time * 0.35, -time * 0.25));
        bodyCol += vec3(0.06, 0.22, 0.24) * smoothstep(0.56, 0.86, caust) * vCoastShallow * uDaylight;
      }

      // Backlit Wave Crest Subsurface Scattering (emerald-cyan glow when looking toward low sun)
      float sssView = pow(clamp(dot(eyeDirection, -sunDirN), 0.0, 1.0), 3.0);
      bodyCol += vec3(0.04, 0.34, 0.36) * sssView * vCrest * (0.45 + 0.55 * uDaylight);

      // Dual-Stage Solar Specular: warm broad sheen + pinpoint diamond HDR sun glints
      vec3 halfVec = normalize(sunDirN + eyeDirection);
      float NoH = max(dot(surfaceNormal, halfVec), 0.0);
      vec3 broadSpec = sunColor * pow(NoH, 68.0) * 0.72;
      vec3 diamondGlint = sunColor * pow(NoH, 520.0) * 3.4;

      vec3 waterRgb = mix(bodyCol * getShadowMask(), reflectionSample, clamp(fresnel * 1.12, 0.02, 0.96));
      waterRgb += (broadSpec + diamondGlint) * getShadowMask();

      // Lacy Cellular Shoreline Wash-Up Foam + Harbor Quay Lapping Foam + Wave Crest Whitecaps
      float surfCycle = sin(worldPosition.z * 0.72 - time * 2.1 + sin(worldPosition.x * 0.15) * 1.8);
      float noiseFoam = foamFbm(worldPosition.xz * 0.55 + vec2(time * 0.16, -time * 0.22));
      float beachLine = smoothstep(172.0, 154.5, worldPosition.z) * smoothstep(-165.0, 118.0, worldPosition.x);
      float quayWall = (1.0 - smoothstep(155.6, 158.8, worldPosition.z)) * smoothstep(-155.0, -120.0, worldPosition.x) * (1.0 - smoothstep(-2.0, 12.0, worldPosition.x));
      float surfFoam = beachLine * smoothstep(0.18, 0.88, surfCycle * 0.55 + noiseFoam * 0.75) * 0.78;
      float quayFoam = quayWall * smoothstep(0.45, 0.85, noiseFoam + 0.22 * sin(time * 2.4 + worldPosition.x * 0.4)) * 0.65;
      float crestWhitecap = smoothstep(0.80, 0.98, vCrest * (0.68 + noiseFoam * 0.48)) * (0.18 + uRainChop * 0.32);

      float totalFoam = clamp(surfFoam + quayFoam + crestWhitecap, 0.0, 0.86);
      vec3 foamTint = mix(vec3(0.76, 0.84, 0.90), vec3(0.94, 0.98, 1.0), uDaylight) * (0.35 + 0.65 * max(0.35, sunDirN.y + 0.3));
      waterRgb = mix(waterRgb, foamTint, totalFoam);

      gl_FragColor = vec4(waterRgb, alpha);

      #include <fog_fragment>
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;

  worldGroup.add(ocean);

  const pierMat = new THREE.MeshStandardMaterial({
    map: textures.stoneMap,
    bumpMap: textures.sidewalkBump,
    bumpScale: 0.04,
    color: 0x64748b,
    roughness: 0.82,
    metalness: 0.10,
  });
  const quay = new THREE.Mesh(new THREE.BoxGeometry(156, 1.6, 16), pierMat);
  quay.position.set(-75, -0.1, 148);
  quay.receiveShadow = true;
  worldGroup.add(quay);

  // Wooden harbor dock pilings + maritime navigation buoys
  const pilingGeo = new THREE.CylinderGeometry(0.24, 0.28, 2.2, 8);
  const pilingMat = new THREE.MeshStandardMaterial({ color: 0x453224, roughness: 0.9 });
  const pilings = new THREE.InstancedMesh(pilingGeo, pilingMat, 28);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < 28; i++) {
    dummy.position.set(-148 + i * 5.4, 0.1, 156.4);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    pilings.setMatrixAt(i, dummy.matrix);
  }
  pilings.instanceMatrix.needsUpdate = true;
  pilings.computeBoundingSphere();
  worldGroup.add(pilings);

  // Harbor concrete quay coping edge + cast-iron mooring bollards + floating red/green channel buoys
  const quayEdge = new THREE.Mesh(
    new THREE.BoxGeometry(156.4, 0.22, 0.75),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.72, metalness: 0.12 })
  );
  quayEdge.position.set(-75, 0.76, 155.65);
  quayEdge.receiveShadow = true;
  worldGroup.add(quayEdge);

  const bollardGeo = new THREE.CylinderGeometry(0.16, 0.22, 0.52, 8);
  const bollardMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.42, metalness: 0.75 });
  const dockBollards = new THREE.InstancedMesh(bollardGeo, bollardMat, 14);
  for (let i = 0; i < 14; i++) {
    dummy.position.set(-142 + i * 10.6, 1.04, 155.4);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    dockBollards.setMatrixAt(i, dummy.matrix);
  }
  dockBollards.instanceMatrix.needsUpdate = true;
  dockBollards.computeBoundingSphere();
  worldGroup.add(dockBollards);

  // Harbor Quay Port Cargo Infrastructure (2 Detailed Ship-to-Shore Lattice Gantry Cranes + 24 Freight Containers)
  const gantrySteelMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.34, metalness: 0.66 });
  const gantryWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.36, metalness: 0.38 });
  const gantryCabMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.34, metalness: 0.45 });
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.82 });
  for (const gx of [-118, -46]) {
    const crane = new THREE.Group();
    crane.position.set(gx, 0.70, 151.5);
    const legOffsets = [[-2.6, -2.8], [2.6, -2.8], [-2.6, 2.8], [2.6, 2.8]];
    for (const [lx, lz] of legOffsets) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.46, 9.8, 0.46), gantrySteelMat);
      leg.position.set(lx, 4.9, lz);
      leg.castShadow = true;
      crane.add(leg);
    }
    // Cross-portal horizontal beams & diagonal leg braces
    for (const zSide of [-2.8, 2.8]) {
      const portalBeam = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.42, 0.36), gantrySteelMat);
      portalBeam.position.set(0, 5.2, zSide);
      crane.add(portalBeam);
    }
    for (const xSide of [-2.6, 2.6]) {
      const sideTie = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.38, 5.8), gantrySteelMat);
      sideTie.position.set(xSide, 6.2, 0);
      crane.add(sideTie);
    }
    const crossA = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.55, 6.2), gantrySteelMat);
    crossA.position.set(0, 9.8, 0);
    const boomL = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.58, 23.0), gantrySteelMat);
    boomL.position.set(-0.55, 10.35, 5.4);
    boomL.castShadow = true;
    const boomR = boomL.clone();
    boomR.position.x = 0.55;
    // Boom cross lattice rungs
    for (let rz = -5.0; rz <= 15.5; rz += 3.4) {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.24, 0.24), gantryWhiteMat);
      rung.position.set(0, 10.45, rz);
      crane.add(rung);
    }
    const apex = new THREE.Mesh(new THREE.ConeGeometry(0.92, 4.6, 4), gantryWhiteMat);
    apex.rotation.y = Math.PI / 4;
    apex.position.set(0, 12.8, 0);
    // Forestay & backstay tension cables from apex to boom tips
    const foreStay = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 15.8, 6), cableMat);
    foreStay.position.set(0, 12.6, 7.6);
    foreStay.rotation.x = 1.28;
    const backStay = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7.2, 6), cableMat);
    backStay.position.set(0, 12.6, -2.8);
    backStay.rotation.x = -0.96;
    const trolleyCab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.15, 1.8), gantryCabMat);
    trolleyCab.position.set(0, 9.45, 10.5);
    const spreader = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.24, 4.2), gantryCabMat);
    spreader.position.set(0, 6.8, 10.5);
    const hoistWire = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 5), cableMat);
    hoistWire.position.set(0, 8.1, 10.5);
    crane.add(crossA, boomL, boomR, apex, foreStay, backStay, trolleyCab, spreader, hoistWire);
    worldGroup.add(crane);
  }

  const quayContMat = new THREE.MeshStandardMaterial({
    map: textures.corrugatedMap,
    bumpMap: textures.corrugatedBump,
    bumpScale: 0.04,
    roughness: 0.48,
    metalness: 0.36,
  });
  const quayContPalette = [0x0284c7, 0xd97706, 0x059669, 0xdc2626, 0x334155, 0x0f766e];
  const quayContainers = new THREE.InstancedMesh(new THREE.BoxGeometry(4.2, 1.4, 1.75), quayContMat, 24);
  quayContainers.castShadow = true;
  quayContainers.receiveShadow = true;
  let qcIdx = 0;
  for (let bay = 0; bay < 6; bay++) {
    const cx = -138 + bay * 22.5;
    for (let tier = 0; tier < 2; tier++) {
      for (let row = 0; row < 2; row++) {
        dummy.position.set(cx + row * 4.8, 1.42 + tier * 1.42, 144.2 + (bay % 2) * 2.1);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        quayContainers.setMatrixAt(qcIdx, dummy.matrix);
        color.setHex(quayContPalette[(bay * 5 + tier * 3 + row) % quayContPalette.length]);
        quayContainers.setColorAt(qcIdx, color);
        qcIdx++;
      }
    }
  }
  quayContainers.instanceMatrix.needsUpdate = true;
  quayContainers.instanceColor.needsUpdate = true;
  quayContainers.computeBoundingSphere();
  worldGroup.add(quayContainers);

  // Iconic Coastal Headland Lighthouse on Western Rocky Breakwater (-168, 146)
  const lhY = Math.max(-0.1, groundHeightAt(-168, 146));
  const lighthouse = new THREE.Group();
  lighthouse.position.set(-168, lhY, 146);
  const lhBase = new THREE.Mesh(
    new THREE.CylinderGeometry(3.1, 4.4, 2.8, 12),
    new THREE.MeshStandardMaterial({ map: textures.stoneMap, color: 0xb8c2ce, roughness: 0.85 })
  );
  lhBase.position.y = 0.0;
  lhBase.castShadow = true;
  lhBase.receiveShadow = true;
  const lhLower = new THREE.Mesh(
    new THREE.CylinderGeometry(1.55, 2.05, 5.2, 16),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.42 })
  );
  lhLower.position.y = 4.0;
  lhLower.castShadow = true;
  const lhBand = new THREE.Mesh(
    new THREE.CylinderGeometry(1.32, 1.56, 3.2, 16),
    new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.42 })
  );
  lhBand.position.y = 8.1;
  lhBand.castShadow = true;
  const lhUpper = new THREE.Mesh(
    new THREE.CylinderGeometry(1.18, 1.32, 2.4, 16),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.42 })
  );
  lhUpper.position.y = 10.9;
  const lhGallery = new THREE.Mesh(
    new THREE.CylinderGeometry(1.65, 1.50, 0.42, 16),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.75, roughness: 0.32 })
  );
  lhGallery.position.y = 12.2;
  const lhLantern = new THREE.Mesh(
    new THREE.CylinderGeometry(1.02, 1.02, 1.45, 14),
    new THREE.MeshPhysicalMaterial({ color: 0xe0f2fe, roughness: 0.08, metalness: 0.2, clearcoat: 1.0, transparent: true, opacity: 0.65 })
  );
  lhLantern.position.y = 13.1;
  const lhRoof = new THREE.Mesh(
    new THREE.ConeGeometry(1.22, 1.25, 14),
    new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.36, metalness: 0.3 })
  );
  lhRoof.position.y = 14.4;
  const lhCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xfff8cc })
  );
  lhCore.position.y = 13.1;

  const lhPivot = new THREE.Group();
  lhPivot.position.y = 13.1;
  const beamGeo = new THREE.ConeGeometry(5.8, 36.0, 16, 1, true);
  beamGeo.translate(0, -18.0, 0);
  beamGeo.rotateX(Math.PI / 2);
  const lhBeamMat = new THREE.MeshBasicMaterial({
    color: 0xfef3c7,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const lhBeam = new THREE.Mesh(beamGeo, lhBeamMat);
  lhPivot.add(lhBeam);
  lighthouse.add(lhBase, lhLower, lhBand, lhUpper, lhGallery, lhLantern, lhRoof, lhCore, lhPivot);
  worldGroup.add(lighthouse);

  // Floating maritime channel buoys along harbor fairway
  const buoySpecs = [
    { x: -146, z: 172, col: 0xef4444 },
    { x: -94, z: 178, col: 0xef4444 },
    { x: -34, z: 174, col: 0xef4444 },
    { x: -134, z: 198, col: 0x10b981 },
    { x: -78, z: 202, col: 0x10b981 },
    { x: -18, z: 196, col: 0x10b981 },
  ];
  const buoyBodyGeo = mergeTexturedParts([
    new THREE.CylinderGeometry(0.55, 0.62, 0.48, 10),
    new THREE.ConeGeometry(0.32, 0.95, 8).translate(0, 0.65, 0),
  ]);
  const buoyBodyMat = new THREE.MeshStandardMaterial({ roughness: 0.36, metalness: 0.45 });
  const buoyBodyMesh = new THREE.InstancedMesh(buoyBodyGeo, buoyBodyMat, buoySpecs.length);
  const buoyBeaconMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfef08a,
    emissiveIntensity: 2.2,
    roughness: 0.15,
  });
  const buoyBeaconMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 8, 8), buoyBeaconMat, buoySpecs.length);
  buoySpecs.forEach((b, i) => {
    color.setHex(b.col);
    buoyBodyMesh.setColorAt(i, color);
    buoyBeaconMesh.setColorAt(i, color);
  });
  buoyBodyMesh.instanceColor.needsUpdate = true;
  buoyBeaconMesh.instanceColor.needsUpdate = true;
  worldGroup.add(buoyBodyMesh, buoyBeaconMesh);

  // Shared architectural paving & cast concrete materials
  const sidewalkMat = new THREE.MeshStandardMaterial({
    map: textures.sidewalkMap,
    bumpMap: textures.sidewalkBump,
    bumpScale: 0.038,
    color: 0xe8edf3,
    roughness: 0.78,
    metalness: 0.04,
  });
  const curbMat = new THREE.MeshStandardMaterial({
    map: textures.stoneMap,
    color: 0xc4cdd9,
    roughness: 0.72,
    metalness: 0.08,
  });
  const concreteMat = new THREE.MeshStandardMaterial({ map: textures.stoneMap, color: 0xb6c0ce, roughness: 0.72, metalness: 0.10 });

  // Southern Coastal Waterfront Promenade, Marina Finger Piers, 6 Moored Yachts/Sailboats, Beach Umbrellas & 38 Swaying Palms
  const boardwalkDeck = new THREE.Mesh(new THREE.BoxGeometry(126, 0.42, 13.0), sidewalkMat);
  boardwalkDeck.position.set(69, 0.08, 132.5);
  boardwalkDeck.receiveShadow = true;
  worldGroup.add(boardwalkDeck);

  const timberMat = new THREE.MeshStandardMaterial({ color: 0x855836, roughness: 0.82, metalness: 0.04 });
  const teakPromenade = new THREE.Mesh(new THREE.BoxGeometry(124, 0.08, 4.4), timberMat);
  teakPromenade.position.set(69, 0.31, 135.2);
  teakPromenade.receiveShadow = true;
  worldGroup.add(teakPromenade);

  const seawallCoping = new THREE.Mesh(
    new THREE.BoxGeometry(126.4, 0.48, 0.85),
    new THREE.MeshStandardMaterial({ map: textures.stoneMap, color: 0xcbd5e1, roughness: 0.68, metalness: 0.08 })
  );
  seawallCoping.position.set(69, 0.20, 138.8);
  seawallCoping.receiveShadow = true;
  worldGroup.add(seawallCoping);

  // Promenade Iron Bollards & Railing along seawall
  const promPostMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.36, metalness: 0.80 });
  const promPostCount = 26;
  const promPosts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.10, 0.92, 8), promPostMat, promPostCount);
  const promRails = new THREE.InstancedMesh(new THREE.BoxGeometry(4.8, 0.07, 0.07), promPostMat, promPostCount - 1);
  for (let i = 0; i < promPostCount; i++) {
    dummy.position.set(9 + i * 4.8, 0.78, 138.75);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    promPosts.setMatrixAt(i, dummy.matrix);
    if (i < promPostCount - 1) {
      dummy.position.set(11.4 + i * 4.8, 1.12, 138.75);
      dummy.updateMatrix();
      promRails.setMatrixAt(i, dummy.matrix);
    }
  }
  promPosts.instanceMatrix.needsUpdate = true;
  promRails.instanceMatrix.needsUpdate = true;
  worldGroup.add(promPosts, promRails);

  // 3 Wooden Marina Finger Piers extending into the turquoise bay (x = 14, 34, 54)
  const pierXs = [14, 34, 54];
  const marinaPierMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2.8, 0.24, 36.0), timberMat, pierXs.length);
  marinaPierMesh.castShadow = true;
  marinaPierMesh.receiveShadow = true;
  const marinaPilingMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.20, 0.22, 2.2, 8), pilingMat, pierXs.length * 14);
  let mpIdx = 0;
  pierXs.forEach((px, i) => {
    dummy.position.set(px, 0.28, 156.8);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    marinaPierMesh.setMatrixAt(i, dummy.matrix);
    for (let k = 0; k < 7; k++) {
      const pz = 141 + k * 5.6;
      dummy.position.set(px - 1.35, 0.0, pz);
      dummy.updateMatrix();
      marinaPilingMesh.setMatrixAt(mpIdx++, dummy.matrix);
      dummy.position.set(px + 1.35, 0.0, pz);
      dummy.updateMatrix();
      marinaPilingMesh.setMatrixAt(mpIdx++, dummy.matrix);
    }
  });
  marinaPierMesh.instanceMatrix.needsUpdate = true;
  marinaPilingMesh.instanceMatrix.needsUpdate = true;
  worldGroup.add(marinaPierMesh, marinaPilingMesh);

  // 6 Sculpted Luxury Motor Yachts & White Sloop Sailboats moored in the marina & bay
  const yachtHullWhite = new THREE.MeshPhysicalMaterial({ color: 0xf8fafc, roughness: 0.16, metalness: 0.14, clearcoat: 1.0 });
  const yachtStripeNavy = new THREE.MeshPhysicalMaterial({ color: 0x0f2d4e, roughness: 0.20, metalness: 0.35, clearcoat: 0.9 });
  const yachtGlassMat = new THREE.MeshPhysicalMaterial({ color: 0x081322, emissive: 0xfef3c7, emissiveIntensity: 0.30, roughness: 0.06, clearcoat: 1.0 });
  const sailClothMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.58, side: THREE.DoubleSide });
  const yachtTeakMat = new THREE.MeshStandardMaterial({ color: 0x9a643b, roughness: 0.72 });

  const createMotorYacht = (accentHex = 0x0f2d4e) => {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(
      mergeTexturedParts([
        new THREE.BoxGeometry(2.6, 1.05, 7.4).translate(0, 0.52, -0.8),
        new THREE.ConeGeometry(1.38, 3.2, 4).rotateY(Math.PI / 4).rotateX(Math.PI / 2).scale(1.34, 0.78, 1.0).translate(0, 0.54, 4.3),
      ]),
      yachtHullWhite
    );
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.66, 0.24, 7.2), new THREE.MeshPhysicalMaterial({ color: accentHex, roughness: 0.22, clearcoat: 0.9 }));
    stripe.position.set(0, 0.75, -0.75);
    const teakDeck = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.10, 8.6), yachtTeakMat);
    teakDeck.position.set(0, 1.06, -0.1);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.92, 4.4), yachtHullWhite);
    cabin.position.set(0, 1.54, -0.5);
    const winWrap = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.52, 4.15), yachtGlassMat);
    winWrap.position.set(0, 1.58, -0.45);
    const flybridge = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.42, 2.7), yachtHullWhite);
    flybridge.position.set(0, 2.20, -1.0);
    const radarArch = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.08, 8, 16, Math.PI), yachtHullWhite);
    radarArch.position.set(0, 2.38, -2.0);
    boat.add(hull, stripe, teakDeck, cabin, winWrap, flybridge, radarArch);
    boat.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    return boat;
  };

  const createSloopSailboat = (hullHex = 0xf8fafc) => {
    const boat = new THREE.Group();
    const hMat = new THREE.MeshPhysicalMaterial({ color: hullHex, roughness: 0.18, metalness: 0.18, clearcoat: 1.0 });
    const hull = new THREE.Mesh(
      mergeTexturedParts([
        new THREE.BoxGeometry(1.9, 0.72, 5.4).translate(0, 0.36, -0.6),
        new THREE.ConeGeometry(1.02, 2.8, 4).rotateY(Math.PI / 4).rotateX(Math.PI / 2).scale(1.32, 0.72, 1.0).translate(0, 0.38, 3.4),
      ]),
      hMat
    );
    const coachRoof = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.45, 2.6), yachtHullWhite);
    coachRoof.position.set(0, 0.92, -0.3);
    const coachGlass = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.22, 1.9), yachtGlassMat);
    coachGlass.position.set(0, 0.94, -0.2);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 7.6, 8), new THREE.MeshStandardMaterial({ color: 0xdbeafe, metalness: 0.85, roughness: 0.22 }));
    mast.position.set(0, 4.75, 0.35);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 3.4, 6).rotateX(Math.PI / 2), mast.material);
    boom.position.set(0, 1.85, -1.3);

    const mainSailShape = new THREE.Shape();
    mainSailShape.moveTo(0, 0);
    mainSailShape.lineTo(0, 5.4);
    mainSailShape.lineTo(2.9, 0);
    mainSailShape.closePath();
    const mainSail = new THREE.Mesh(new THREE.ShapeGeometry(mainSailShape), sailClothMat);
    mainSail.rotation.y = Math.PI / 2 + 0.08;
    mainSail.position.set(0.05, 1.92, 0.30);

    const jibShape = new THREE.Shape();
    jibShape.moveTo(0, 0);
    jibShape.lineTo(0, 4.7);
    jibShape.lineTo(-2.35, 0);
    jibShape.closePath();
    const jibSail = new THREE.Mesh(new THREE.ShapeGeometry(jibShape), sailClothMat);
    jibSail.rotation.y = Math.PI / 2 - 0.12;
    jibSail.position.set(-0.04, 1.35, 0.55);

    boat.add(hull, coachRoof, coachGlass, mast, boom, mainSail, jibSail);
    boat.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    return boat;
  };

  const marinaVessels = [
    { mesh: createMotorYacht(0x0f2d4e), x: 8.2, z: 162, rotY: Math.PI, phase: 0.2, driftAmp: 0 },
    { mesh: createSloopSailboat(0xf8fafc), x: 20.0, z: 168, rotY: Math.PI + 0.04, phase: 1.5, driftAmp: 0 },
    { mesh: createMotorYacht(0x0284c7), x: 28.4, z: 159, rotY: Math.PI - 0.03, phase: 2.7, driftAmp: 0 },
    { mesh: createSloopSailboat(0x0f2537), x: 48.2, z: 169, rotY: Math.PI + 0.02, phase: 4.1, driftAmp: 0 },
    { mesh: createSloopSailboat(0xf8fafc), x: -2.0, z: 198, rotY: 1.35, phase: 0.9, driftAmp: 12.0 },
    { mesh: createMotorYacht(0x7c2d12), x: 40.0, z: 212, rotY: -1.42, phase: 3.4, driftAmp: 14.0 },
  ];
  marinaVessels.forEach((v) => {
    v.mesh.position.set(v.x, -0.58, v.z);
    v.mesh.rotation.y = v.rotY;
    worldGroup.add(v.mesh);
  });

  // 12 Colorful Coastal Beach Umbrellas on the golden eastern dry sand beach
  const beachUmbrellaCoords = [
    [82, 141.5], [90, 142.0], [98, 142.5], [106, 142.0], [114, 142.5], [122, 142.0],
    [100, 147.0], [108, 147.5], [115, 149.0], [122, 147.5], [111, 153.5], [120, 152.0],
  ];
  const umbPoleMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.05, 0.05, 2.35, 6),
    new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4 }),
    beachUmbrellaCoords.length
  );
  const umbCanopyMesh = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1.65, 0.72, 8),
    new THREE.MeshStandardMaterial({ roughness: 0.65, side: THREE.DoubleSide }),
    beachUmbrellaCoords.length
  );
  umbCanopyMesh.castShadow = true;
  const umbPalette = [0x0284c7, 0xf97316, 0x10b981, 0xeab308, 0xe11d48, 0x38bdf8];
  beachUmbrellaCoords.forEach(([ux, uz], i) => {
    const uy = Math.max(-0.22, groundHeightAt(ux, uz));
    dummy.position.set(ux, uy + 1.15, uz);
    dummy.rotation.set(0, i * 0.6, (i % 2 === 0 ? 1 : -1) * 0.08);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    umbPoleMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(ux, uy + 2.15, uz);
    dummy.updateMatrix();
    umbCanopyMesh.setMatrixAt(i, dummy.matrix);
    color.setHex(umbPalette[i % umbPalette.length]);
    umbCanopyMesh.setColorAt(i, color);
  });
  umbPoleMesh.instanceMatrix.needsUpdate = true;
  umbCanopyMesh.instanceMatrix.needsUpdate = true;
  umbCanopyMesh.instanceColor.needsUpdate = true;
  worldGroup.add(umbPoleMesh, umbCanopyMesh);

  // 38 Swaying Coastal Palm Trees (Curved Trunk + 8 Arching Feather Fronds) along Boardwalk & Cove
  const palmTrunkGeo = new THREE.CylinderGeometry(0.14, 0.28, 6.2, 8, 8);
  palmTrunkGeo.translate(0, 3.1, 0);
  const ptPos = palmTrunkGeo.attributes.position;
  for (let i = 0; i < ptPos.count; i++) {
    const y = ptPos.getY(i);
    const t = y / 6.2;
    ptPos.setX(i, ptPos.getX(i) + Math.pow(t, 1.7) * 0.95);
  }
  ptPos.needsUpdate = true;
  palmTrunkGeo.computeVertexNormals();

  const frondParts = [];
  for (let f = 0; f < 8; f++) {
    const ang = (f / 8) * Math.PI * 2 + (f % 2) * 0.14;
    const frond = new THREE.BoxGeometry(0.38, 0.045, 2.55, 1, 1, 5);
    const fp = frond.attributes.position;
    for (let k = 0; k < fp.count; k++) {
      const z = fp.getZ(k);
      const u = (z + 1.275) / 2.55; // 0 at base -> 1 at frond tip
      const widthTaper = Math.sin(u * Math.PI) * 1.35 + 0.15;
      fp.setX(k, fp.getX(k) * widthTaper);
      fp.setY(k, fp.getY(k) + Math.sin(u * Math.PI * 0.85) * 0.42 - u * u * 0.92);
    }
    fp.needsUpdate = true;
    frond.computeVertexNormals();
    frond.translate(0, 0, 1.25);
    frond.rotateX(-0.18 - (f % 2) * 0.16);
    frond.rotateY(ang);
    frond.translate(0.95, 6.08, 0);
    frondParts.push(frond);
  }
  const palmCrownGeo = mergeTexturedParts(frondParts);
  const palmTrunkMat = new THREE.MeshStandardMaterial({ map: textures.barkMap, color: 0x8b6f52, roughness: 0.90 });
  const palmLeafMat = new THREE.MeshStandardMaterial({ map: textures.leafMap, color: 0x5ea844, roughness: 0.72, side: THREE.DoubleSide });
  applyWindShader(palmLeafMat, 0.065);

  const palmCoords = [];
  for (let i = 0; i < 15; i++) {
    palmCoords.push([10 + i * 8.2, 127.2, 0.28]);
    if (i % 2 === 0) palmCoords.push([12 + i * 8.2, 137.0, 0.28]);
  }
  for (let i = 0; i < 15; i++) {
    const px = 76 + i * 3.5;
    const pz = 140.8 + (i % 3) * 1.9;
    const py = groundHeightAt(px, pz);
    if (py >= -0.22) palmCoords.push([px, pz, py]);
  }
  const palmTrunkMesh = new THREE.InstancedMesh(palmTrunkGeo, palmTrunkMat, palmCoords.length);
  const palmCrownMesh = new THREE.InstancedMesh(palmCrownGeo, palmLeafMat, palmCoords.length);
  palmTrunkMesh.castShadow = true;
  palmCrownMesh.castShadow = true;
  palmCrownMesh.receiveShadow = true;
  palmCoords.forEach(([px, pz, py], i) => {
    const s = 0.88 + (i % 5) * 0.08;
    dummy.position.set(px, py, pz);
    dummy.rotation.set(0, (i * 1.65) % (Math.PI * 2), 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    palmTrunkMesh.setMatrixAt(i, dummy.matrix);
    palmCrownMesh.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.28 + (i % 4) * 0.015, 0.44, 0.56 + (i % 3) * 0.06);
    palmCrownMesh.setColorAt(i, color);
  });
  palmTrunkMesh.instanceMatrix.needsUpdate = true;
  palmCrownMesh.instanceMatrix.needsUpdate = true;
  palmCrownMesh.instanceColor.needsUpdate = true;
  worldGroup.add(palmTrunkMesh, palmCrownMesh);

  // Coastal Airport Apron + Runway (x=150) + Architectural Glass Terminal + ATC Tower + 2 Parked Jets
  const tarmac = new THREE.Mesh(
    new THREE.BoxGeometry(46, 0.22, 224),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, bumpMap: textures.roadBump, bumpScale: 0.03, roughness: 0.85 })
  );
  tarmac.position.set(160, 0.02, -10);
  tarmac.receiveShadow = true;
  worldGroup.add(tarmac);

  textures.runwayMap.repeat.set(1, 4);
  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 204),
    new THREE.MeshStandardMaterial({ map: textures.runwayMap, bumpMap: textures.roadBump, bumpScale: 0.03, roughness: 0.78 })
  );
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(150, 0.15, -10);
  runway.receiveShadow = true;
  worldGroup.add(runway);

  // Taxiway lead-ins connecting runway to Eastern Terminal & Apron
  const taxiMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.84 });
  for (const tz of [-72, -12, 16, 42]) {
    const tw = new THREE.Mesh(new THREE.PlaneGeometry(14, 5.2), taxiMat);
    tw.rotation.x = -Math.PI / 2;
    tw.position.set(164, 0.145, tz);
    tw.receiveShadow = true;
    worldGroup.add(tw);
  }

  const edgeBulbMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfacc15, emissiveIntensity: 1.8 });
  const edgeLights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 6, 6), edgeBulbMat, 32);
  for (let i = 0; i < 16; i++) {
    dummy.position.set(142.2, 0.24, -104 + i * 12.8);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    edgeLights.setMatrixAt(i * 2, dummy.matrix);
    dummy.position.set(157.8, 0.24, -104 + i * 12.8);
    dummy.updateMatrix();
    edgeLights.setMatrixAt(i * 2 + 1, dummy.matrix);
  }
  edgeLights.instanceMatrix.needsUpdate = true;
  edgeLights.computeBoundingSphere();
  worldGroup.add(edgeLights);

  // Runway PAPI Precision Approach Path Indicator Lights & Threshold Green Markers
  const papiMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.3 });
  const papiMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.28, 0.42), papiMat, 16);
  for (let i = 0; i < 4; i++) {
    dummy.position.set(139.6 + i * 0.9, 0.24, 82);
    dummy.updateMatrix();
    papiMesh.setMatrixAt(i, dummy.matrix);
    color.setHex(i < 2 ? 0xfef9c3 : 0xef4444);
    papiMesh.setColorAt(i, color);
    dummy.position.set(139.6 + i * 0.9, 0.24, -102);
    dummy.updateMatrix();
    papiMesh.setMatrixAt(4 + i, dummy.matrix);
    papiMesh.setColorAt(4 + i, color);
  }
  for (let i = 0; i < 4; i++) {
    dummy.position.set(144 + i * 4.0, 0.22, 91.5);
    dummy.updateMatrix();
    papiMesh.setMatrixAt(8 + i, dummy.matrix);
    color.setHex(0x10b981);
    papiMesh.setColorAt(8 + i, color);

    dummy.position.set(144 + i * 4.0, 0.22, -111.5);
    dummy.updateMatrix();
    papiMesh.setMatrixAt(12 + i, dummy.matrix);
    papiMesh.setColorAt(12 + i, color);
  }
  papiMesh.instanceMatrix.needsUpdate = true;
  papiMesh.instanceColor.needsUpdate = true;
  papiMesh.computeBoundingSphere();
  worldGroup.add(papiMesh);

  // Glass-and-Steel Coastal Airport Concourse Terminal (x=175, z=-12)
  const airportTerminal = new THREE.Group();
  airportTerminal.position.set(175.5, 0.14, -12);
  const termSteelMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.32, metalness: 0.68 });
  const termRoofMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.36, metalness: 0.42 });
  const termGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f253d,
    emissive: 0xfde68a,
    emissiveIntensity: 0.22,
    roughness: 0.07,
    metalness: 0.35,
    clearcoat: 1.0,
  });
  ambientWindowMaterials.push(termGlassMat);

  const termPlinth = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.42, 34.0), concreteMat);
  termPlinth.position.y = 0.21;
  const termGlassBody = new THREE.Mesh(new THREE.BoxGeometry(9.2, 4.6, 30.0), termGlassMat);
  termGlassBody.position.y = 2.6;
  termGlassBody.castShadow = true;
  const termRoofWing = new THREE.Mesh(new THREE.CylinderGeometry(17.5, 17.5, 12.2, 18, 1, false, -0.42, 0.84), termRoofMat);
  termRoofWing.rotation.z = Math.PI / 2;
  termRoofWing.scale.set(1.0, 1.0, 0.34);
  termRoofWing.position.set(-0.6, 5.2, 0);
  termRoofWing.castShadow = true;
  // Vertical facade mullions & cantilevered jetway gates facing runway (-X)
  for (let mz = -14; mz <= 14; mz += 3.5) {
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(9.6, 4.75, 0.22), termSteelMat);
    mullion.position.set(0, 2.65, mz);
    airportTerminal.add(mullion);
  }
  for (const jz of [-8, 8]) {
    const jetway = new THREE.Mesh(new THREE.BoxGeometry(5.8, 1.35, 1.35), termSteelMat);
    jetway.position.set(-7.2, 2.45, jz);
    jetway.rotation.y = 0.28 * Math.sign(jz);
    airportTerminal.add(jetway);
  }
  airportTerminal.add(termPlinth, termGlassBody, termRoofWing);
  worldGroup.add(airportTerminal);

  // Sculpted Air Traffic Control Tower (x=175.5, z=-45) + Rotating Radar Scanner
  const atcTower = new THREE.Group();
  atcTower.position.set(175.5, 0.14, -45);
  const atcBase = new THREE.Mesh(new THREE.BoxGeometry(6.8, 2.4, 6.8), concreteMat);
  atcBase.position.y = 1.2;
  atcBase.castShadow = true;
  const atcShaft = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 2.15, 11.4, 12), concreteMat);
  atcShaft.position.y = 8.0;
  atcShaft.castShadow = true;
  const atcCollar = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 2.0, 1.2, 12), termSteelMat);
  atcCollar.position.y = 14.1;
  const atcCabGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(3.35, 2.75, 2.1, 12),
    new THREE.MeshPhysicalMaterial({ color: 0x064e3b, emissive: 0xa7f3d0, emissiveIntensity: 0.35, roughness: 0.06, metalness: 0.3, clearcoat: 1.0 })
  );
  atcCabGlass.position.y = 15.65;
  ambientWindowMaterials.push(atcCabGlass.material);
  const atcRoof = new THREE.Mesh(new THREE.CylinderGeometry(3.55, 3.55, 0.45, 12), termRoofMat);
  atcRoof.position.y = 16.9;
  const atcMast = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.16, 2.2, 8), termSteelMat);
  atcMast.position.y = 18.0;
  const atcRadar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.55, 2.4), new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.4, roughness: 0.3 }));
  atcRadar.position.y = 19.1;
  const atcBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
  atcBeacon.position.y = 19.6;
  atcTower.add(atcBase, atcShaft, atcCollar, atcCabGlass, atcRoof, atcMast, atcRadar, atcBeacon);
  worldGroup.add(atcTower);

  // 2 Parked Regional Executive Jets on Eastern Apron facing west toward runway
  const createParkedJet = (accentHex = 0x0284c7) => {
    const jet = new THREE.Group();
    const jWhite = new THREE.MeshPhysicalMaterial({ color: 0xf8fafc, roughness: 0.16, metalness: 0.45, clearcoat: 1.0 });
    const jAccent = new THREE.MeshPhysicalMaterial({ color: accentHex, roughness: 0.22, metalness: 0.55, clearcoat: 0.9 });
    const jDark = new THREE.MeshPhysicalMaterial({ color: 0x091320, roughness: 0.05, clearcoat: 1.0 });
    const fuse = new THREE.Mesh(
      new THREE.LatheGeometry([
        new THREE.Vector2(0.01, -4.6),
        new THREE.Vector2(0.36, -3.2),
        new THREE.Vector2(0.56, -1.5),
        new THREE.Vector2(0.56, 2.6),
        new THREE.Vector2(0.38, 3.9),
        new THREE.Vector2(0.01, 4.7),
      ], 20).rotateX(Math.PI / 2),
      jWhite
    );
    fuse.castShadow = true;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.14, 1.85), jAccent);
    wing.position.set(0, -0.22, 0.15);
    wing.castShadow = true;
    const hStab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.10, 0.85), jWhite);
    hStab.position.set(0, 1.55, -4.1);
    const vStab = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.85, 1.25), jAccent);
    vStab.position.set(0, 0.92, -3.8);
    vStab.rotation.x = -0.32;
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.28, 0.82), jDark);
    cockpit.position.set(0, 0.24, 3.45);
    jet.add(fuse, wing, hStab, vStab, cockpit);
    return jet;
  };
  for (const [jx, jz, rot, col] of [[168.5, 16, -Math.PI / 2 - 0.15, 0x0284c7], [168.5, 42, -Math.PI / 2 + 0.12, 0xb91c1c]]) {
    const parked = createParkedJet(col);
    parked.position.set(jx, 0.88, jz);
    parked.rotation.y = rot;
    worldGroup.add(parked);
  }

  // 3. Multi-Lane Urban Asphalt Road Grid (Batched 7x7 Grid = 14 Avenues in 1 InstancedMesh + 49 Intersections in 1 InstancedMesh!)
  const roadLines = [-120, -80, -40, 0, 40, 80, 120];
  textures.roadMap.repeat.set(1, 25);
  textures.roadBump.repeat.set(1, 25);
  textures.roadRoughMap.repeat.set(1, 25);

  const roadMat = new THREE.MeshStandardMaterial({
    map: textures.roadMap,
    bumpMap: textures.roadBump,
    bumpScale: 0.055,
    roughnessMap: textures.roadRoughMap,
    roughness: 0.86,
    metalness: 0.05,
  });
  roadMaterials.push(roadMat);

  const roadGeo = new THREE.PlaneGeometry(8.4, 272);
  roadGeo.rotateX(-Math.PI / 2);
  const roadInstancedMesh = new THREE.InstancedMesh(roadGeo, roadMat, roadLines.length * 2);
  roadInstancedMesh.receiveShadow = true;
  let rIdx = 0;
  for (const pos of roadLines) {
    // North-South Avenue
    dummy.position.set(pos, 0.025, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    roadInstancedMesh.setMatrixAt(rIdx++, dummy.matrix);

    // East-West Boulevard
    dummy.position.set(0, 0.032, pos);
    dummy.rotation.set(0, Math.PI / 2, 0);
    dummy.updateMatrix();
    roadInstancedMesh.setMatrixAt(rIdx++, dummy.matrix);
  }
  roadInstancedMesh.instanceMatrix.needsUpdate = true;
  roadInstancedMesh.computeBoundingSphere();
  worldGroup.add(roadInstancedMesh);

  const interMat = new THREE.MeshStandardMaterial({
    map: textures.crosswalkMap,
    bumpMap: textures.roadBump,
    bumpScale: 0.045,
    roughnessMap: textures.roadRoughMap,
    roughness: 0.86,
    metalness: 0.05,
  });
  roadMaterials.push(interMat);
  const interGeo = new THREE.PlaneGeometry(8.6, 8.6);
  interGeo.rotateX(-Math.PI / 2);
  const interInstancedMesh = new THREE.InstancedMesh(interGeo, interMat, roadLines.length * roadLines.length);
  interInstancedMesh.receiveShadow = true;
  let iIdx = 0;
  for (const ix of roadLines) {
    for (const iz of roadLines) {
      dummy.position.set(ix, 0.045, iz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      interInstancedMesh.setMatrixAt(iIdx++, dummy.matrix);
    }
  }
  interInstancedMesh.instanceMatrix.needsUpdate = true;
  interInstancedMesh.computeBoundingSphere();
  worldGroup.add(interInstancedMesh);

  // Southern Harbor Waterfront Highway Guardrail along z = 124.3
  const railPostMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.78, roughness: 0.34 });
  const railCount = 62;
  const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(3.8, 0.22, 0.12), railPostMat, railCount);
  const railPostMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.65, 0.12), railPostMat, railCount);
  for (let i = 0; i < railCount; i++) {
    const rx = -122 + i * 4.0;
    dummy.position.set(rx, 0.56, 124.3);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    railMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(rx, 0.32, 124.3);
    dummy.updateMatrix();
    railPostMesh.setMatrixAt(i, dummy.matrix);
  }
  railMesh.instanceMatrix.needsUpdate = true;
  railPostMesh.instanceMatrix.needsUpdate = true;
  railMesh.computeBoundingSphere();
  railPostMesh.computeBoundingSphere();
  worldGroup.add(railMesh, railPostMesh);

  // 3b. Cantilevered Mast-Arm Traffic Signals at 5x5 Inner Intersections (25 total, same 7 draw calls!)
  const signalCoords = [];
  for (const ix of [-80, -40, 0, 40, 80]) {
    for (const iz of [-80, -40, 0, 40, 80]) {
      signalCoords.push([ix, iz]);
    }
  }
  const sigPoleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.28 });
  const sigNSMat = new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 2.3 });
  const sigEWMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 2.3 });

  const sigPoleMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.10, 0.14, 4.6, 8), sigPoleMat, signalCoords.length * 2);
  const sigArmNSMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 0.12, 0.12), sigPoleMat, signalCoords.length);
  const sigArmEWMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 3.2), sigPoleMat, signalCoords.length);
  const sigNSHousingMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.50, 0.92, 0.30), sigPoleMat, signalCoords.length);
  const sigEWHousingMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.30, 0.92, 0.50), sigPoleMat, signalCoords.length);
  const sigNSLightMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.38, 0.72, 0.34), sigNSMat, signalCoords.length);
  const sigEWLightMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.72, 0.38), sigEWMat, signalCoords.length);

  signalCoords.forEach(([ix, iz], idx) => {
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);

    dummy.position.set(ix + 4.35, 2.3, iz + 4.35);
    dummy.updateMatrix();
    sigPoleMesh.setMatrixAt(idx * 2, dummy.matrix);

    dummy.position.set(ix - 4.35, 2.3, iz - 4.35);
    dummy.updateMatrix();
    sigPoleMesh.setMatrixAt(idx * 2 + 1, dummy.matrix);

    dummy.position.set(ix + 2.8, 4.45, iz + 4.35);
    dummy.updateMatrix();
    sigArmNSMesh.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(ix - 4.35, 4.45, iz - 2.8);
    dummy.updateMatrix();
    sigArmEWMesh.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(ix + 2.1, 4.15, iz + 4.35);
    dummy.updateMatrix();
    sigNSHousingMesh.setMatrixAt(idx, dummy.matrix);
    sigNSLightMesh.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(ix - 4.35, 4.15, iz - 2.1);
    dummy.updateMatrix();
    sigEWHousingMesh.setMatrixAt(idx, dummy.matrix);
    sigEWLightMesh.setMatrixAt(idx, dummy.matrix);
  });
  [sigPoleMesh, sigArmNSMesh, sigArmEWMesh, sigNSHousingMesh, sigEWHousingMesh, sigNSLightMesh, sigEWLightMesh].forEach((m) => {
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    worldGroup.add(m);
  });

  // 4. Paved Block Sidewalks (1 InstancedMesh), 3D Curbs (1 InstancedMesh), Park Lawns (1 InstancedMesh) & Batched Fountains
  const blockCenters = [-100, -60, -20, 20, 60, 100];
  const blockCount = blockCenters.length * blockCenters.length;

  const parkGrassMap = textures.grassMap.clone();
  parkGrassMap.needsUpdate = true;
  parkGrassMap.repeat.set(3, 3);
  const parkMat = new THREE.MeshStandardMaterial({
    map: parkGrassMap,
    bumpMap: textures.grassBump,
    bumpScale: 0.08,
    color: 0xa4c986,
    roughness: 0.90,
    metalness: 0.02,
  });

  const sidewalkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(31.6, 0.14, 31.6), sidewalkMat, blockCount);
  sidewalkMesh.receiveShadow = true;
  const lawnMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(12.2, 0.12, 12.2), parkMat, blockCount);
  lawnMesh.receiveShadow = true;

  // 3D Granite Curbstone segments wrapping each 32x32 block (4 sides x 36 blocks = 144 curb beams)
  const curbMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(31.8, 0.17, 0.34), curbMat, blockCount * 4);
  curbMesh.receiveShadow = true;
  let blockIdx = 0;
  let curbIdx = 0;

  const oakPositions = [];
  const planterPositions = [];
  const pinePositions = [];
  const bushPositions = [];
  const benchPositions = [];
  const rockPositions = [];
  const hydrantPositions = [];
  const formalParkCoords = [];

  // Sculpted Lathe Stone Fountain Centerpiece (shared geometry across formal parks)
  const fountainTierGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.55, 0.0),
    new THREE.Vector2(0.45, 0.35),
    new THREE.Vector2(0.28, 0.55),
    new THREE.Vector2(1.05, 0.85),
    new THREE.Vector2(1.08, 0.96),
    new THREE.Vector2(0.32, 0.96),
    new THREE.Vector2(0.22, 1.38),
    new THREE.Vector2(0.62, 1.56),
    new THREE.Vector2(0.64, 1.66),
    new THREE.Vector2(0.14, 1.66),
    new THREE.Vector2(0.0, 1.82),
  ], 18);
  const spoutMat = new THREE.MeshPhysicalMaterial({
    color: 0xdbeafe,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.78,
    roughness: 0.08,
    metalness: 0.1,
  });

  for (const bz of blockCenters) {
    for (const bx of blockCenters) {
      dummy.position.set(bx, 0.06, bz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      sidewalkMesh.setMatrixAt(blockIdx, dummy.matrix);

      // 4 granite curb edges per city block
      const sides = [
        [bx, bz - 15.85, 0],
        [bx, bz + 15.85, 0],
        [bx - 15.85, bz, Math.PI / 2],
        [bx + 15.85, bz, Math.PI / 2],
      ];
      for (const [cx, cz, ry] of sides) {
        dummy.position.set(cx, 0.085, cz);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        curbMesh.setMatrixAt(curbIdx++, dummy.matrix);
      }

      // Corner street fire hydrant for fine boulevard scale
      hydrantPositions.push([bx - 14.8, bz - 14.8]);

      // 4th Quadrant of every block (ax, az): NO pre-built buildings! Parks or natural open greens.
      const ax = bx + 7.5;
      const az = bz + 7.5;
      const isFormalPark =
        ((Math.abs(bx) + Math.abs(bz)) === 80 && Math.abs(bx) <= 60 && Math.abs(bz) <= 60) ||
        (bx === -20 && bz === -20) ||
        (bx === 20 && bz === 60) ||
        (bx === -60 && bz === 60) ||
        (bx === 60 && bz === -60);

      dummy.position.set(ax, 0.13, az);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      lawnMesh.setMatrixAt(blockIdx, dummy.matrix);
      blockIdx++;

      if (isFormalPark) {
        formalParkCoords.push([ax, az]);
        oakPositions.push([ax - 4.2, az - 4.2, 0.12], [ax + 4.2, az - 4.2, 0.12], [ax - 4.2, az + 4.2, 0.12], [ax + 4.2, az + 4.2, 0.12]);
        pinePositions.push([ax, az - 4.9, 0.12], [ax, az + 4.9, 0.12]);
        bushPositions.push([ax - 3.6, az, 0.12], [ax + 3.6, az, 0.12]);
        benchPositions.push([ax - 2.9, az, Math.PI / 2], [ax + 2.9, az, -Math.PI / 2]);
      } else {
        // Natural undeveloped urban woodland & meadow parcel
        oakPositions.push([ax - 2.8, az - 2.6, 0.12], [ax + 3.1, az + 2.8, 0.12]);
        pinePositions.push([ax + 2.6, az - 3.1, 0.12]);
        bushPositions.push([ax - 3.5, az + 2.2, 0.12], [ax + 0.6, az - 0.8, 0.12], [ax - 1.2, az + 3.6, 0.12]);
        rockPositions.push([ax + 3.8, az - 0.5, 0.18, 0.7], [ax - 3.6, az - 3.9, 0.18, 0.55]);
      }

      // Boulevard sidewalk trees in granite planter beds
      oakPositions.push([bx - 14.5, bz - 5.5, 0.12], [bx + 14.5, bz + 5.5, 0.12]);
      planterPositions.push([bx - 14.5, bz - 5.5], [bx + 14.5, bz + 5.5]);
    }
  }

  sidewalkMesh.instanceMatrix.needsUpdate = true;
  sidewalkMesh.computeBoundingSphere();
  lawnMesh.instanceMatrix.needsUpdate = true;
  lawnMesh.computeBoundingSphere();
  curbMesh.instanceMatrix.needsUpdate = true;
  curbMesh.computeBoundingSphere();
  worldGroup.add(sidewalkMesh, lawnMesh, curbMesh);

  // Batch all formal park fountains + travertine plaza discs + colorful flowerbeds
  let fountainSpoutMesh = null;
  if (formalParkCoords.length > 0) {
    const plazaMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(4.4, 4.5, 0.08, 8), sidewalkMat, formalParkCoords.length);
    plazaMesh.receiveShadow = true;
    const basinMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(2.2, 2.4, 0.48, 22), concreteMat, formalParkCoords.length);
    basinMesh.receiveShadow = true;
    const fWaterMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.88, 1.88, 0.52, 22), fountainWaterMat, formalParkCoords.length);
    const centerpieceMesh = new THREE.InstancedMesh(fountainTierGeo, concreteMat, formalParkCoords.length);
    centerpieceMesh.castShadow = true;
    fountainSpoutMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.36, 1.15, 12), spoutMat, formalParkCoords.length);

    const flowerPalette = [0xfb7185, 0xfbbf24, 0xc084fc, 0x38bdf8, 0xf97316];
    const flowerClusterMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.32, 0),
      new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.02 }),
      formalParkCoords.length * 12
    );
    let flIdx = 0;

    formalParkCoords.forEach(([ax, az], i) => {
      dummy.rotation.set(0, Math.PI / 8, 0);
      dummy.scale.set(1, 1, 1);
      dummy.position.set(ax, 0.21, az);
      dummy.updateMatrix();
      plazaMesh.setMatrixAt(i, dummy.matrix);

      dummy.rotation.set(0, 0, 0);
      dummy.position.set(ax, 0.38, az);
      dummy.updateMatrix();
      basinMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.set(ax, 0.40, az);
      dummy.updateMatrix();
      fWaterMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.set(ax, 0.25, az);
      dummy.updateMatrix();
      centerpieceMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.set(ax, 2.45, az);
      dummy.updateMatrix();
      fountainSpoutMesh.setMatrixAt(i, dummy.matrix);

      for (let f = 0; f < 12; f++) {
        const ang = (f / 12) * Math.PI * 2;
        const rad = f % 2 === 0 ? 3.45 : 4.75;
        dummy.position.set(ax + Math.cos(ang) * rad, 0.28, az + Math.sin(ang) * rad);
        dummy.rotation.set(0, ang, 0);
        dummy.scale.set(1.3, 0.65, 1.1);
        dummy.updateMatrix();
        flowerClusterMesh.setMatrixAt(flIdx, dummy.matrix);
        color.setHex(flowerPalette[(i + f) % flowerPalette.length]);
        flowerClusterMesh.setColorAt(flIdx, color);
        flIdx++;
      }
    });
    flowerClusterMesh.instanceMatrix.needsUpdate = true;
    flowerClusterMesh.instanceColor.needsUpdate = true;
    flowerClusterMesh.computeBoundingSphere();
    [plazaMesh, basinMesh, fWaterMesh, centerpieceMesh, fountainSpoutMesh, flowerClusterMesh].forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      worldGroup.add(m);
    });
  }

  // 5. Lush Hillside & Valley Forests + Coastal Boulders Grounded at Exact groundHeightAt(x, z)
  const validOutsideCity = (x, z) => {
    const inCity = Math.abs(x) < 143 && Math.abs(z) < 143;
    const inAirport = x > 134 && x < 188 && z > -134 && z < 116;
    const inQuay = x > -158 && x < 134 && z > 125 && z < 164;
    return !inCity && !inAirport && !inQuay;
  };

  // Pine forests along northern ridges, eastern slopes, and western foothills
  for (let i = 0; i < 420; i++) {
    const a = i * 2.39996;
    const rad = 152 + (i % 48) * 4.5;
    const px = Math.cos(a) * rad + Math.sin(i * 1.7) * 9;
    const pz = Math.sin(a) * rad + Math.cos(i * 1.3) * 9;
    if (!validOutsideCity(px, pz)) continue;
    const py = groundHeightAt(px, pz);
    if (py < 0.8 || py > 26) continue;
    pinePositions.push([px, pz, py]);
    if (i % 3 === 0) {
      bushPositions.push([px + 2.4, pz - 1.8, groundHeightAt(px + 2.4, pz - 1.8)]);
    }
  }

  // Valley & meadow broadleaf oaks outside the city
  for (let i = 0; i < 110; i++) {
    const px = -290 + ((i * 79) % 580);
    const pz = -290 + ((i * 127) % 450);
    if (!validOutsideCity(px, pz)) continue;
    const py = groundHeightAt(px, pz);
    if (py < 0.6 || py > 12) continue;
    oakPositions.push([px, pz, py]);
  }

  // Breakwater & hillside rock outcrops
  for (let i = 0; i < 28; i++) {
    const rx = -150 + i * 5.2;
    const rz = 157.5 + Math.sin(i * 1.7) * 1.2;
    rockPositions.push([rx, rz, -0.1, 1.0 + (i % 3) * 0.3]);
  }
  for (let i = 0; i < 85; i++) {
    const a = i * 1.93;
    const rad = 158 + (i % 32) * 5.5;
    const rx = Math.cos(a) * rad;
    const rz = Math.sin(a) * rad;
    if (!validOutsideCity(rx, rz)) continue;
    const ry = groundHeightAt(rx, rz);
    if (ry > 0.2) rockPositions.push([rx, rz, ry, 0.9 + (i % 4) * 0.45]);
  }

  // 6. Realistic Botanical Broadleaf Oaks
  const oakGeo = createRealisticOakGeometries();
  const barkMat = new THREE.MeshStandardMaterial({
    map: textures.barkMap,
    bumpMap: textures.barkBump,
    bumpScale: 0.08,
    roughness: 0.92,
    metalness: 0.02,
  });
  const oakLeafMat = new THREE.MeshStandardMaterial({
    map: textures.leafMap,
    bumpMap: textures.leafBump,
    bumpScale: 0.12,
    roughness: 0.78,
    metalness: 0.02,
  });
  applyWindShader(oakLeafMat, 0.045);

  const oakTrunkMesh = new THREE.InstancedMesh(oakGeo.trunkGeo, barkMat, oakPositions.length);
  const oakCanopyMesh = new THREE.InstancedMesh(oakGeo.canopyGeo, oakLeafMat, oakPositions.length);
  oakTrunkMesh.castShadow = true;
  oakCanopyMesh.castShadow = true;
  oakCanopyMesh.receiveShadow = true;

  oakPositions.forEach(([tx, tz, ty], i) => {
    const scale = 0.85 + ((i * 19) % 36) / 100;
    dummy.position.set(tx, ty, tz);
    dummy.rotation.set(0, (i * 1.37) % (Math.PI * 2), 0);
    dummy.scale.set(scale, scale * (0.95 + (i % 3) * 0.08), scale);
    dummy.updateMatrix();
    oakTrunkMesh.setMatrixAt(i, dummy.matrix);
    oakCanopyMesh.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.28 + ((i % 7) - 3) * 0.015, 0.34 + (i % 3) * 0.05, 0.60 + (i % 4) * 0.07);
    oakCanopyMesh.setColorAt(i, color);
  });
  oakTrunkMesh.instanceMatrix.needsUpdate = true;
  oakCanopyMesh.instanceMatrix.needsUpdate = true;
  oakCanopyMesh.instanceColor.needsUpdate = true;
  oakTrunkMesh.computeBoundingSphere();
  oakCanopyMesh.computeBoundingSphere();
  worldGroup.add(oakTrunkMesh, oakCanopyMesh);

  // Boulevard granite tree planter curbs + soil beds
  const planterCurbMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.75, 0.24, 1.75), concreteMat, planterPositions.length);
  const planterSoilMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.38, 0.26, 1.38),
    new THREE.MeshStandardMaterial({ color: 0x3b2d23, roughness: 0.96 }),
    planterPositions.length
  );
  planterPositions.forEach(([px, pz], i) => {
    dummy.position.set(px, 0.16, pz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    planterCurbMesh.setMatrixAt(i, dummy.matrix);
    planterSoilMesh.setMatrixAt(i, dummy.matrix);
  });
  planterCurbMesh.instanceMatrix.needsUpdate = true;
  planterSoilMesh.instanceMatrix.needsUpdate = true;
  planterCurbMesh.computeBoundingSphere();
  planterSoilMesh.computeBoundingSphere();
  worldGroup.add(planterCurbMesh, planterSoilMesh);

  // 7. Realistic Evergreen Conifer Pines
  const pineGeo = createRealisticPineGeometries();
  const pineLeafMat = new THREE.MeshStandardMaterial({
    map: textures.leafMap,
    bumpMap: textures.leafBump,
    bumpScale: 0.10,
    roughness: 0.82,
    metalness: 0.02,
  });
  applyWindShader(pineLeafMat, 0.032);

  const pineTrunkMesh = new THREE.InstancedMesh(pineGeo.trunkGeo, barkMat, pinePositions.length);
  const pineCanopyMesh = new THREE.InstancedMesh(pineGeo.canopyGeo, pineLeafMat, pinePositions.length);
  pineTrunkMesh.castShadow = true;
  pineCanopyMesh.castShadow = true;

  pinePositions.forEach(([px, pz, py], i) => {
    const scale = 0.90 + ((i * 23) % 52) / 100;
    dummy.position.set(px, py, pz);
    dummy.rotation.set(0, (i * 2.1) % (Math.PI * 2), 0);
    dummy.scale.set(scale, scale * 1.10, scale);
    dummy.updateMatrix();
    pineTrunkMesh.setMatrixAt(i, dummy.matrix);
    pineCanopyMesh.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.36 + (i % 4) * 0.012, 0.34, 0.44 + (i % 3) * 0.06);
    pineCanopyMesh.setColorAt(i, color);
  });
  pineTrunkMesh.instanceMatrix.needsUpdate = true;
  pineCanopyMesh.instanceMatrix.needsUpdate = true;
  pineCanopyMesh.instanceColor.needsUpdate = true;
  pineTrunkMesh.computeBoundingSphere();
  pineCanopyMesh.computeBoundingSphere();
  worldGroup.add(pineTrunkMesh, pineCanopyMesh);

  // 7b. Wild Shrubs & Bushes + Natural Boulders
  if (bushPositions.length > 0) {
    const bushMesh = new THREE.InstancedMesh(createBushGeometry(), oakLeafMat, bushPositions.length);
    bushPositions.forEach(([bx, bz, by], i) => {
      const s = 0.78 + (i % 4) * 0.18;
      dummy.position.set(bx, by, bz);
      dummy.rotation.set(0, i * 1.2, 0);
      dummy.scale.set(s, s * 0.9, s);
      dummy.updateMatrix();
      bushMesh.setMatrixAt(i, dummy.matrix);
      color.setHSL(0.27 + (i % 5) * 0.014, 0.38, 0.56 + (i % 3) * 0.07);
      bushMesh.setColorAt(i, color);
    });
    bushMesh.instanceMatrix.needsUpdate = true;
    bushMesh.instanceColor.needsUpdate = true;
    bushMesh.computeBoundingSphere();
    worldGroup.add(bushMesh);
  }

  if (rockPositions.length > 0) {
    const rockGeo = perturbGeo(new THREE.DodecahedronGeometry(1.1, 1), 0.30, 2.4, 1.7);
    const rockMat = new THREE.MeshStandardMaterial({ map: textures.stoneMap, color: 0x64748b, roughness: 0.92, metalness: 0.04 });
    const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rockPositions.length);
    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;
    rockPositions.forEach(([rx, rz, ry, rs], i) => {
      dummy.position.set(rx, ry, rz);
      dummy.rotation.set(i * 0.4, i * 1.1, i * 0.25);
      dummy.scale.set(rs * 1.15, rs * 0.72, rs * 0.95);
      dummy.updateMatrix();
      rockMesh.setMatrixAt(i, dummy.matrix);
    });
    rockMesh.instanceMatrix.needsUpdate = true;
    rockMesh.computeBoundingSphere();
    worldGroup.add(rockMesh);
  }

  // Sculpted Slatted-Mahogany & Wrought-Iron Park & Waterfront Promenade Benches
  for (let bx = 18; bx <= 118; bx += 12.5) {
    benchPositions.push([bx, 136.8, Math.PI]);
  }
  if (benchPositions.length > 0) {
    const benchWoodGeo = mergeTexturedParts([
      new THREE.BoxGeometry(1.56, 0.08, 0.48).translate(0, 0.44, 0.04),
      new THREE.BoxGeometry(1.56, 0.34, 0.07).rotateX(-0.18).translate(0, 0.72, -0.20),
    ]);
    const benchIronGeo = mergeTexturedParts([
      new THREE.BoxGeometry(0.08, 0.44, 0.46).translate(-0.68, 0.22, 0),
      new THREE.BoxGeometry(0.08, 0.44, 0.46).translate(0.68, 0.22, 0),
      new THREE.BoxGeometry(0.08, 0.30, 0.42).translate(-0.70, 0.56, -0.02),
      new THREE.BoxGeometry(0.08, 0.30, 0.42).translate(0.70, 0.56, -0.02),
    ]);
    const benchWoodMesh = new THREE.InstancedMesh(
      benchWoodGeo,
      new THREE.MeshStandardMaterial({ color: 0x8a4822, roughness: 0.72 }),
      benchPositions.length
    );
    const benchIronMesh = new THREE.InstancedMesh(
      benchIronGeo,
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.38, metalness: 0.78 }),
      benchPositions.length
    );
    benchWoodMesh.castShadow = true;
    benchPositions.forEach(([bx, bz, rot], i) => {
      dummy.position.set(bx, bz > 125 ? 0.28 : 0.13, bz);
      dummy.rotation.set(0, rot, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      benchWoodMesh.setMatrixAt(i, dummy.matrix);
      benchIronMesh.setMatrixAt(i, dummy.matrix);
    });
    benchWoodMesh.instanceMatrix.needsUpdate = true;
    benchIronMesh.instanceMatrix.needsUpdate = true;
    benchWoodMesh.computeBoundingSphere();
    benchIronMesh.computeBoundingSphere();
    worldGroup.add(benchWoodMesh, benchIronMesh);
  }

  // Ornamental Cedar & Cast-Stone Park Entrance Pergola Arbors across Formal Parks
  if (formalParkCoords.length > 0) {
    const pergolaStoneGeo = mergeTexturedParts([
      new THREE.CylinderGeometry(0.14, 0.18, 2.35, 8).translate(-1.35, 1.18, 0),
      new THREE.CylinderGeometry(0.14, 0.18, 2.35, 8).translate(1.35, 1.18, 0),
    ]);
    const pergolaTimberGeo = mergeTexturedParts([
      new THREE.BoxGeometry(3.3, 0.16, 0.26).translate(0, 2.42, 0),
      new THREE.BoxGeometry(0.14, 0.14, 1.1).translate(-1.05, 2.54, 0),
      new THREE.BoxGeometry(0.14, 0.14, 1.1).translate(-0.35, 2.54, 0),
      new THREE.BoxGeometry(0.14, 0.14, 1.1).translate(0.35, 2.54, 0),
      new THREE.BoxGeometry(0.14, 0.14, 1.1).translate(1.05, 2.54, 0),
    ]);
    const pergolaStoneMesh = new THREE.InstancedMesh(pergolaStoneGeo, concreteMat, formalParkCoords.length);
    const pergolaTimberMesh = new THREE.InstancedMesh(pergolaTimberGeo, timberMat, formalParkCoords.length);
    pergolaStoneMesh.castShadow = true;
    pergolaTimberMesh.castShadow = true;
    formalParkCoords.forEach(([ax, az], i) => {
      dummy.position.set(ax, 0.14, az - 5.15);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pergolaStoneMesh.setMatrixAt(i, dummy.matrix);
      pergolaTimberMesh.setMatrixAt(i, dummy.matrix);
    });
    pergolaStoneMesh.instanceMatrix.needsUpdate = true;
    pergolaTimberMesh.instanceMatrix.needsUpdate = true;
    worldGroup.add(pergolaStoneMesh, pergolaTimberMesh);
  }

  // 8. Instanced Arched Streetlights + Waterfront Promenade Lamps
  const lampCoords = [];
  for (const r of [-80, -40, 0, 40, 80]) {
    for (let d = -108; d <= 108; d += 27) {
      lampCoords.push([r + 4.3, d], [d, r + 4.3]);
    }
  }
  for (let wx = 12; wx <= 122; wx += 14) {
    lampCoords.push([wx, 134.2]);
  }
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.80, roughness: 0.28 });
  const poleMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.12, 4.5, 8), poleMat, lampCoords.length);
  const armMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.09, 0.09), poleMat, lampCoords.length);
  const housingMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.50, 0.12, 0.24), poleMat, lampCoords.length);
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xfbbf24,
    emissiveIntensity: 0.25,
    roughness: 0.15,
  });
  streetLampBulbs.push(bulbMat);

  const bulbMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.38, 0.08, 0.18), bulbMat, lampCoords.length);
  lampCoords.forEach(([lx, lz], i) => {
    dummy.position.set(lx, 2.25, lz);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poleMesh.setMatrixAt(i, dummy.matrix);

    dummy.position.set(lx - 0.42, 4.46, lz);
    dummy.updateMatrix();
    armMesh.setMatrixAt(i, dummy.matrix);

    dummy.position.set(lx - 0.82, 4.42, lz);
    dummy.updateMatrix();
    housingMesh.setMatrixAt(i, dummy.matrix);

    dummy.position.set(lx - 0.82, 4.35, lz);
    dummy.updateMatrix();
    bulbMesh.setMatrixAt(i, dummy.matrix);
  });
  [poleMesh, armMesh, housingMesh, bulbMesh].forEach((m) => {
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    worldGroup.add(m);
  });

  const streetLampCoords = lampCoords.map(([lx, lz]) => [lx - 0.82, 4.35, lz]);

  // 9. Boulevard Fire Hydrants (1 batched draw call for crisp street-level realism)
  if (hydrantPositions.length > 0) {
    const hydrantGeo = mergeTexturedParts([
      new THREE.CylinderGeometry(0.14, 0.16, 0.54, 8).translate(0, 0.27, 0),
      new THREE.SphereGeometry(0.14, 8, 6).translate(0, 0.54, 0),
      new THREE.CylinderGeometry(0.055, 0.055, 0.34, 6).rotateZ(Math.PI / 2).translate(0, 0.40, 0),
    ]);
    const hydrantMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.38, metalness: 0.35 });
    const hydrantMesh = new THREE.InstancedMesh(hydrantGeo, hydrantMat, hydrantPositions.length);
    hydrantPositions.forEach(([hx, hz], i) => {
      dummy.position.set(hx, 0.13, hz);
      dummy.rotation.set(0, (i * 0.8) % Math.PI, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      hydrantMesh.setMatrixAt(i, dummy.matrix);
    });
    hydrantMesh.instanceMatrix.needsUpdate = true;
    hydrantMesh.computeBoundingSphere();
    worldGroup.add(hydrantMesh);
  }

  // 10. Flock of 18 Soaring Coastal Seagulls circling the harbor bay (1 single InstancedMesh!)
  const gullGeo = mergeTexturedParts([
    new THREE.ConeGeometry(0.14, 0.72, 5).rotateX(Math.PI / 2),
    new THREE.BoxGeometry(0.85, 0.04, 0.24).rotateZ(0.28).translate(-0.42, 0.14, 0.04),
    new THREE.BoxGeometry(0.85, 0.04, 0.24).rotateZ(-0.28).translate(0.42, 0.14, 0.04),
  ]);
  const gullMesh = new THREE.InstancedMesh(
    gullGeo,
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45 }),
    18
  );
  gullMesh.frustumCulled = false;
  const gulls = Array.from({ length: 18 }, (_, i) => ({
    cx: -145 + (i % 6) * 28,
    cz: 168 + Math.floor(i / 6) * 22,
    rad: 11 + (i % 4) * 4.5,
    yBase: 14 + (i % 5) * 3.2,
    speed: 0.32 + (i % 3) * 0.09,
    phase: i * 1.15,
  }));
  worldGroup.add(gullMesh);

  scene.add(worldGroup);

  return {
    worldGroup,
    ocean,
    oceanUniforms: ocean.material.uniforms,
    streetLampBulbs,
    streetLampCoords,
    ambientWindowMaterials,
    roadMaterials,
    sigNSMat,
    sigEWMat,
    groundHeightAt,
    update(dt) {
      windUniforms.uTime.value += dt;
      oceanUniforms.uTime.value += dt;
      ocean.material.uniforms.time.value += dt;
      fountainWaterNormal.offset.x = (fountainWaterNormal.offset.x + dt * 0.045) % 1;
      fountainWaterNormal.offset.y = (fountainWaterNormal.offset.y + dt * 0.032) % 1;
      const t = oceanUniforms.uTime.value;

      // Rotate coastal headland lighthouse Fresnel beam & ATC tower radar scanner
      lhPivot.rotation.y += dt * 0.65;
      atcRadar.rotation.y += dt * 1.9;
      atcBeacon.visible = Math.sin(t * 5.2) > 0.25;
      const dl = oceanUniforms.uDaylight?.value ?? 1.0;
      lhBeamMat.opacity = 0.04 + (1.0 - dl) * 0.24;

      // Gentle Gerstner wave bobbing & bay drift for marina yachts & sailboats
      for (let i = 0; i < marinaVessels.length; i++) {
        const v = marinaVessels[i];
        const vx = v.driftAmp > 0 ? v.x + Math.sin(t * 0.12 + v.phase) * v.driftAmp : v.x;
        const vz = v.driftAmp > 0 ? v.z + Math.cos(t * 0.09 + v.phase) * 3.0 : v.z;
        const wave = Math.sin((0.32 * vx + 0.95 * vz) * 0.085 + t * 1.45) * 0.09;
        v.mesh.position.set(vx, -0.58 + wave, vz);
        v.mesh.rotation.z = Math.sin(t * 1.15 + v.phase) * 0.032;
        v.mesh.rotation.x = Math.cos(t * 1.40 + v.phase) * 0.022;
      }

      // Animate floating maritime harbor buoys bobbing with exact Gerstner swell profile
      buoySpecs.forEach((b, i) => {
        const waveY =
          -0.45 +
          Math.sin((0.32 * b.x + 0.95 * b.z) * 0.085 + t * 1.45) * 0.14 +
          Math.sin((-0.68 * b.x + 0.73 * b.z) * 0.145 + t * 1.85) * 0.095;
        const tiltX = Math.cos(b.x * 0.065 + t * 1.45) * 0.075;
        const tiltZ = Math.sin(b.z * 0.095 - t * 1.15) * 0.075;
        dummy.position.set(b.x, waveY, b.z);
        dummy.rotation.set(tiltX, 0, tiltZ);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        buoyBodyMesh.setMatrixAt(i, dummy.matrix);
        dummy.position.set(b.x - tiltZ * 1.25, waveY + 1.18, b.z + tiltX * 1.25);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        buoyBeaconMesh.setMatrixAt(i, dummy.matrix);
      });
      buoyBodyMesh.instanceMatrix.needsUpdate = true;
      buoyBeaconMesh.instanceMatrix.needsUpdate = true;

      // Animate soaring harbor seagulls gliding & gently banking over the bay
      for (let i = 0; i < gulls.length; i++) {
        const g = gulls[i];
        const a = t * g.speed + g.phase;
        const gx = g.cx + Math.cos(a) * g.rad;
        const gz = g.cz + Math.sin(a) * g.rad;
        const gy = g.yBase + Math.sin(a * 2.0 + g.phase) * 0.9;
        dummy.position.set(gx, gy, gz);
        dummy.rotation.set(Math.sin(t * 5.2 + g.phase) * 0.06, -a, 0.22);
        dummy.scale.set(1, 1 + Math.sin(t * 7.5 + g.phase) * 0.18, 1);
        dummy.updateMatrix();
        gullMesh.setMatrixAt(i, dummy.matrix);
      }
      gullMesh.instanceMatrix.needsUpdate = true;

      // Animate batched park fountain water plumes
      if (fountainSpoutMesh) {
        for (let i = 0; i < formalParkCoords.length; i++) {
          const [ax, az] = formalParkCoords[i];
          const pulse = 0.88 + 0.16 * Math.sin(t * 4.5 + i * 1.3);
          dummy.position.set(ax, 2.45, az);
          dummy.rotation.set(0, t * 1.8 + i, 0);
          dummy.scale.set(0.95 + 0.08 * Math.cos(t * 5.2 + i), pulse, 0.95 + 0.08 * Math.sin(t * 5.2 + i));
          dummy.updateMatrix();
          fountainSpoutMesh.setMatrixAt(i, dummy.matrix);
        }
        fountainSpoutMesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
