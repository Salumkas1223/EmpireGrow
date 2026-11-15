import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COSMETICS } from '../../../shared/gameData.ts';

const cosmeticMap = new Map(COSMETICS.map((c) => [c.id, c]));

function mergeCraneParts(parts) {
  const cleaned = parts.map((g) => {
    if (g.index && !g.attributes.normal) g.computeVertexNormals();
    const ng = g.index ? g.toNonIndexed() : g.clone();
    if (ng.attributes.uv) ng.deleteAttribute('uv');
    return ng;
  });
  const merged = mergeGeometries(cleaned, false);
  cleaned.forEach((g) => g.dispose());
  return merged;
}

function makeStrut(x1, y1, z1, x2, y2, z2, r = 0.045) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dy, dz);
  const g = new THREE.BoxGeometry(r * 2, len, r * 2);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(dx, dy, dz).normalize()
  );
  g.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3((x1 + x2) * 0.5, (y1 + y2) * 0.5, (z1 + z2) * 0.5),
      q,
      new THREE.Vector3(1, 1, 1)
    )
  );
  return g;
}

function createBeveledRectGeo(w, d, h, bevel = 0.14) {
  const hw = Math.max(0.1, w / 2 - bevel);
  const hd = Math.max(0.1, d / 2 - bevel);
  const s = new THREE.Shape();
  s.moveTo(-hw, -hd);
  s.lineTo(hw, -hd);
  s.lineTo(hw, hd);
  s.lineTo(-hw, hd);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.05, h - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevel, 0);
  geo.computeVertexNormals();
  return geo;
}

