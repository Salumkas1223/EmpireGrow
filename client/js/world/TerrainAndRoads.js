import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
 * - City basin [-96..96, -96..96], harbor quay, and airstrip are graded flat at y = 0.
 * - South-West bay slopes organically through sandy beaches below sea level (-0.45m).
 * - North, East & West countryside rise into layered rolling hills & mountain ridges.
 */
export function groundHeightAt(x, z) {
  // Distance outside flat urban grid
  const dxCity = Math.max(0, Math.abs(x) - 99);
  const dzCity = Math.max(0, Math.abs(z) - 99);
  const cityDist = Math.hypot(dxCity, dzCity);

  // Keep coastal airstrip apron flat at (x in 96..140, z in -92..74)
  const dxAir = Math.max(0, Math.max(96 - x, x - 140));
  const dzAir = Math.max(0, Math.max(-92 - z, z - 74));
  const airDist = Math.hypot(dxAir, dzAir);

  // Keep harbor quay stone apron flat at (x in -116..6, z in 96..118)
  const dxQuay = Math.max(0, Math.max(-116 - x, x - 6));
  const dzQuay = Math.max(0, Math.max(96 - z, z - 118));
  const quayDist = Math.hypot(dxQuay, dzQuay);

  const flatMask = smoothstep(0, 18, Math.min(cityDist, airDist, quayDist));

  // South / South-West ocean bay depression
  const seaBlendZ = smoothstep(98, 138, z);
  const seaBlendX = 1.0 - smoothstep(42, 115, x);
  const seaMask = seaBlendZ * seaBlendX;

  // Multi-octave organic FBM ridge height
  const h1 = Math.sin(x * 0.017 + 0.5) * Math.cos(z * 0.015 - 0.3) * 14.0;
  const h2 = Math.sin(x * 0.036 - z * 0.028 + 1.2) * 6.8;
  const h3 = Math.cos(x * 0.078 + z * 0.065) * 2.4;
  const ridge = Math.abs(Math.sin(x * 0.011 - z * 0.009)) * 22.0;

  const distFromCenter = Math.hypot(x * 0.85, z);
  const outerLift = smoothstep(105, 290, distFromCenter) * (10.0 + ridge);

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

export function buildTerrainAndRoads(scene, textures) {
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

  // 1. Unified Continuous Sculpted Heightmap Terrain (920x920m, 160x160 grid) with Vertex-Color Biomes
  const terrainGeo = new THREE.PlaneGeometry(920, 920, 160, 160);
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

    // Biome vertex coloring: sandy coast -> urban meadow -> alpine forest -> granite ridge
    const isCoast = z > 95 && x < 75;
    if (y < 0.75 && isCoast) {
      // Wet-to-dry golden beach sand
      const dry = smoothstep(-1.4, 0.75, y);
      tmpCol.setRGB(0.62 + dry * 0.24, 0.56 + dry * 0.22, 0.42 + dry * 0.14);
    } else if (slope > 0.34 || y > 21) {
      // Exposed granite cliff rock & sunlit highland stone
      const rockTone = 0.44 + Math.min(0.24, (y - 12) * 0.008);
      tmpCol.setRGB(rockTone, rockTone * 0.99, rockTone * 0.96);
    } else {
      // Natural undulating meadow & mountain forest palette
      const elev = Math.min(1, y / 22);
      const patch = Math.sin(x * 0.045) * Math.cos(z * 0.045) * 0.06;
      tmpCol.setRGB(
        0.52 - elev * 0.14 + patch,
        0.64 - elev * 0.12 + patch * 0.6,
        0.44 - elev * 0.10
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
  terrainGrassMap.repeat.set(42, 42);
  const terrainGrassBump = textures.grassBump.clone();
  terrainGrassBump.needsUpdate = true;
  terrainGrassBump.repeat.set(42, 42);

  const terrainMat = new THREE.MeshStandardMaterial({
    map: terrainGrassMap,
    bumpMap: terrainGrassBump,
    bumpScale: 0.14,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.02,
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  worldGroup.add(terrainMesh);

  // 2. Realistic Animated Ocean Bay + Harbor Stone Pier + Coastal Boulders & Pilings (ZERO Buildings)
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x0c4a6e,
    bumpMap: textures.waterBump,
    bumpScale: 0.22,
    roughness: 0.09,
    metalness: 0.74,
    clearcoat: 0.92,
    clearcoatRoughness: 0.08,
  });
  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = oceanUniforms.uTime;
    shader.vertexShader = `uniform float uTime;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      transformed.z += sin(transformed.x * 0.07 + uTime * 1.45) * 0.09 + cos(transformed.y * 0.09 - uTime * 1.1) * 0.07;
      `
    );
  };

  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(920, 420, 72, 36), waterMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(-120, -0.45, 290);
  worldGroup.add(ocean);

  const pierMat = new THREE.MeshStandardMaterial({
    map: textures.stoneMap,
    bumpMap: textures.sidewalkBump,
    bumpScale: 0.04,
    color: 0x64748b,
    roughness: 0.82,
    metalness: 0.10,
  });
  const quay = new THREE.Mesh(new THREE.BoxGeometry(116, 1.6, 16), pierMat);
  quay.position.set(-55, -0.1, 108);
  quay.receiveShadow = true;
  worldGroup.add(quay);

  // Wooden harbor dock pilings + maritime navigation buoys
  const pilingGeo = new THREE.CylinderGeometry(0.24, 0.28, 2.2, 8);
  const pilingMat = new THREE.MeshStandardMaterial({ color: 0x453224, roughness: 0.9 });
  const pilings = new THREE.InstancedMesh(pilingGeo, pilingMat, 20);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < 20; i++) {
    dummy.position.set(-108 + i * 5.6, 0.1, 116.4);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    pilings.setMatrixAt(i, dummy.matrix);
  }
  pilings.instanceMatrix.needsUpdate = true;
  pilings.computeBoundingSphere();
  worldGroup.add(pilings);

  // Coastal airstrip tarmac pad ONLY (no terminal or tower buildings!)
  const tarmac = new THREE.Mesh(
    new THREE.BoxGeometry(34, 0.22, 160),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, bumpMap: textures.roadBump, bumpScale: 0.03, roughness: 0.85 })
  );
  tarmac.position.set(116, 0.02, -10);
  tarmac.receiveShadow = true;
  worldGroup.add(tarmac);

  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 148),
    new THREE.MeshStandardMaterial({ map: textures.runwayMap, bumpMap: textures.roadBump, bumpScale: 0.03, roughness: 0.78 })
  );
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(118, 0.15, -10);
  runway.receiveShadow = true;
  worldGroup.add(runway);

  const edgeBulbMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfacc15, emissiveIntensity: 1.8 });
  const edgeLights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 6, 6), edgeBulbMat, 24);
  for (let i = 0; i < 12; i++) {
    dummy.position.set(110.2, 0.24, -76 + i * 12);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    edgeLights.setMatrixAt(i * 2, dummy.matrix);
    dummy.position.set(125.8, 0.24, -76 + i * 12);
    dummy.updateMatrix();
    edgeLights.setMatrixAt(i * 2 + 1, dummy.matrix);
  }
  edgeLights.instanceMatrix.needsUpdate = true;
  edgeLights.computeBoundingSphere();
  worldGroup.add(edgeLights);

  // 3. Multi-Lane Urban Asphalt Road Grid + Raised 3D Granite Curbstones + Guardrails
  const roadLines = [-80, -40, 0, 40, 80];
  const roadMat = new THREE.MeshStandardMaterial({
    map: textures.roadMap,
    bumpMap: textures.roadBump,
    bumpScale: 0.045,
    roughness: 0.82,
    metalness: 0.06,
  });
  roadMaterials.push(roadMat);

  for (const pos of roadLines) {
    const roadNS = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 194), roadMat);
    roadNS.rotation.x = -Math.PI / 2;
    roadNS.position.set(pos, 0.025, 0);
    roadNS.receiveShadow = true;
    worldGroup.add(roadNS);

    const roadEW = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 194), roadMat);
    roadEW.rotation.x = -Math.PI / 2;
    roadEW.rotation.z = Math.PI / 2;
    roadEW.position.set(0, 0.032, pos);
    roadEW.receiveShadow = true;
    worldGroup.add(roadEW);
  }

  const interMat = new THREE.MeshStandardMaterial({
    map: textures.crosswalkMap,
    bumpMap: textures.roadBump,
    bumpScale: 0.04,
    roughness: 0.82,
    metalness: 0.06,
  });
  roadMaterials.push(interMat);
  for (const ix of roadLines) {
    for (const iz of roadLines) {
      const sq = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 8.6), interMat);
      sq.rotation.x = -Math.PI / 2;
      sq.position.set(ix, 0.045, iz);
      sq.receiveShadow = true;
      worldGroup.add(sq);
    }
  }

  // Southern Harbor Waterfront Highway Guardrail along z = 84.3
  const railPostMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.78, roughness: 0.34 });
  const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(3.8, 0.22, 0.12), railPostMat, 42);
  const railPostMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.65, 0.12), railPostMat, 42);
  for (let i = 0; i < 42; i++) {
    const rx = -82 + i * 4.0;
    dummy.position.set(rx, 0.56, 84.3);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    railMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(rx, 0.32, 84.3);
    dummy.updateMatrix();
    railPostMesh.setMatrixAt(i, dummy.matrix);
  }
  railMesh.instanceMatrix.needsUpdate = true;
  railPostMesh.instanceMatrix.needsUpdate = true;
  railMesh.computeBoundingSphere();
  railPostMesh.computeBoundingSphere();
  worldGroup.add(railMesh, railPostMesh);

  // 3b. Cantilevered Mast-Arm Traffic Signals at Central Intersections
  const signalCoords = [];
  for (const ix of [-40, 0, 40]) {
    for (const iz of [-40, 0, 40]) {
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

  // 4. Paved Block Sidewalks, 3D Granite Curbstones, Parks & Natural Undeveloped Greens (ZERO Pre-Built Buildings!)
  const blockCenters = [-60, -20, 20, 60];
  const sidewalkMat = new THREE.MeshStandardMaterial({
    map: textures.sidewalkMap,
    bumpMap: textures.sidewalkBump,
    bumpScale: 0.035,
    color: 0xcbd5e1,
    roughness: 0.84,
    metalness: 0.05,
  });
  const curbMat = new THREE.MeshStandardMaterial({
    map: textures.stoneMap,
    color: 0x94a3b8,
    roughness: 0.78,
    metalness: 0.08,
  });
  const concreteMat = new THREE.MeshStandardMaterial({ map: textures.stoneMap, color: 0x64748b, roughness: 0.75, metalness: 0.12 });

  const parkGrassMap = textures.grassMap.clone();
  parkGrassMap.needsUpdate = true;
  parkGrassMap.repeat.set(3, 3);
  const parkMat = new THREE.MeshStandardMaterial({
    map: parkGrassMap,
    bumpMap: textures.grassBump,
    bumpScale: 0.08,
    color: 0x94b586,
    roughness: 0.92,
    metalness: 0.02,
  });

  // 3D Granite Curbstone segments wrapping each 32x32 block (4 sides x 16 blocks = 64 curb beams)
  const curbMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(31.8, 0.17, 0.34), curbMat, 64);
  curbMesh.receiveShadow = true;
  let curbIdx = 0;

  const oakPositions = [];
  const planterPositions = [];
  const pinePositions = [];
  const bushPositions = [];
  const benchPositions = [];
  const rockPositions = [];

  for (const bz of blockCenters) {
    for (const bx of blockCenters) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(31.6, 0.14, 31.6), sidewalkMat);
      pad.position.set(bx, 0.06, bz);
      pad.receiveShadow = true;
      worldGroup.add(pad);

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

      // 4th Quadrant of every block (ax, az): NO pre-built buildings! Parks or natural open greens.
      const ax = bx + 7.5;
      const az = bz + 7.5;
      const isFormalPark = (Math.abs(bx + bz) === 80) || (bx === 20 && bz === 60) || (bx === -20 && bz === -20);

      const lawn = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.12, 12.2), parkMat);
      lawn.position.set(ax, 0.13, az);
      lawn.receiveShadow = true;
      worldGroup.add(lawn);

      if (isFormalPark) {
        const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.48, 18), concreteMat);
        basin.position.set(ax, 0.38, az);
        const water = new THREE.Mesh(new THREE.CylinderGeometry(1.82, 1.82, 0.54, 18), waterMat);
        water.position.set(ax, 0.40, az);
        worldGroup.add(basin, water);

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
  curbMesh.instanceMatrix.needsUpdate = true;
  curbMesh.computeBoundingSphere();
  worldGroup.add(curbMesh);

  // 5. Lush Hillside & Valley Forests + Coastal Boulders Grounded at Exact groundHeightAt(x, z)
  const validOutsideCity = (x, z) => {
    const inCity = Math.abs(x) < 103 && Math.abs(z) < 103;
    const inAirport = x > 94 && x < 142 && z > -94 && z < 76;
    const inQuay = x > -118 && x < 8 && z > 94 && z < 120;
    return !inCity && !inAirport && !inQuay;
  };

  // Pine forests along northern ridges, eastern slopes, and western foothills
  for (let i = 0; i < 360; i++) {
    const a = i * 2.39996;
    const rad = 112 + (i % 45) * 4.2;
    const px = Math.cos(a) * rad + Math.sin(i * 1.7) * 8;
    const pz = Math.sin(a) * rad + Math.cos(i * 1.3) * 8;
    if (!validOutsideCity(px, pz)) continue;
    const py = groundHeightAt(px, pz);
    if (py < 0.8 || py > 26) continue;
    pinePositions.push([px, pz, py]);
    if (i % 3 === 0) {
      bushPositions.push([px + 2.4, pz - 1.8, groundHeightAt(px + 2.4, pz - 1.8)]);
    }
  }

  // Valley & meadow broadleaf oaks outside the city
  for (let i = 0; i < 95; i++) {
    const px = -210 + ((i * 67) % 440);
    const pz = -210 + ((i * 109) % 340);
    if (!validOutsideCity(px, pz)) continue;
    const py = groundHeightAt(px, pz);
    if (py < 0.6 || py > 12) continue;
    oakPositions.push([px, pz, py]);
  }

  // Breakwater & hillside rock outcrops
  for (let i = 0; i < 24; i++) {
    const rx = -110 + i * 5.1;
    const rz = 117.5 + Math.sin(i * 1.7) * 1.2;
    rockPositions.push([rx, rz, -0.1, 1.0 + (i % 3) * 0.3]);
  }
  for (let i = 0; i < 75; i++) {
    const a = i * 1.93;
    const rad = 118 + (i % 30) * 5.2;
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

  // Park benches
  if (benchPositions.length > 0) {
    const benchMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.5, 0.45, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.78 }),
      benchPositions.length
    );
    benchPositions.forEach(([bx, bz, rot], i) => {
      dummy.position.set(bx, 0.36, bz);
      dummy.rotation.set(0, rot, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      benchMesh.setMatrixAt(i, dummy.matrix);
    });
    benchMesh.instanceMatrix.needsUpdate = true;
    benchMesh.computeBoundingSphere();
    worldGroup.add(benchMesh);
  }

  // 8. Instanced Arched Streetlights
  const lampCoords = [];
  for (const r of [-40, 0, 40]) {
    for (let d = -72; d <= 72; d += 24) {
      lampCoords.push([r + 4.3, d], [d, r + 4.3]);
    }
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

  scene.add(worldGroup);

  return {
    worldGroup,
    streetLampBulbs,
    ambientWindowMaterials,
    roadMaterials,
    sigNSMat,
    sigEWMat,
    groundHeightAt,
    update(dt) {
      windUniforms.uTime.value += dt;
      oceanUniforms.uTime.value += dt;
    },
  };
}