export function createBuildingModel(buildingData, textures) {
  const {
    building_type: type,
    level = 1,
    skin_id: skinId = 'skin_default',
    custom_color: customColor = '',
    is_constructing: isConstructing = 0,
  } = buildingData;

  const group = new THREE.Group();
  const animatedParts = [];
  const smokeEmitters = [];

  const cos = cosmeticMap.get(skinId) || COSMETICS[0];
  const baseHex = customColor || cos.primaryColor;
  const accentHex = cos.accentColor;

  const metalCladMat = new THREE.MeshStandardMaterial({
    color: baseHex,
    roughness: 0.30,
    metalness: 0.75,
    envMapIntensity: 1.30,
  });
  const corrugatedMat = new THREE.MeshStandardMaterial({
    map: textures.corrugatedMap,
    bumpMap: textures.corrugatedBump,
    bumpScale: 0.06,
    color: baseHex,
    roughness: 0.42,
    metalness: 0.65,
    envMapIntensity: 1.20,
  });
  const brickMat = new THREE.MeshStandardMaterial({
    map: textures.brickMap,
    bumpMap: textures.brickBump,
    bumpScale: 0.06,
    roughness: 0.84,
    metalness: 0.04,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    map: textures.roofGravelMap,
    roughness: 0.90,
    metalness: 0.04,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xe6f2ff,
    map: textures.windowMap,
    emissiveMap: textures.windowEmissive,
    bumpMap: textures.windowBump,
    bumpScale: 0.08,
    roughnessMap: textures.windowRough,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.32,
    roughness: 0.085,
    metalness: 0.84,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.55,
  });
  const facadeMat = new THREE.MeshStandardMaterial({
    map: textures.facadeMap,
    emissiveMap: textures.facadeEmissive,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.28,
    roughness: 0.64,
    metalness: 0.14,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    roughness: 0.20,
    metalness: 0.88,
    envMapIntensity: 1.40,
  });
  const darkSteelMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.32,
    metalness: 0.85,
    envMapIntensity: 1.25,
  });
  const stoneMat = new THREE.MeshStandardMaterial({
    map: textures.stoneMap,
    bumpMap: textures.sidewalkBump,
    bumpScale: 0.045,
    color: 0xd6dee8,
    roughness: 0.74,
    metalness: 0.06,
  });
  const lobbyGlowMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    emissive: 0xfef3c7,
    emissiveIntensity: 0.82,
    roughness: 0.12,
    metalness: 0.45,
    envMapIntensity: 1.25,
  });
  const crownGlowMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.45,
    roughness: 0.2,
    metalness: 0.5,
  });
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xef4444,
    emissiveIntensity: 2.2,
    roughness: 0.2,
  });
  const hedgeMat = new THREE.MeshStandardMaterial({
    map: textures.leafMap,
    bumpMap: textures.leafBump,
    bumpScale: 0.08,
    color: 0x4d7c3f,
    roughness: 0.86,
  });

  // Grounding contact shadow under entire plot footprint
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(12.2, 12.2),
    new THREE.MeshBasicMaterial({ map: textures.contactShadow, transparent: true, depthWrite: false, opacity: 0.64 })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.02;
  group.add(shadowPlane);

  const modelRoot = new THREE.Group();
  const lvlBoost = 1 + (level - 1) * 0.22;

  const addParapetRoof = (w, d, y, hasHvac = true) => {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.12, d - 0.3), roofMat);
    deck.position.y = y + 0.06;
    deck.receiveShadow = true;
    modelRoot.add(deck);

    const wallT = 0.22;
    const wallH = 0.34;
    const nWall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, wallT), stoneMat);
    nWall.position.set(0, y + wallH / 2, -d / 2 + wallT / 2);
    const sWall = nWall.clone();
    sWall.position.z = d / 2 - wallT / 2;
    const wWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, d - wallT * 2), stoneMat);
    wWall.position.set(-w / 2 + wallT / 2, y + wallH / 2, 0);
    const eWall = wWall.clone();
    eWall.position.x = w / 2 - wallT / 2;
    modelRoot.add(nWall, sWall, wWall, eWall);

    if (hasHvac) {
      const hvac = new THREE.Mesh(new THREE.BoxGeometry(Math.min(2.2, w * 0.34), 0.72, Math.min(1.6, d * 0.28)), metalCladMat);
      hvac.position.set(-w * 0.18, y + 0.42, d * 0.14);
      hvac.castShadow = true;
      const fanHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.22, 12), darkSteelMat);
      fanHousing.position.set(-w * 0.18, y + 0.82, d * 0.14);
      const fanRotor = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.04, 0.11), trimMat);
      fanRotor.position.set(-w * 0.18, y + 0.94, d * 0.14);
      animatedParts.push({ mesh: fanRotor, axis: 'y', speed: 6.5 });
      modelRoot.add(hvac, fanHousing, fanRotor);
    }
  };

  if (type === 'solar_station') {
    const plinth = new THREE.Mesh(createBeveledRectGeo(11.0, 11.0, 0.42, 0.1), stoneMat);
    plinth.receiveShadow = true;
    modelRoot.add(plinth);

    const panelMat = new THREE.MeshPhysicalMaterial({
      map: textures.solarMap,
      roughness: 0.10,
      metalness: 0.68,
      clearcoat: 0.95,
    });
    for (let r = -1; r <= 1; r++) {
      const standL = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 1.15, 8), darkSteelMat);
      standL.position.set(-2.6, 0.85, r * 3.0);
      const standR = standL.clone();
      standR.position.x = 2.6;
      const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.12, 0.14), darkSteelMat);
      crossBeam.position.set(0, 1.28, r * 3.0);
      const rack = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.14, 2.25), panelMat);
      rack.position.set(0, 1.42, r * 3.0);
      rack.rotation.x = 0.38;
      rack.castShadow = true;
      modelRoot.add(standL, standR, crossBeam, rack);
    }

    const substation = new THREE.Mesh(createBeveledRectGeo(2.9, 2.7, 2.2 * lvlBoost, 0.12), metalCladMat);
    substation.position.set(-3.4, 0.38, -3.5);
    substation.castShadow = true;
    const transformer = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.5, 1.1), darkSteelMat);
    transformer.position.set(-1.1, 1.12, -3.6);
    // High-voltage ceramic bushings
    for (const bx of [-1.35, -1.1, -0.85]) {
      const bushing = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.65, 8), trimMat);
      bushing.position.set(bx, 2.15, -3.6);
      modelRoot.add(bushing);
    }

    const mastH = 6.8 + level * 0.9;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.32, mastH, 12), stoneMat);
    mast.position.set(3.5, mastH / 2 + 0.38, -3.4);
    mast.castShadow = true;
    const nacelle = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.85, 6, 10), metalCladMat);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(3.5, mastH + 0.38, -3.4);
    const hub = new THREE.Group();
    hub.position.set(3.5, mastH + 0.38, -2.62);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.65, 10), trimMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.22;
    hub.add(nose);
    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.75, 0.06), trimMat);
      blade.position.y = 1.38;
      blade.rotation.y = 0.18;
      const pivot = new THREE.Group();
      pivot.rotation.z = (b * Math.PI * 2) / 3;
      pivot.add(blade);
      hub.add(pivot);
    }
    animatedParts.push({ mesh: hub, axis: 'z', speed: 2.3 });
    modelRoot.add(substation, transformer, mast, nacelle, hub);
  } else if (type === 'workshop_factory' || type === 'ev_gigafactory' || type === 'food_campus') {
    const h = (type === 'ev_gigafactory' ? 5.0 : 3.8) * lvlBoost;
    const basePlinth = new THREE.Mesh(createBeveledRectGeo(11.0, 10.8, 0.45, 0.1), stoneMat);
    basePlinth.receiveShadow = true;

    const mainHall = new THREE.Mesh(new THREE.BoxGeometry(10.0, h, 7.6), corrugatedMat);
    mainHall.position.set(0, h / 2 + 0.45, 0.8);
    mainHall.castShadow = true;
    mainHall.receiveShadow = true;

    // External structural steel I-beam columns along side walls
    for (let sx = -4.6; sx <= 4.6; sx += 2.3) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.24, h + 0.1, 7.86), darkSteelMat);
      col.position.set(sx, h / 2 + 0.45, 0.8);
      modelRoot.add(col);
    }

    // Clerestory sawtooth glass roof bays
    for (let i = -1; i <= 1; i++) {
      const bay = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.15, 6.8), metalCladMat);
      bay.position.set(i * 3.1, h + 0.72, 0.8);
      bay.rotation.z = 0.24;
      const skylight = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.98, 6.6), glassMat);
      skylight.position.set(i * 3.1 + 1.28, h + 0.76, 0.8);
      modelRoot.add(bay, skylight);
    }

    // Loading dock bays + overhead canopy + yellow dock bollards
    const dockCanopy = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.22, 1.9), trimMat);
    dockCanopy.position.set(-1.1, 2.8, 5.1);
    for (let d = 0; d < 3; d++) {
      const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.85, 2.25, 0.22), darkSteelMat);
      doorFrame.position.set(-3.4 + d * 2.2, 1.56, 4.6);
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.55, 2.0, 0.26), corrugatedMat);
      door.position.set(-3.4 + d * 2.2, 1.48, 4.62);
      const bollardL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 8), new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 }));
      bollardL.position.set(-4.35 + d * 2.2, 0.8, 4.95);
      modelRoot.add(doorFrame, door, bollardL);
    }

    // Industrial silos & overhead pipework bridge
    for (const sx of [-3.6, -2.0]) {
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, h + 1.5, 16), stoneMat);
      silo.position.set(sx, (h + 1.5) / 2 + 0.45, -3.7);
      silo.castShadow = true;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.72, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), trimMat);
      dome.position.set(sx, h + 1.95, -3.7);
      modelRoot.add(silo, dome);
    }
    const pipeBridge = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3.2, 10), darkSteelMat);
    pipeBridge.rotation.x = Math.PI / 2;
    pipeBridge.position.set(-2.8, h + 0.65, -2.1);
    modelRoot.add(pipeBridge);

    // Twin tapered smokestacks with aviation warning collars
    for (const sx of [1.6, 3.6]) {
      const stackH = h + 4.3;
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.66, stackH, 16), brickMat);
      stack.position.set(sx, stackH / 2 + 0.45, -3.6);
      stack.castShadow = true;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.65, 16), beaconMat);
      band.position.set(sx, stackH - 0.45, -3.6);
      modelRoot.add(stack, band);
      smokeEmitters.push(new THREE.Vector3(sx, stackH + 0.55, -3.6));
    }

    modelRoot.add(basePlinth, mainHall, dockCanopy);
  } else if (type === 'logistics_hub') {
    const h = 3.5 * lvlBoost;
    const plinth = new THREE.Mesh(createBeveledRectGeo(11.0, 10.8, 0.38, 0.1), stoneMat);
    plinth.receiveShadow = true;

    const warehouse = new THREE.Mesh(new THREE.BoxGeometry(10.2, h, 6.2), corrugatedMat);
    warehouse.position.set(0, h / 2 + 0.38, -1.4);
    warehouse.castShadow = true;
    warehouse.receiveShadow = true;
    addParapetRoof(10.2, 6.2, h + 0.38, true);

    const officeWing = new THREE.Mesh(createBeveledRectGeo(4.4, 3.4, h + 2.2, 0.12), glassMat);
    officeWing.position.set(-2.8, 0.38, 3.2);
    officeWing.castShadow = true;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.2, 1.4), trimMat);
    canopy.position.set(-2.8, 2.2, 5.1);

    // Corrugated freight container stacks
    const contColors = [0x0284c7, 0xd97706, 0x059669];
    for (let c = 0; c < 3; c++) {
      const cMat = new THREE.MeshStandardMaterial({
        map: textures.corrugatedMap,
        bumpMap: textures.corrugatedBump,
        bumpScale: 0.05,
        color: contColors[c],
        roughness: 0.45,
        metalness: 0.42,
      });
      const cont = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.35, 3.3), cMat);
      cont.position.set(0.6 + c * 1.95, 1.06, 3.1);
      cont.castShadow = true;
      modelRoot.add(cont);
    }
    modelRoot.add(plinth, warehouse, officeWing, canopy);
  } else if (type === 'tech_lab' || type === 'ai_datacenter') {
    const h = (type === 'ai_datacenter' ? 7.0 : 5.8) * lvlBoost;
    const podium = new THREE.Mesh(createBeveledRectGeo(10.6, 10.6, 1.8, 0.14), stoneMat);
    podium.castShadow = true;
    podium.receiveShadow = true;
    const lobby = new THREE.Mesh(new THREE.BoxGeometry(9.2, 1.4, 10.75), lobbyGlowMat);
    lobby.position.y = 0.85;

    const core = new THREE.Mesh(createBeveledRectGeo(7.8, 7.8, h, 0.16), glassMat);
    core.position.y = 1.8;
    core.castShadow = true;

    // Anodized exoskeleton brise-soleil fins
    for (let i = -1; i <= 1; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(8.5, h + 0.7, 0.28), trimMat);
      fin.position.set(0, 1.8 + (h + 0.7) / 2, i * 2.5);
      modelRoot.add(fin);
    }

    const roofY = 1.8 + h;
    addParapetRoof(7.8, 7.8, roofY, false);

    // Emissive Architectural Crown Rim
    const crownBand = new THREE.Mesh(new THREE.BoxGeometry(8.05, 0.22, 8.05), crownGlowMat);
    crownBand.position.y = roofY - 0.15;

    // Chiller cooling bank with spinning axial fan
    const chiller = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.15, 2.6), metalCladMat);
    chiller.position.set(-1.3, roofY + 0.62, -1.2);
    const dishBase = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.48, 1.2, 10), stoneMat);
    dishBase.position.set(2.0, roofY + 0.65, 2.0);
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 0.35, 0.85, 16), trimMat);
    dish.position.set(2.0, roofY + 1.45, 2.0);
    dish.rotation.x = 0.45;
    animatedParts.push({ mesh: dish, axis: 'y', speed: 1.5 });
    modelRoot.add(podium, lobby, core, crownBand, chiller, dishBase, dish);
  } else if (type === 'retail_plaza') {
    const h = 4.6 * lvlBoost;
    const plaza = new THREE.Mesh(createBeveledRectGeo(11.0, 10.8, 0.42, 0.1), stoneMat);
    plaza.receiveShadow = true;
    const groundShop = new THREE.Mesh(new THREE.BoxGeometry(9.9, 1.75, 8.9), lobbyGlowMat);
    groundShop.position.y = 1.3;
    const atrium = new THREE.Mesh(createBeveledRectGeo(9.6, 8.6, h, 0.14), glassMat);
    atrium.position.y = 0.42;
    atrium.castShadow = true;

    // Warm brick corner piers & storefront planters
    for (const cx of [-4.6, 4.6]) {
      for (const cz of [-4.1, 4.1]) {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(0.95, h + 0.25, 0.95), brickMat);
        pier.position.set(cx, 0.42 + (h + 0.25) / 2, cz);
        modelRoot.add(pier);
      }
    }
    for (const px of [-3.2, 3.2]) {
      const bush = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.52, 0.65), hedgeMat);
      bush.position.set(px, 0.68, 4.85);
      modelRoot.add(bush);
    }

    const roofY = h + 0.42;
    addParapetRoof(9.6, 8.6, roofY, false);
    const glassDome = new THREE.Mesh(
      new THREE.SphereGeometry(2.75, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      glassMat
    );
    glassDome.position.y = roofY + 0.1;
    const pylon = new THREE.Mesh(createBeveledRectGeo(1.05, 1.05, h + 2.8, 0.1), metalCladMat);
    pylon.position.set(4.1, 0.42, 3.8);
    modelRoot.add(plaza, groundShop, atrium, glassDome, pylon);
  } else {
    // Architectural High-Rise Towers: startup_office, residential_tower, bank_hq, global_skyscraper
    const baseHeightMap = {
      startup_office: 6.2,
      residential_tower: 11.8,
      bank_hq: 16.2,
      global_skyscraper: 22.4,
    };
    const h = (baseHeightMap[type] || 8.4) * lvlBoost;
    const isRes = type === 'residential_tower' || type === 'startup_office';

    // 1. Chamfered Granite Podium + Recessed Illuminated Lobby + Entrance Canopy
    const podium = new THREE.Mesh(createBeveledRectGeo(10.6, 10.6, 2.4, 0.14), isRes ? brickMat : stoneMat);
    podium.castShadow = true;
    podium.receiveShadow = true;
    const lobby = new THREE.Mesh(new THREE.BoxGeometry(9.2, 1.85, 10.72), lobbyGlowMat);
    lobby.position.y = 1.05;
    const entranceCanopy = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.24, 2.3), trimMat);
    entranceCanopy.position.set(0, 2.22, 5.65);

    // 2. Lower & Mid Shaft
    const lowerH = h * 0.66;
    const lowerMat = type === 'startup_office' ? facadeMat : glassMat;
    const lowerShaft = new THREE.Mesh(createBeveledRectGeo(8.2, 8.2, lowerH, 0.16), lowerMat);
    lowerShaft.position.y = 2.4;
    lowerShaft.castShadow = true;
    lowerShaft.receiveShadow = true;

    // 4 Corner Structural Aluminum/Steel Columns
    for (const cx of [-4.05, 4.05]) {
      for (const cz of [-4.05, 4.05]) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.56, lowerH + 0.35, 0.56), metalCladMat);
        col.position.set(cx, 2.4 + lowerH / 2, cz);
        modelRoot.add(col);
      }
    }

    // Wraparound Balconies on Residential Towers & Startup Offices
    if (isRes) {
      const tiers = Math.max(2, Math.floor(lowerH / 2.2));
      for (let t = 1; t <= tiers; t++) {
        const by = 2.4 + t * 2.15;
        if (by > 2.4 + lowerH - 0.6) break;
        const slab = new THREE.Mesh(new THREE.BoxGeometry(8.95, 0.16, 8.95), stoneMat);
        slab.position.y = by;
        const rail = new THREE.Mesh(new THREE.BoxGeometry(9.05, 0.34, 9.05), darkSteelMat);
        rail.position.y = by + 0.22;
        modelRoot.add(slab, rail);
      }
    }

    // 3. Setback Upper Tier
    const upperH = h * 0.34;
    const setbackTrim = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.42, 8.6), trimMat);
    setbackTrim.position.y = 2.4 + lowerH;
    const upperShaft = new THREE.Mesh(createBeveledRectGeo(6.4, 6.4, upperH, 0.15), glassMat);
    upperShaft.position.y = 2.4 + lowerH;
    upperShaft.castShadow = true;

    // 4. Parapet Roof + Mechanical Penthouse + Helipad + Mast
    const roofY = 2.4 + lowerH + upperH;
    addParapetRoof(6.4, 6.4, roofY, true);

    if (type === 'bank_hq' || type === 'global_skyscraper') {
      const helipad = new THREE.Mesh(
        new THREE.CylinderGeometry(2.25, 2.25, 0.2, 22),
        new THREE.MeshStandardMaterial({ map: textures.helipadMap, roughness: 0.62 })
      );
      helipad.position.set(-0.9, roofY + 0.35, 0.6);
      modelRoot.add(helipad);
    }

    const mechBox = new THREE.Mesh(createBeveledRectGeo(2.3, 2.3, 1.5, 0.1), stoneMat);
    mechBox.position.set(1.4, roofY + 0.12, -1.2);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.28, 4.8 + level * 0.8, 10), trimMat);
    spire.position.set(1.4, roofY + 1.6 + (4.8 + level * 0.8) / 2, -1.2);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), beaconMat);
    beacon.position.set(1.4, roofY + 1.6 + 4.8 + level * 0.8, -1.2);

    // Architectural Skyline Crown Accent + Vertical Pilaster Fins + Ground Planters & Uplight Bollards
    if (type === 'bank_hq' || type === 'global_skyscraper') {
      const crownRim = new THREE.Mesh(new THREE.BoxGeometry(6.62, 0.26, 6.62), crownGlowMat);
      crownRim.position.y = roofY - 0.14;
      modelRoot.add(crownRim);
      for (const pf of [-1.7, 1.7]) {
        const finNS = new THREE.Mesh(new THREE.BoxGeometry(0.18, lowerH + 0.25, 8.46), trimMat);
        finNS.position.set(pf, 2.4 + lowerH / 2, 0);
        const finEW = new THREE.Mesh(new THREE.BoxGeometry(8.46, lowerH + 0.25, 0.18), trimMat);
        finEW.position.set(0, 2.4 + lowerH / 2, pf);
        modelRoot.add(finNS, finEW);
      }
    }
    for (const px of [-3.6, 3.6]) {
      const planter = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.42, 0.85), stoneMat);
      planter.position.set(px, 0.21, 5.6);
      const shrub = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.36, 0.65), hedgeMat);
      shrub.position.set(px, 0.54, 5.6);
      modelRoot.add(planter, shrub);
    }
    for (const lx of [-2.4, 2.4]) {
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.65, 8), darkSteelMat);
      bollard.position.set(lx, 0.32, 5.75);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.14, 8), lobbyGlowMat);
      lens.position.set(lx, 0.56, 5.75);
      modelRoot.add(bollard, lens);
    }

    modelRoot.add(podium, lobby, entranceCanopy, lowerShaft, setbackTrim, upperShaft, mechBox, spire, beacon);
  }

  group.add(modelRoot);

  // Realistic Construction Site: Steel Structural Skeleton + Perimeter Hoarding + Detailed Lattice Tower Crane
  let craneBoom = null;
  let scaffoldGroup = null;
  if (isConstructing) {
    scaffoldGroup = new THREE.Group();
    const steelFrameMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.42, metalness: 0.78 });
    const hoistMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.45, metalness: 0.4 });

    // Structural perimeter steel columns & floor beams
    for (const cx of [-4.6, 0, 4.6]) {
      for (const cz of [-4.6, 0, 4.6]) {
        if (cx === 0 && cz === 0) continue;
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.22, 7.6, 0.22), steelFrameMat);
        col.position.set(cx, 3.8, cz);
        scaffoldGroup.add(col);
      }
    }
    for (const fy of [2.6, 5.2, 7.6]) {
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.22, 0.22), steelFrameMat);
      b1.position.set(0, fy, 4.6);
      const b2 = b1.clone();
      b2.position.z = -4.6;
      const b3 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 9.4), steelFrameMat);
      b3.position.set(-4.6, fy, 0);
      const b4 = b3.clone();
      b4.position.x = 4.6;
      scaffoldGroup.add(b1, b2, b3, b4);
    }

    // 4-sided Construction Site Safety Hoarding + Corner Posts + Material Stack
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.78 });
    const safetyOrangeMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.42, metalness: 0.25 });
    for (const zSide of [-5.45, 5.45]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(10.9, 0.85, 0.10), fenceMat);
      wall.position.set(0, 0.42, zSide);
      const topRail = new THREE.Mesh(new THREE.BoxGeometry(10.95, 0.14, 0.13), safetyOrangeMat);
      topRail.position.set(0, 0.88, zSide);
      scaffoldGroup.add(wall, topRail);
    }
    for (const xSide of [-5.45, 5.45]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.85, 10.9), fenceMat);
      wall.position.set(xSide, 0.42, 0);
      const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.14, 10.95), safetyOrangeMat);
      topRail.position.set(xSide, 0.88, 0);
      scaffoldGroup.add(wall, topRail);
    }

    // European Open-Lattice Hammerhead Tower Crane (Baukran)
    const craneYellowMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.34, metalness: 0.56 });
    const hazardMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.38, metalness: 0.3 });
    const concreteMat = new THREE.MeshStandardMaterial({
      map: textures.stoneMap,
      color: 0x94a3b8,
      roughness: 0.88,
      metalness: 0.04,
    });
    const cabGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      emissive: 0xfde68a,
      emissiveIntensity: 0.55,
      roughness: 0.08,
      metalness: 0.35,
      clearcoat: 1.0,
    });

    const craneX = 4.55;
    const craneZ = 4.55;

    // 1. Cruciform Ballast Base + Precast Concrete Counter-Blocks
    const baseParts = [];
    const crossA = new THREE.BoxGeometry(2.6, 0.24, 0.38);
    crossA.translate(0, 0.18, 0);
    crossA.rotateY(Math.PI / 4);
    const crossB = crossA.clone();
    crossB.rotateY(Math.PI / 2);
    baseParts.push(crossA, crossB);
    for (const [px, pz] of [[-0.88, -0.88], [0.88, -0.88], [-0.88, 0.88], [0.88, 0.88]]) {
      const pad = new THREE.BoxGeometry(0.36, 0.14, 0.36);
      pad.translate(px, 0.07, pz);
      baseParts.push(pad);
    }
    const baseSteelMesh = new THREE.Mesh(mergeCraneParts(baseParts), darkSteelMat);
    baseSteelMesh.position.set(craneX, 0, craneZ);

    const ballast = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.58, 1.45), concreteMat);
    ballast.position.set(craneX, 0.42, craneZ);
    ballast.castShadow = true;

    // 2. Open 3D Steel Lattice Mast (4 corner chords + horizontal frames + X/Warren diagonals)
    const mastParts = [];
    const mw = 0.38; // Half-width of 0.76m square mast
    const mastBottom = 0.65;
    const bayH = 1.35;
    const bays = 10; // Reaches y = 14.15m
    const corners = [[-mw, -mw], [mw, -mw], [mw, mw], [-mw, mw]];

    for (const [cx, cz] of corners) {
      mastParts.push(makeStrut(cx, mastBottom, cz, cx, mastBottom + bays * bayH, cz, 0.048));
    }
    for (let b = 0; b <= bays; b++) {
      const y = mastBottom + b * bayH;
      for (let c = 0; c < 4; c++) {
        const [x1, z1] = corners[c];
        const [x2, z2] = corners[(c + 1) % 4];
        mastParts.push(makeStrut(x1, y, z1, x2, y, z2, 0.032));
        if (b < bays) {
          const yn = y + bayH;
          if (b % 2 === 0) {
            mastParts.push(makeStrut(x1, y, z1, x2, yn, z2, 0.026));
          } else {
            mastParts.push(makeStrut(x2, y, z2, x1, yn, z1, 0.026));
          }
        }
      }
    }
    const mastMesh = new THREE.Mesh(mergeCraneParts(mastParts), craneYellowMat);
    mastMesh.position.set(craneX, 0, craneZ);
    mastMesh.castShadow = true;

    // Slewing Ring Bearing & Telescoping Climbing Cage Collar
    const slewingRing = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.54, 0.46, 16), darkSteelMat);
    slewingRing.position.set(craneX, mastBottom + bays * bayH + 0.18, craneZ);
    const climbCollar = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.85, 1.06), craneYellowMat);
    climbCollar.position.set(craneX, mastBottom + bays * bayH - 1.15, craneZ);

    // 3. Slewing Upper Jib Assembly (pivots around y = 14.55m)
    const slewingY = mastBottom + bays * bayH + 0.42;
    craneBoom = new THREE.Group();
    craneBoom.position.set(craneX, slewingY, craneZ);

    // Triangular Open-Lattice Main Jib (-X forward 9.8m) + Counter-Jib (+X aft 4.2m) + A-Frame Cathead
    const boomParts = [];
    const jibLen = 9.8;
    const jibSegs = 8;
    const jibHalfW = 0.34;
    const jibH = 0.68;

    // Main Jib bottom chords & top ridge chord (inverted-V triangular truss)
    boomParts.push(makeStrut(0.5, 0, -jibHalfW, -jibLen, 0, -jibHalfW * 0.65, 0.036));
    boomParts.push(makeStrut(0.5, 0, jibHalfW, -jibLen, 0, jibHalfW * 0.65, 0.036));
    boomParts.push(makeStrut(0.5, jibH, 0, -jibLen, jibH * 0.58, 0, 0.042));

    for (let s = 0; s < jibSegs; s++) {
      const t0 = s / jibSegs;
      const t1 = (s + 1) / jibSegs;
      const x0 = 0.5 - t0 * (jibLen + 0.5);
      const x1 = 0.5 - t1 * (jibLen + 0.5);
      const w0 = jibHalfW * (1 - t0 * 0.35);
      const w1 = jibHalfW * (1 - t1 * 0.35);
      const h0 = jibH * (1 - t0 * 0.42);
      const h1 = jibH * (1 - t1 * 0.42);

      // Triangular cross-frames & bottom tie + diagonal web struts
      boomParts.push(makeStrut(x1, 0, -w1, x1, 0, w1, 0.025));
      boomParts.push(makeStrut(x1, 0, -w1, x1, h1, 0, 0.025));
      boomParts.push(makeStrut(x1, 0, w1, x1, h1, 0, 0.025));
      boomParts.push(makeStrut(x0, 0, -w0, x1, h1, 0, 0.022));
      boomParts.push(makeStrut(x0, 0, w0, x1, h1, 0, 0.022));
      boomParts.push(makeStrut(x0, 0, -w0, x1, 0, w1, 0.020));
    }

    // Counter-jib open box frame (+X aft to +4.1m) + handrail posts
    const cjLen = 4.1;
    for (const zc of [-0.42, 0.42]) {
      boomParts.push(makeStrut(0.4, 0.02, zc, cjLen, 0.02, zc, 0.042));
      boomParts.push(makeStrut(0.4, 0.46, zc, cjLen, 0.46, zc, 0.024));
      for (const px of [1.1, 2.2, 3.2, cjLen]) {
        boomParts.push(makeStrut(px, 0.02, zc, px, 0.46, zc, 0.020));
      }
    }
    for (const px of [1.2, 2.5, cjLen]) {
      boomParts.push(makeStrut(px, 0.02, -0.42, px, 0.02, 0.42, 0.032));
    }

    // A-Frame Cathead Tower Peak (4 tapered legs up to y = +2.85m)
    const apexY = 2.85;
    boomParts.push(makeStrut(-0.42, 0, -0.36, 0, apexY, 0, 0.045));
    boomParts.push(makeStrut(-0.42, 0, 0.36, 0, apexY, 0, 0.045));
    boomParts.push(makeStrut(0.48, 0, -0.36, 0, apexY, 0, 0.045));
    boomParts.push(makeStrut(0.48, 0, 0.36, 0, apexY, 0, 0.045));
    boomParts.push(makeStrut(-0.22, 1.35, -0.19, 0.22, 1.35, -0.19, 0.028));
    boomParts.push(makeStrut(-0.22, 1.35, 0.19, 0.22, 1.35, 0.19, 0.028));

    const boomLatticeMesh = new THREE.Mesh(mergeCraneParts(boomParts), craneYellowMat);
    boomLatticeMesh.castShadow = true;

    // Tension Pendant Guy-Rods (steel tie-bars holding jib & counter-jib)
    const guyParts = [
      makeStrut(0, apexY - 0.1, -0.06, -4.8, jibH * 0.78, -0.04, 0.022),
      makeStrut(0, apexY - 0.1, 0.06, -4.8, jibH * 0.78, 0.04, 0.022),
      makeStrut(0, apexY - 0.1, -0.04, -8.8, jibH * 0.62, -0.04, 0.020),
      makeStrut(0, apexY - 0.1, 0.04, -8.8, jibH * 0.62, 0.04, 0.020),
      makeStrut(0, apexY - 0.1, -0.10, 3.85, 0.10, -0.38, 0.024),
      makeStrut(0, apexY - 0.1, 0.10, 3.85, 0.10, 0.38, 0.024),
    ];
    const guyMesh = new THREE.Mesh(mergeCraneParts(guyParts), darkSteelMat);

    // 5 Concrete Counterweight Slabs stacked cleanly on rear counter-jib
    const cwGroup = new THREE.Group();
    for (let c = 0; c < 5; c++) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.15, 0.86), concreteMat);
      slab.position.set(2.82 + c * 0.28, -0.12, 0);
      slab.castShadow = true;
      cwGroup.add(slab);
    }

    // Hoist Winch Drum & Motor Unit at base of counter-jib
    const winchDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.62, 12), darkSteelMat);
    winchDrum.rotation.x = Math.PI / 2;
    winchDrum.position.set(1.35, 0.24, 0);
    const winchMotor = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.42, 0.56), craneYellowMat);
    winchMotor.position.set(1.88, 0.22, 0);

    // Offset Panoramic Operator Cabin mounted on side cantilever bracket
    const cabGroup = new THREE.Group();
    cabGroup.position.set(-0.32, 0.15, 0.78);
    const cabFrame = new THREE.Mesh(new THREE.BoxGeometry(1.12, 1.18, 0.76), craneYellowMat);
    const cabWinF = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.84, 0.80), cabGlassMat);
    cabWinF.position.set(-0.08, 0.08, 0);
    const cabBracket = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.55), darkSteelMat);
    cabBracket.position.set(0, -0.32, -0.44);
    cabGroup.add(cabFrame, cabWinF, cabBracket);

    // Top Aviation Red Obstruction Beacon
    const craneBeacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2.8 })
    );
    craneBeacon.position.set(0, apexY + 0.18, 0);

    // Animated Trolley + Taut Dual Hoist Cables + Pulley Hook Block + Suspended Steel I-Beam Load
    const craneTrolley = new THREE.Group();
    craneTrolley.position.set(-5.2, -0.06, 0);

    const trolleyBody = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.20, 0.72), hazardMat);
    const craneCables = new THREE.Group();
    const cableGeo = new THREE.CylinderGeometry(0.018, 0.018, 1.0, 6);
    cableGeo.translate(0, -0.5, 0); // Top anchored at y=0, stretches downward -1.0
    const cableL = new THREE.Mesh(cableGeo, darkSteelMat);
    cableL.position.z = -0.14;
    const cableR = new THREE.Mesh(cableGeo, darkSteelMat);
    cableR.position.z = 0.14;
    craneCables.add(cableL, cableR);
    craneCables.scale.y = 3.8;

    const craneHookGroup = new THREE.Group();
    craneHookGroup.position.set(0, -3.85, 0);
    const hookBlock = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.38, 0.36), craneYellowMat);
    const hookStripe = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.12, 0.37), darkSteelMat);
    const hookCurved = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.032, 6, 12, Math.PI * 1.45), darkSteelMat);
    hookCurved.rotation.z = Math.PI * 0.75;
    hookCurved.position.set(0, -0.31, 0);

    // Suspended Construction Steel Girder Load + Twin Rigging Slings
    const slingL = new THREE.Mesh(makeStrut(0, -0.37, 0, -0.85, -1.00, 0, 0.014), darkSteelMat);
    const slingR = new THREE.Mesh(makeStrut(0, -0.37, 0, 0.85, -1.00, 0, 0.014), darkSteelMat);
    const loadBeam = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.22, 0.24), safetyOrangeMat);
    loadBeam.position.set(0, -1.07, 0);
    loadBeam.castShadow = true;

    craneHookGroup.add(hookBlock, hookStripe, hookCurved, slingL, slingR, loadBeam);
    craneTrolley.add(trolleyBody, craneCables, craneHookGroup);

    craneBoom.add(
      boomLatticeMesh,
      guyMesh,
      cwGroup,
      winchDrum,
      winchMotor,
      cabGroup,
      craneBeacon,
      craneTrolley
    );

    scaffoldGroup.add(baseSteelMesh, ballast, mastMesh, slewingRing, climbCollar, craneBoom);
    group.add(scaffoldGroup);
    modelRoot.scale.y = 0.25;

    return {
      group,
      modelRoot,
      animatedParts,
      smokeEmitters,
      windowMaterials: [glassMat, facadeMat, lobbyGlowMat, crownGlowMat],
      craneBoom,
      craneTrolley,
      craneCables,
      craneHookGroup,
      craneBeacon,
      scaffoldGroup,
    };
  }

  return {
    group,
    modelRoot,
    animatedParts,
    smokeEmitters,
    windowMaterials: [glassMat, facadeMat, lobbyGlowMat, crownGlowMat],
    craneBoom,
    craneTrolley: null,
    craneCables: null,
    craneHookGroup: null,
    craneBeacon: null,
    scaffoldGroup,
  };
}
