import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _dummy = new THREE.Object3D();
const _wheelDummy = new THREE.Object3D();
const _color = new THREE.Color();
const _planeNext = new THREE.Vector3();
const _planeDir = new THREE.Vector3();
const _matA = new THREE.Matrix4();
const _matB = new THREE.Matrix4();
const _matC = new THREE.Matrix4();
const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _vecA = new THREE.Vector3();
const _scaleOne = new THREE.Vector3(1, 1, 1);

function mergeParts(parts, keepUv = false) {
  const cleaned = parts.map((g) => {
    if (g.index && !g.attributes.normal) g.computeVertexNormals();
    const ng = g.index ? g.toNonIndexed() : g.clone();
    if (!keepUv && ng.attributes.uv) ng.deleteAttribute('uv');
    if (!ng.attributes.normal) ng.computeVertexNormals();
    return ng;
  });
  const merged = mergeGeometries(cleaned, false);
  cleaned.forEach((g) => g.dispose());
  return merged;
}

/**
 * Extrudes a 2D (z, y) side silhouette symmetrically across X (-width/2 .. +width/2),
 * applies a strictly positive planform X-taper function so outward triangle winding
 * is mathematically preserved, and computes smooth indexed vertex normals.
 */
function extrudeSilhouetteX(buildShapeFn, width, bevelOpts = {}, taperFn = null) {
  const shape = new THREE.Shape();
  buildShapeFn(shape);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: bevelOpts.enabled ?? true,
    bevelThickness: bevelOpts.thickness ?? 0.055,
    bevelSize: bevelOpts.size ?? 0.045,
    bevelSegments: bevelOpts.segments ?? 4,
    curveSegments: bevelOpts.curveSegments ?? 18,
  });

  geo.translate(0, 0, -width * 0.5);
  geo.rotateY(-Math.PI / 2);

  if (taperFn) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const sx = Math.max(0.05, taperFn(x, y, z));
      pos.setX(i, x * sx);
    }
    pos.needsUpdate = true;
  }

  geo.computeVertexNormals();
  return geo;
}

/**
 * Extrudes a 2D (x, z) horizontal planform across vertical thickness, then transforms
 * with positive taper/dihedral (e.g. swept aircraft wings & tailplanes).
 */
function extrudePlanformY(buildShapeFn, thickness, bevelOpts = {}, sculptFn = null) {
  const shape = new THREE.Shape();
  buildShapeFn(shape);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: bevelOpts.enabled ?? true,
    bevelThickness: bevelOpts.thickness ?? thickness * 0.45,
    bevelSize: bevelOpts.size ?? thickness * 0.6,
    bevelSegments: bevelOpts.segments ?? 4,
    curveSegments: bevelOpts.curveSegments ?? 16,
  });

  geo.translate(0, 0, -thickness * 0.5);
  geo.rotateX(Math.PI / 2);

  if (sculptFn) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const p = sculptFn(pos.getX(i), pos.getY(i), pos.getZ(i));
      pos.setXYZ(i, p[0], p[1], p[2]);
    }
    pos.needsUpdate = true;
  }

  geo.computeVertexNormals();
  return geo;
}

function buildPillarPair(xBot, yBot, zBot, xTop, yTop, zTop, thickness = 0.06, depth = 0.08) {
  const dx = xTop - xBot;
  const dy = yTop - yBot;
  const dz = zTop - zBot;
  const len = Math.hypot(dx, dy, dz);
  const gR = new THREE.BoxGeometry(thickness, len, depth);
  const qR = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(dx, dy, dz).normalize()
  );
  gR.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3((xBot + xTop) * 0.5, (yBot + yTop) * 0.5, (zBot + zTop) * 0.5),
      qR,
      new THREE.Vector3(1, 1, 1)
    )
  );

  const gL = new THREE.BoxGeometry(thickness, len, depth);
  const qL = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(-dx, dy, dz).normalize()
  );
  gL.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(-(xBot + xTop) * 0.5, (yBot + yTop) * 0.5, (zBot + zTop) * 0.5),
      qL,
      new THREE.Vector3(1, 1, 1)
    )
  );
  return [gR, gL];
}

function buildWheelWellLiners(wheelCoords, archR, archW) {
  const liners = [];
  for (const [wx, wy, wz] of wheelCoords) {
    const arch = new THREE.CylinderGeometry(archR * 0.96, archR * 0.96, archW, 14, 1, false, 0, Math.PI);
    arch.rotateZ(Math.PI / 2);
    arch.rotateX(-Math.PI / 2);
    arch.translate(wx * 0.86, wy, wz);
    liners.push(arch);

    const backing = new THREE.CylinderGeometry(archR * 0.94, archR * 0.94, 0.06, 14);
    backing.rotateZ(Math.PI / 2);
    backing.translate(wx * 0.72, wy, wz);
    liners.push(backing);
  }
  return liners;
}

function createSedanGeometries() {
  // Lower body with semicircular front & rear wheel-arch cutouts
  const lowerBody = extrudeSilhouetteX(
    (s) => {
      s.moveTo(-2.12, 0.25);
      s.lineTo(-1.72, 0.21);
      s.absarc(-1.32, 0.29, 0.37, Math.PI, 0, true);
      s.lineTo(0.95, 0.19);
      s.absarc(1.32, 0.29, 0.37, Math.PI, 0, true);
      s.lineTo(2.08, 0.21);
      s.quadraticCurveTo(2.22, 0.27, 2.20, 0.44);
      s.quadraticCurveTo(2.14, 0.58, 1.88, 0.65);
      s.quadraticCurveTo(1.32, 0.80, 0.78, 0.84);
      s.lineTo(-1.46, 0.89);
      s.lineTo(-2.06, 0.88);
      s.quadraticCurveTo(-2.20, 0.86, -2.20, 0.62);
      s.quadraticCurveTo(-2.18, 0.34, -2.12, 0.25);
    },
    1.70,
    { thickness: 0.08, size: 0.06, segments: 4 },
    (x, y, z) => {
      let sx = 1.0;
      if (z > 1.35) sx *= 1.0 - Math.pow((z - 1.35) / 0.95, 2) * 0.17;
      if (z < -1.45) sx *= 1.0 - Math.pow((-1.45 - z) / 0.85, 2) * 0.15;
      if (y > 0.60) sx *= 1.0 - (y - 0.60) * 0.14;
      return sx;
    }
  );

  // Tinted panoramic glass greenhouse (sloped front/rear, tumblehome inward at roof)
  const glassGeo = extrudeSilhouetteX(
    (s) => {
      s.moveTo(-1.42, 0.86);
      s.lineTo(0.84, 0.82);
      s.lineTo(0.24, 1.32);
      s.lineTo(-0.78, 1.32);
      s.closePath();
    },
    1.36,
    { thickness: 0.04, size: 0.03, segments: 3 },
    (x, y, z) => {
      const h = Math.max(0, Math.min(1, (y - 0.82) / 0.50));
      let sx = 1.0 - h * 0.18;
      if (z > 0.3) sx *= 1.0 - (z - 0.3) * 0.06;
      if (z < -0.8) sx *= 1.0 - (-0.8 - z) * 0.06;
      return sx;
    }
  );

  // Sculpted roof cap + A/B/C pillars framing the windows
  const roof = extrudeSilhouetteX(
    (s) => {
      s.moveTo(-0.84, 1.31);
      s.lineTo(0.28, 1.31);
      s.quadraticCurveTo(0.04, 1.39, -0.32, 1.39);
      s.quadraticCurveTo(-0.68, 1.39, -0.84, 1.31);
    },
    1.12,
    { thickness: 0.05, size: 0.03, segments: 3 }
  );

  // Subtle integrated trunk-lid lip spoiler
  const lipSpoiler = new THREE.BoxGeometry(1.36, 0.045, 0.11);
  lipSpoiler.translate(0, 0.91, -2.08);

  const aPillars = buildPillarPair(0.69, 0.82, 0.82, 0.56, 1.32, 0.24, 0.058, 0.075);
  const bPillars = buildPillarPair(0.70, 0.84, -0.24, 0.57, 1.32, -0.26, 0.065, 0.09);
  const cPillars = buildPillarPair(0.68, 0.86, -1.42, 0.56, 1.32, -0.78, 0.08, 0.12);

  const bodyGeo = mergeParts([lowerBody, roof, lipSpoiler, ...aPillars, ...bPillars, ...cPillars]);

  // Trim: wheel wells, underbody floor, wing mirrors, black grille & lower intake, diffuser, twin exhausts
  const wheelLiners = buildWheelWellLiners(
    [[-0.78, 0.30, 1.32], [0.78, 0.30, 1.32], [-0.78, 0.30, -1.32], [0.78, 0.30, -1.32]],
    0.36,
    0.30
  );
  const underbody = new THREE.BoxGeometry(1.42, 0.08, 3.6);
  underbody.translate(0, 0.22, -0.02);

  const mirL = new THREE.BoxGeometry(0.18, 0.085, 0.12);
  mirL.translate(-0.92, 0.89, 0.56);
  const mirR = mirL.clone();
  mirR.translate(1.84, 0, 0);

  const grille = new THREE.BoxGeometry(0.92, 0.18, 0.07);
  grille.translate(0, 0.43, 2.21);
  const lowerDam = new THREE.BoxGeometry(1.38, 0.08, 0.10);
  lowerDam.translate(0, 0.25, 2.18);
  const diffuser = new THREE.BoxGeometry(1.32, 0.10, 0.09);
  diffuser.translate(0, 0.28, -2.21);
  const exL = new THREE.CylinderGeometry(0.042, 0.042, 0.14, 10).rotateX(Math.PI / 2);
  exL.translate(-0.46, 0.27, -2.23);
  const exR = exL.clone();
  exR.translate(0.92, 0, 0);

  const trimGeo = mergeParts([...wheelLiners, underbody, mirL, mirR, grille, lowerDam, diffuser, exL, exR]);

  const hlL = new THREE.BoxGeometry(0.32, 0.075, 0.08);
  hlL.translate(-0.54, 0.54, 2.15);
  const hlR = hlL.clone();
  hlR.translate(1.08, 0, 0);
  const headGeo = mergeParts([hlL, hlR]);

  const tlL = new THREE.BoxGeometry(0.42, 0.075, 0.08);
  tlL.translate(-0.49, 0.72, -2.20);
  const tlR = tlL.clone();
  tlR.translate(0.98, 0, 0);
  const tailGeo = mergeParts([tlL, tlR]);

  return { bodyGeo, glassGeo, trimGeo, headGeo, tailGeo };
}

function createCoupeGeometries() {
  // Fastback Sport GT Coupe silhouette (lower stance, aggressive nose, sleek fastback roof)
  const lowerBody = extrudeSilhouetteX(
    (s) => {
      s.moveTo(-2.06, 0.22);
      s.lineTo(-1.68, 0.19);
      s.absarc(-1.28, 0.28, 0.36, Math.PI, 0, true);
      s.lineTo(0.92, 0.17);
      s.absarc(1.28, 0.28, 0.36, Math.PI, 0, true);
      s.lineTo(2.04, 0.19);
      s.quadraticCurveTo(2.20, 0.24, 2.16, 0.40);
      s.quadraticCurveTo(2.05, 0.53, 1.72, 0.62);
      s.quadraticCurveTo(1.18, 0.75, 0.64, 0.79);
      s.lineTo(-1.44, 0.85);
      s.lineTo(-2.04, 0.82);
      s.quadraticCurveTo(-2.14, 0.72, -2.14, 0.44);
      s.closePath();
    },
    1.76,
    { thickness: 0.085, size: 0.065, segments: 4 },
    (x, y, z) => {
      let sx = 1.0;
      if (z > 1.25) sx *= 1.0 - Math.pow((z - 1.25) / 1.02, 2) * 0.22;
      if (z < -1.35) sx *= 1.0 - Math.pow((-1.35 - z) / 0.90, 2) * 0.16;
      if (y > 0.56) sx *= 1.0 - (y - 0.56) * 0.16;
      return sx;
    }
  );

  const glassGeo = extrudeSilhouetteX(
    (s) => {
      s.moveTo(-1.62, 0.82);
      s.lineTo(0.72, 0.77);
      s.lineTo(0.08, 1.23);
      s.quadraticCurveTo(-0.56, 1.26, -1.62, 0.82);
    },
    1.34,
    { thickness: 0.04, size: 0.03, segments: 3 },
    (x, y, z) => {
      const h = Math.max(0, Math.min(1, (y - 0.77) / 0.48));
      return 1.0 - h * 0.22;
    }
  );

  const roof = extrudeSilhouetteX(
    (s) => {
      s.moveTo(-0.78, 1.21);
      s.lineTo(0.14, 1.21);
      s.quadraticCurveTo(-0.24, 1.28, -0.78, 1.21);
    },
    1.04,
    { thickness: 0.045, size: 0.03, segments: 3 }
  );

  const aPillars = buildPillarPair(0.67, 0.77, 0.70, 0.52, 1.22, 0.10, 0.055, 0.075);
  const cPillars = buildPillarPair(0.67, 0.82, -1.62, 0.52, 1.22, -0.68, 0.075, 0.11);
  const rearWingTop = new THREE.BoxGeometry(1.42, 0.04, 0.20);
  rearWingTop.translate(0, 0.96, -2.02);

  const bodyGeo = mergeParts([lowerBody, roof, rearWingTop, ...aPillars, ...cPillars]);

  const wheelLiners = buildWheelWellLiners(
    [[-0.80, 0.29, 1.28], [0.80, 0.29, 1.28], [-0.80, 0.29, -1.28], [0.80, 0.29, -1.28]],
    0.35,
    0.30
  );
  const underbody = new THREE.BoxGeometry(1.44, 0.08, 3.5);
  underbody.translate(0, 0.20, 0);
  const splitter = new THREE.BoxGeometry(1.62, 0.06, 0.22);
  splitter.translate(0, 0.19, 2.10);
  const grille = new THREE.BoxGeometry(0.98, 0.16, 0.07);
  grille.translate(0, 0.36, 2.18);
  const diffuser = new THREE.BoxGeometry(1.38, 0.12, 0.10);
  diffuser.translate(0, 0.25, -2.14);
  const wingStanchionL = new THREE.BoxGeometry(0.06, 0.13, 0.10);
  wingStanchionL.translate(-0.42, 0.88, -2.02);
  const wingStanchionR = wingStanchionL.clone();
  wingStanchionR.translate(0.84, 0, 0);
  const mirL = new THREE.BoxGeometry(0.18, 0.08, 0.12);
  mirL.translate(-0.94, 0.83, 0.44);
  const mirR = mirL.clone();
  mirR.translate(1.88, 0, 0);

  const trimGeo = mergeParts([...wheelLiners, underbody, splitter, grille, diffuser, wingStanchionL, wingStanchionR, mirL, mirR]);

  const hlL = new THREE.BoxGeometry(0.30, 0.065, 0.08);
  hlL.translate(-0.56, 0.48, 2.10);
  const hlR = hlL.clone();
  hlR.translate(1.12, 0, 0);
  const headGeo = mergeParts([hlL, hlR]);

  const tlBar = new THREE.BoxGeometry(1.36, 0.055, 0.08);
  tlBar.translate(0, 0.67, -2.15);
  const tailGeo = mergeParts([tlBar]);

  return { bodyGeo, glassGeo, trimGeo, headGeo, tailGeo };
}

function createSuvGeometries() {
  const lowerBody = extrudeSilhouetteX(
    (s) => {
      s.moveTo(-2.12, 0.31);
      s.lineTo(-1.78, 0.26);
      s.absarc(-1.34, 0.35, 0.42, Math.PI, 0, true);
      s.lineTo(0.92, 0.25);
      s.absarc(1.34, 0.35, 0.42, Math.PI, 0, true);
      s.lineTo(2.10, 0.28);
      s.quadraticCurveTo(2.24, 0.35, 2.22, 0.60);
      s.quadraticCurveTo(2.16, 0.84, 1.88, 0.90);
      s.quadraticCurveTo(1.35, 1.00, 0.88, 1.02);
      s.lineTo(-1.92, 1.04);
      s.quadraticCurveTo(-2.16, 1.02, -2.20, 0.72);
      s.closePath();
    },
    1.80,
    { thickness: 0.085, size: 0.06, segments: 4 },
    (x, y, z) => {
      let sx = 1.0;
      if (z > 1.40) sx *= 1.0 - Math.pow((z - 1.40) / 0.95, 2) * 0.14;
      if (z < -1.55) sx *= 1.0 - Math.pow((-1.55 - z) / 0.80, 2) * 0.12;
      if (y > 0.74) sx *= 1.0 - (y - 0.74) * 0.11;
      return sx;
    }
  );

  const glassGeo = extrudeSilhouetteX(
    (s) => {
      s.moveTo(-1.86, 1.01);
      s.lineTo(0.92, 0.98);
      s.lineTo(0.28, 1.58);
      s.lineTo(-1.66, 1.58);
      s.closePath();
    },
    1.46,
    { thickness: 0.04, size: 0.03, segments: 3 },
    (x, y, z) => {
      const h = Math.max(0, Math.min(1, (y - 0.98) / 0.60));
      return 1.0 - h * 0.16;
    }
  );

  const roof = extrudeSilhouetteX(
    (s) => {
      s.moveTo(-1.72, 1.57);
      s.lineTo(0.32, 1.57);
      s.quadraticCurveTo(-0.65, 1.66, -1.72, 1.57);
    },
    1.24,
    { thickness: 0.05, size: 0.03, segments: 3 }
  );
  const rearSpoiler = new THREE.BoxGeometry(1.26, 0.07, 0.22);
  rearSpoiler.translate(0, 1.60, -1.80);

  const aPillars = buildPillarPair(0.74, 0.98, 0.90, 0.62, 1.58, 0.28, 0.068, 0.085);
  const bPillars = buildPillarPair(0.76, 1.00, -0.32, 0.63, 1.58, -0.34, 0.078, 0.10);
  const cPillars = buildPillarPair(0.75, 1.00, -1.20, 0.63, 1.58, -1.16, 0.078, 0.10);
  const dPillars = buildPillarPair(0.74, 1.01, -1.86, 0.62, 1.58, -1.68, 0.095, 0.14);

  const bodyGeo = mergeParts([lowerBody, roof, rearSpoiler, ...aPillars, ...bPillars, ...cPillars, ...dPillars]);

  const wheelLiners = buildWheelWellLiners(
    [[-0.84, 0.35, 1.34], [0.84, 0.35, 1.34], [-0.84, 0.35, -1.34], [0.84, 0.35, -1.34]],
    0.41,
    0.32
  );
  const underbody = new THREE.BoxGeometry(1.52, 0.09, 3.6);
  underbody.translate(0, 0.26, 0);

  const railL = new THREE.BoxGeometry(0.06, 0.07, 1.82);
  railL.translate(-0.54, 1.67, -0.72);
  const railR = railL.clone();
  railR.translate(1.08, 0, 0);
  const mirL = new THREE.BoxGeometry(0.20, 0.11, 0.14);
  mirL.translate(-1.00, 1.07, 0.60);
  const mirR = mirL.clone();
  mirR.translate(2.00, 0, 0);
  const grille = new THREE.BoxGeometry(1.08, 0.28, 0.07);
  grille.translate(0, 0.58, 2.24);
  const skidF = new THREE.BoxGeometry(1.42, 0.10, 0.10);
  skidF.translate(0, 0.31, 2.20);
  const skidR = new THREE.BoxGeometry(1.42, 0.11, 0.10);
  skidR.translate(0, 0.33, -2.21);

  const trimGeo = mergeParts([...wheelLiners, underbody, railL, railR, mirL, mirR, grille, skidF, skidR]);

  const hlL = new THREE.BoxGeometry(0.34, 0.10, 0.08);
  hlL.translate(-0.60, 0.72, 2.18);
  const hlR = hlL.clone();
  hlR.translate(1.20, 0, 0);
  const headGeo = mergeParts([hlL, hlR]);

  const tlL = new THREE.BoxGeometry(0.42, 0.095, 0.08);
  tlL.translate(-0.56, 0.87, -2.22);
  const tlR = tlL.clone();
  tlR.translate(1.12, 0, 0);
  const tailGeo = mergeParts([tlL, tlR]);

  return { bodyGeo, glassGeo, trimGeo, headGeo, tailGeo };
}

function createTruckGeometries() {
  // Aerodynamic long-nose tractor cab + sleeper + aero roof fairing
  const cabLower = extrudeSilhouetteX(
    (s) => {
      s.moveTo(0.42, 0.48);
      s.lineTo(1.98, 0.46);
      s.absarc(2.46, 0.42, 0.48, Math.PI, 0, true);
      s.lineTo(3.26, 0.46);
      s.quadraticCurveTo(3.36, 0.56, 3.34, 1.08);
      s.quadraticCurveTo(3.22, 1.38, 2.40, 1.54);
      s.lineTo(2.10, 2.38);
      s.quadraticCurveTo(1.60, 2.75, 0.65, 3.12); // Aero roof fairing meeting trailer roof height!
      s.lineTo(0.44, 3.12);
      s.closePath();
    },
    1.86,
    { thickness: 0.08, size: 0.06, segments: 3 },
    (x, y, z) => {
      let sx = 1.0;
      if (z > 2.45) sx *= 1.0 - Math.pow((z - 2.45) / 1.0, 2) * 0.18;
      if (y > 2.35) sx *= 1.0 - (y - 2.35) * 0.14;
      return sx;
    }
  );

  // Recessed wraparound cab windshield & side door windows
  const cabGlass = extrudeSilhouetteX(
    (s) => {
      s.moveTo(1.42, 1.54);
      s.lineTo(2.34, 1.52);
      s.lineTo(2.14, 2.26);
      s.lineTo(1.42, 2.26);
      s.closePath();
    },
    1.76,
    { thickness: 0.03, size: 0.025, segments: 2 },
    (x, y, z) => (z > 2.15 ? 0.94 : 1.0)
  );

  const chassisRail = new THREE.BoxGeometry(1.10, 0.24, 5.45);
  chassisRail.translate(0, 0.48, -0.45);
  const cabGeo = mergeParts([cabLower, chassisRail]);

  // Chrome bumper, big grille, stacks, fuel tanks, aero mirrors, wheel-well liners, trailer underride guard
  const tWheelLiners = buildWheelWellLiners(
    [[-0.88, 0.40, 2.46], [0.88, 0.40, 2.46], [-0.88, 0.40, 0.35], [0.88, 0.40, 0.35], [-0.88, 0.40, -2.95], [0.88, 0.40, -2.95]],
    0.46,
    0.34
  );
  const tBumper = new THREE.BoxGeometry(1.96, 0.28, 0.18);
  tBumper.translate(0, 0.48, 3.38);
  const tGrille = new THREE.BoxGeometry(1.16, 0.62, 0.08);
  tGrille.translate(0, 0.94, 3.35);
  const tStackL = new THREE.CylinderGeometry(0.06, 0.068, 2.55, 10);
  tStackL.translate(-0.98, 2.05, 0.56);
  const tStackR = tStackL.clone();
  tStackR.translate(1.96, 0, 0);
  const tTankL = new THREE.CylinderGeometry(0.24, 0.24, 1.15, 12).rotateX(Math.PI / 2);
  tTankL.translate(-0.84, 0.48, 1.05);
  const tTankR = tTankL.clone();
  tTankR.translate(1.68, 0, 0);
  const tMirL = new THREE.BoxGeometry(0.14, 0.38, 0.10);
  tMirL.translate(-1.08, 1.82, 2.08);
  const tMirR = tMirL.clone();
  tMirR.translate(2.16, 0, 0);
  const rearGuard = new THREE.BoxGeometry(1.92, 0.14, 0.10);
  rearGuard.translate(0, 0.44, -3.96);

  const trimGeo = mergeParts([...tWheelLiners, tBumper, tGrille, tStackL, tStackR, tTankL, tTankR, tMirL, tMirR, rearGuard]);

  const hlL = new THREE.BoxGeometry(0.28, 0.14, 0.08);
  hlL.translate(-0.68, 0.72, 3.33);
  const hlR = hlL.clone();
  hlR.translate(1.36, 0, 0);
  const headGeo = mergeParts([hlL, hlR]);

  const tlL = new THREE.BoxGeometry(0.32, 0.10, 0.08);
  tlL.translate(-0.74, 0.62, -3.96);
  const tlR = tlL.clone();
  tlR.translate(1.48, 0, 0);
  const tailGeo = mergeParts([tlL, tlR]);

  const trailerBody = new THREE.BoxGeometry(2.04, 2.58, 4.78);
  trailerBody.translate(0, 1.88, -1.62);

  return { cabGeo, glassGeo: cabGlass, trimGeo, headGeo, tailGeo, trailerGeo: trailerBody };
}

function createAlloyWheelGeometries(radius, width) {
  const pts = [
    new THREE.Vector2(radius * 0.60, -width * 0.45),
    new THREE.Vector2(radius * 0.92, -width * 0.49),
    new THREE.Vector2(radius, -width * 0.32),
    new THREE.Vector2(radius, width * 0.32),
    new THREE.Vector2(radius * 0.92, width * 0.49),
    new THREE.Vector2(radius * 0.60, width * 0.45),
    new THREE.Vector2(radius * 0.60, -width * 0.45),
  ];
  const tireGeo = new THREE.LatheGeometry(pts, 24);
  tireGeo.rotateZ(Math.PI / 2);

  const rimParts = [];
  const barrel = new THREE.CylinderGeometry(radius * 0.60, radius * 0.60, width * 0.80, 18);
  barrel.rotateZ(Math.PI / 2);
  rimParts.push(barrel);

  const hub = new THREE.CylinderGeometry(radius * 0.18, radius * 0.18, width * 0.94, 12);
  hub.rotateZ(Math.PI / 2);
  rimParts.push(hub);

  for (let s = 0; s < 5; s++) {
    const spoke = new THREE.BoxGeometry(width * 0.88, radius * 0.56, radius * 0.095);
    const a = (s * Math.PI * 2) / 5;
    spoke.translate(0, radius * 0.30, 0);
    spoke.rotateX(a);
    rimParts.push(spoke);
  }
  const rimGeo = mergeParts(rimParts);
  return { tireGeo, rimGeo };
}

/**
 * Naval-architecture ocean container ship oriented along +X (bow at +X, stern at -X).
 */
function createRealisticContainerShip() {
  const ship = new THREE.Group();

  // Build lower crimson anti-fouling hull & upper deep-navy freeboard hull using solid extruded profiles + beam taper
  const hullTaper = (x, y) => {
    let beam = 1.0;
    if (x > 4.5) {
      const t = Math.min(1, (x - 4.5) / 14.5);
      beam *= Math.max(0.06, 1.0 - Math.pow(t, 1.55) * 0.93);
    } else if (x < -10.5) {
      const t = Math.min(1, (-10.5 - x) / 6.0);
      beam *= Math.max(0.28, 1.0 - Math.pow(t, 1.8) * 0.62);
    }
    // Subtle maritime hull flare upward
    beam *= 0.88 + Math.max(0, Math.min(1, y / 4.0)) * 0.18;
    return beam;
  };

  // Use shape extruded in Z, rotated so ship length is along +X (nose at +19)
  const makeHullSlice = (yBottom, yTop, bowX) => {
    const shape = new THREE.Shape();
    shape.moveTo(-16.2, yBottom);
    shape.lineTo(bowX - 1.2, yBottom);
    shape.quadraticCurveTo(bowX + 0.4, (yBottom + yTop) * 0.5, bowX, yTop);
    shape.lineTo(-16.2, yTop);
    shape.closePath();

    const g = new THREE.ExtrudeGeometry(shape, {
      depth: 7.4,
      bevelEnabled: true,
      bevelThickness: 0.14,
      bevelSize: 0.10,
      bevelSegments: 3,
      curveSegments: 16,
    });
    g.translate(0, 0, -3.7);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      pos.setZ(i, z * hullTaper(x, y));
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  };

  const lowerHullMat = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.58, metalness: 0.25 });
  const upperHullMat = new THREE.MeshStandardMaterial({ color: 0x0f2537, roughness: 0.46, metalness: 0.32 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.34, metalness: 0.12 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.78, metalness: 0.18 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    emissive: 0xfde68a,
    emissiveIntensity: 0.55,
    roughness: 0.08,
    metalness: 0.4,
    clearcoat: 1.0,
  });
  const craneMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.42, metalness: 0.4 });
  const boatMat = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.38 });

  const lowerHull = new THREE.Mesh(makeHullSlice(-0.6, 1.45, 17.6), lowerHullMat);
  const upperHull = new THREE.Mesh(makeHullSlice(1.42, 3.65, 18.9), upperHullMat);

  // Bulbous bow projecting slightly forward under waterline
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 12), lowerHullMat);
  bulb.scale.set(2.5, 0.85, 0.78);
  bulb.position.set(17.8, 0.45, 0);

  // White boot-top waterline band & sheer rail
  const waterlineStripe = new THREE.Mesh(makeHullSlice(1.36, 1.56, 17.9), whiteMat);
  waterlineStripe.scale.set(1.004, 1, 1.024);
  const sheerTrim = new THREE.Mesh(makeHullSlice(3.52, 3.74, 19.0), whiteMat);
  sheerTrim.scale.set(1.004, 1, 1.024);

  // Weather deck & cargo hatch coamings
  const weatherDeck = new THREE.Mesh(makeHullSlice(3.60, 3.82, 18.4), deckMat);
  weatherDeck.scale.set(0.98, 1, 0.94);

  ship.add(lowerHull, upperHull, bulb, waterlineStripe, sheerTrim, weatherDeck);

  // 27 Stacked Intermodal Containers across 3 bays × 3 rows × 3 high
  const contPalette = [0x0284c7, 0xd97706, 0x059669, 0xdc2626, 0x475569, 0x0f766e];
  const contMats = contPalette.map((hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.48, metalness: 0.25 }));
  const contGeo = new THREE.BoxGeometry(3.8, 1.35, 1.65);

  const bayXs = [-4.4, 0.0, 4.4, 8.8];
  const rowZs = [-1.9, 0, 1.9];
  let cIdx = 0;
  for (let b = 0; b < bayXs.length; b++) {
    for (let r = 0; r < rowZs.length; r++) {
      const stackH = b === 3 && r !== 1 ? 2 : 3;
      for (let h = 0; h < stackH; h++) {
        const cont = new THREE.Mesh(contGeo, contMats[(cIdx * 5 + b + h) % contMats.length]);
        cont.position.set(bayXs[b], 4.5 + h * 1.38, rowZs[r]);
        cont.castShadow = true;
        cont.receiveShadow = true;
        ship.add(cont);
        cIdx++;
      }
    }
  }

  // 2 Articulated Yellow Deck Cranes
  for (const cx of [-2.2, 6.6]) {
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 3.6, 12), craneMat);
    ped.position.set(cx, 5.5, 0);
    const craneCab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.3, 1.2), craneMat);
    craneCab.position.set(cx, 7.6, 0);
    const boom = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.38, 0.42), craneMat);
    boom.position.set(cx + 3.0, 9.4, 0);
    boom.rotation.z = 0.48;
    ship.add(ped, craneCab, boom);
  }

  // Multi-Tiered Accommodation Superstructure + Cantilevered Bridge Wings + Bridge Glass
  const bridgeGroup = new THREE.Group();
  const tier1 = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.5, 5.8), whiteMat);
  tier1.position.set(-11.4, 4.5, 0);
  const tier2 = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.4, 5.4), whiteMat);
  tier2.position.set(-11.5, 5.9, 0);
  const tier3 = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.3, 5.0), whiteMat);
  tier3.position.set(-11.6, 7.2, 0);
  const navBridge = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.35, 8.2), whiteMat);
  navBridge.position.set(-11.2, 8.45, 0);
  const bridgeWinF = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.72, 7.8), glassMat);
  bridgeWinF.position.set(-9.55, 8.52, 0);
  const bridgeRoof = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.25, 8.4), whiteMat);
  bridgeRoof.position.set(-11.2, 9.22, 0);
  bridgeGroup.add(tier1, tier2, tier3, navBridge, bridgeWinF, bridgeRoof);

  // Smokestack funnel behind superstructure
  const funnel = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.8, 1.6), new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4 }));
  funnel.position.set(-13.4, 7.6, 0);
  funnel.rotation.z = 0.14;
  const funnelCap = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 1.65), deckMat);
  funnelCap.position.set(-13.6, 9.0, 0);
  funnelCap.rotation.z = 0.14;

  // Twin SATCOM radomes & spinning marine radar scanner
  const radome1 = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), whiteMat);
  radome1.position.set(-11.4, 9.8, -1.6);
  const radome2 = radome1.clone();
  radome2.position.z = 1.6;

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.18, 3.2, 8), whiteMat);
  mast.position.set(-11.0, 10.8, 0);
  const shipRadar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 2.2), whiteMat);
  shipRadar.position.set(-11.0, 12.1, 0);

  // Twin orange free-fall / davit lifeboats
  const lbL = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 1.3, 6, 10), boatMat);
  lbL.rotation.z = Math.PI / 2;
  lbL.position.set(-11.4, 5.2, -3.15);
  const lbR = lbL.clone();
  lbR.position.z = 3.15;

  ship.add(bridgeGroup, funnel, funnelCap, radome1, radome2, mast, shipRadar, lbL, lbR);

  // Foremast on bow deck
  const bowMast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 3.4, 8), whiteMat);
  bowMast.position.set(16.2, 5.3, 0);
  ship.add(bowMast);

  return { ship, shipRadar };
}

/**
 * Compact Muscular Harbor Tugboat patrolling coastal harbor bay.
 */
function createHarborTugboat() {
  const tug = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.48, metalness: 0.25 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.88 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.34 });
  const darkDeck = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.78 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0f172a, emissive: 0xfde68a, emissiveIntensity: 0.5, clearcoat: 1.0 });

  const hullShape = new THREE.Shape();
  hullShape.moveTo(-4.8, -0.3);
  hullShape.lineTo(4.0, -0.3);
  hullShape.quadraticCurveTo(5.3, 0.4, 5.0, 1.55);
  hullShape.lineTo(-4.6, 1.35);
  hullShape.closePath();

  const hullGeo = new THREE.ExtrudeGeometry(hullShape, { depth: 3.4, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.08, bevelSegments: 3 });
  hullGeo.translate(0, 0, -1.7);
  const pos = hullGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    let sx = 1.0;
    if (x > 1.2) sx = Math.max(0.18, 1.0 - Math.pow((x - 1.2) / 4.0, 1.4) * 0.80);
    if (x < -2.6) sx = Math.max(0.65, 1.0 - (-2.6 - x) * 0.12);
    pos.setZ(i, pos.getZ(i) * sx);
  }
  hullGeo.computeVertexNormals();
  tug.add(new THREE.Mesh(hullGeo, hullMat));

  // Heavy rubber bow & side tire fenders
  const bowFender = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.22, 8, 14, Math.PI), rubberMat);
  bowFender.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
  bowFender.position.set(4.55, 1.15, 0);
  tug.add(bowFender);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.25, 2.8), darkDeck);
  deck.position.set(-0.2, 1.42, 0);
  const house = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.65, 2.3), whiteMat);
  house.position.set(0.6, 2.3, 0);
  const wheelhouse = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.15, 2.1), whiteMat);
  wheelhouse.position.set(0.9, 3.6, 0);
  const bridgeGlass = new THREE.Mesh(new THREE.BoxGeometry(2.48, 0.56, 2.16), glassMat);
  bridgeGlass.position.set(0.92, 3.72, 0);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 1.4, 10), new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 }));
  funnel.position.set(-1.1, 2.85, 0);
  const radar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 1.0), whiteMat);
  radar.position.set(0.9, 4.5, 0);
  tug.add(deck, house, wheelhouse, bridgeGlass, funnel, radar);
  return tug;
}

/**
 * High-detail commercial jetliner (A350 / B787 proportions) facing +Z.
 */
function createRealisticAirliner() {
  const plane = new THREE.Group();

  const fuseMat = new THREE.MeshPhysicalMaterial({
    color: 0xf8fafc,
    roughness: 0.16,
    metalness: 0.55,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  });
  const bellyMat = new THREE.MeshPhysicalMaterial({
    color: 0x0284c7,
    roughness: 0.22,
    metalness: 0.65,
    clearcoat: 0.9,
  });
  const wingMat = new THREE.MeshPhysicalMaterial({
    color: 0xdbe3ec,
    roughness: 0.22,
    metalness: 0.72,
    clearcoat: 0.8,
  });
  const darkGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x081220,
    roughness: 0.04,
    metalness: 0.3,
    clearcoat: 1.0,
  });
  const engineMetalMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.88, roughness: 0.22 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.10 });
  const darkThroatMat = new THREE.MeshStandardMaterial({ color: 0x0b0f17, roughness: 0.85, metalness: 0.2 });

  // Continuous 32-segment LatheGeometry fuselage from tailcone (-7.6m) to smooth parabolic nose (+7.8m)
  const fuseProfile = [
    new THREE.Vector2(0.01, -7.6),
    new THREE.Vector2(0.16, -7.2),
    new THREE.Vector2(0.42, -5.8),
    new THREE.Vector2(0.68, -4.1),
    new THREE.Vector2(0.76, -2.5),
    new THREE.Vector2(0.76, 3.8),
    new THREE.Vector2(0.72, 4.9),
    new THREE.Vector2(0.60, 5.9),
    new THREE.Vector2(0.42, 6.75),
    new THREE.Vector2(0.22, 7.40),
    new THREE.Vector2(0.01, 7.82),
  ];
  const fuselageGeo = new THREE.LatheGeometry(fuseProfile, 32);
  fuselageGeo.rotateX(Math.PI / 2);
  plane.add(new THREE.Mesh(fuselageGeo, fuseMat));

  // Aerodynamic wing-root belly fairing
  const fairingGeo = new THREE.SphereGeometry(0.95, 16, 12);
  fairingGeo.scale(0.95, 0.42, 2.9);
  const fairing = new THREE.Mesh(fairingGeo, wingMat);
  fairing.position.set(0, -0.50, 0.25);
  plane.add(fairing);

  // Curved 6-pane wraparound cockpit windscreen
  const windGeo = new THREE.CylinderGeometry(0.62, 0.69, 0.42, 16, 1, false, -0.85, 1.70);
  windGeo.rotateX(0.32);
  const windscreen = new THREE.Mesh(windGeo, darkGlassMat);
  windscreen.position.set(0, 0.28, 5.72);
  plane.add(windscreen);

  // Crisp side cabin window strips (port & starboard) + passenger doors
  const winStripGeo = new THREE.BoxGeometry(0.06, 0.13, 8.2);
  const winL = new THREE.Mesh(winStripGeo, darkGlassMat);
  winL.position.set(-0.745, 0.14, 0.35);
  const winR = winL.clone();
  winR.position.x = 0.745;
  plane.add(winL, winR);

  // True Swept Tapered Main Wings with Wingtip Winglets (Starboard & Port mirror)
  const buildWingSide = (sideSign) => {
    const wing = extrudePlanformY(
      (s) => {
        s.moveTo(sideSign * 0.4, 2.05);
        s.lineTo(sideSign * 6.8, -1.65);
        s.lineTo(sideSign * 6.8, -2.50);
        s.lineTo(sideSign * 0.4, -0.85);
        s.closePath();
      },
      0.16,
      { thickness: 0.08, size: 0.10, segments: 4 },
      (x, y, z) => {
        const spanT = Math.min(1, Math.abs(x) / 6.8);
        const yThick = y * (1.0 - spanT * 0.52);
        const dihedral = spanT * 0.48;
        return [x, yThick + dihedral - 0.34, z];
      }
    );
    const wingMesh = new THREE.Mesh(wing, wingMat);

    // Blended upturned wingtip winglet
    const wlShape = new THREE.Shape();
    wlShape.moveTo(-2.50, 0);
    wlShape.lineTo(-1.68, 0);
    wlShape.lineTo(-2.22, 0.88);
    wlShape.lineTo(-2.62, 0.88);
    wlShape.closePath();
    const wlGeo = new THREE.ExtrudeGeometry(wlShape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
    wlGeo.translate(0, 0, -0.035);
    wlGeo.rotateY(-Math.PI / 2);
    const winglet = new THREE.Mesh(wlGeo, bellyMat);
    winglet.position.set(sideSign * 6.82, 0.14, 0);
    winglet.rotation.z = -sideSign * 0.22;

    // 3 Underwing Flap Track Fairing Canoes
    const grp = new THREE.Group();
    grp.add(wingMesh, winglet);
    for (const fx of [1.8, 3.4, 4.9]) {
      const fz = 0.05 - fx * 0.48;
      const canoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.72, 4, 8), wingMat);
      canoe.rotation.x = Math.PI / 2;
      canoe.position.set(sideSign * fx, -0.40 + (fx / 6.8) * 0.48, fz);
      grp.add(canoe);
    }
    return grp;
  };
  plane.add(buildWingSide(1), buildWingSide(-1));

  // Twin High-Bypass Turbofan Jet Engines hung forward on swept pylons
  const buildTurbofan = (sideSign) => {
    const eng = new THREE.Group();
    const nacellePts = [
      new THREE.Vector2(0.28, -0.82),
      new THREE.Vector2(0.39, -0.35),
      new THREE.Vector2(0.43, 0.25),
      new THREE.Vector2(0.42, 0.80),
      new THREE.Vector2(0.34, 0.92),
    ];
    const nacelleGeo = new THREE.LatheGeometry(nacellePts, 24);
    nacelleGeo.rotateX(Math.PI / 2);
    const nacelle = new THREE.Mesh(nacelleGeo, fuseMat);

    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 10, 22), chromeMat);
    lip.position.z = 0.88;

    const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.26, 0.7, 16).rotateX(Math.PI / 2), darkThroatMat);
    throat.position.z = 0.56;

    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.28, 12).rotateX(Math.PI / 2), chromeMat);
    spinner.position.z = 0.65;

    const exhaustCone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.62, 14).rotateX(-Math.PI / 2), engineMetalMat);
    exhaustCone.position.z = -0.96;

    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.46, 1.35), wingMat);
    pylon.position.set(0, 0.34, -0.25);

    eng.add(nacelle, lip, throat, spinner, exhaustCone, pylon);
    eng.position.set(sideSign * 2.52, -0.58, 0.65);
    return eng;
  };
  plane.add(buildTurbofan(1), buildTurbofan(-1));

  // Swept Vertical Tail Fin (Stabilizer + Rudder) + Airline Accent + Swept Horizontal Stabilizers
  const vTailShape = new THREE.Shape();
  vTailShape.moveTo(-7.2, 0.45);
  vTailShape.lineTo(-4.1, 0.45);
  vTailShape.lineTo(-6.2, 3.05);
  vTailShape.lineTo(-7.35, 3.05);
  vTailShape.closePath();
  const vTailGeo = new THREE.ExtrudeGeometry(vTailShape, { depth: 0.11, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.04, bevelSegments: 3 });
  vTailGeo.translate(0, 0, -0.055);
  vTailGeo.rotateY(-Math.PI / 2);
  plane.add(new THREE.Mesh(vTailGeo, bellyMat));

  const buildHStab = (sideSign) => {
    const hGeo = extrudePlanformY(
      (s) => {
        s.moveTo(sideSign * 0.1, -5.65);
        s.lineTo(sideSign * 2.55, -7.25);
        s.lineTo(sideSign * 2.55, -7.75);
        s.lineTo(sideSign * 0.1, -7.05);
        s.closePath();
      },
      0.09,
      { thickness: 0.04, size: 0.05, segments: 3 },
      (x, y, z) => [x, y + 0.25 + (Math.abs(x) / 2.55) * 0.18, z]
    );
    return new THREE.Mesh(hGeo, wingMat);
  };
  plane.add(buildHStab(1), buildHStab(-1));

  // Aviation Navigation Lights & Anti-Collision Strobe
  const navPort = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  navPort.position.set(-6.85, 0.16, -2.05);
  const navStbd = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), new THREE.MeshBasicMaterial({ color: 0x10ff70 }));
  navStbd.position.set(6.85, 0.16, -2.05);
  const planeBeacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3b30 })
  );
  planeBeacon.position.set(0, 0.78, 0.8);
  plane.add(navPort, navStbd, planeBeacon);

  return { plane, planeBeacon };
}

/**
 * Anatomically proportioned articulated human pedestrian meshes:
 * - Sculpted Lathe torso (pelvis -> waist -> chest -> shoulders + collar)
 * - Neck + oval cranium + subtle jawline/nose profile + sculpted hair cap
 * - Curved slightly-bent arms + bare hands
 * - Articulated thighs pivoting at hip + anatomical calves + sculpted shoes pivoting at knee
 */
function createRealisticHumanGeometries() {
  // 1. Sculpted Torso (y = 0 at hip/pelvis line up to y = 0.56 at collarbone)
  const torsoPts = [
    new THREE.Vector2(0.01, 0.00),
    new THREE.Vector2(0.125, 0.02), // hips
    new THREE.Vector2(0.118, 0.12), // lower waist
    new THREE.Vector2(0.112, 0.22), // natural waist taper
    new THREE.Vector2(0.138, 0.36), // ribcage / chest
    new THREE.Vector2(0.152, 0.46), // upper chest / shoulders
    new THREE.Vector2(0.122, 0.52), // trapezius slope
    new THREE.Vector2(0.056, 0.55), // collar opening
    new THREE.Vector2(0.01, 0.555),
  ];
  const torsoGeo = new THREE.LatheGeometry(torsoPts, 16);
  torsoGeo.scale(1.24, 1.0, 0.76); // anatomical broad shoulders, slimmer chest depth
  torsoGeo.computeVertexNormals();

  // 2. Sculpted Neck + Oval Human Head with subtle Chin/Nose contour (origin at base of neck y=0)
  const headPts = [
    new THREE.Vector2(0.048, -0.02), // neck base
    new THREE.Vector2(0.044, 0.04),  // upper neck
    new THREE.Vector2(0.078, 0.08),  // jaw / chin line
    new THREE.Vector2(0.092, 0.14),  // cheekbones
    new THREE.Vector2(0.095, 0.19),  // brow / temples
    new THREE.Vector2(0.082, 0.24),  // upper cranium
    new THREE.Vector2(0.045, 0.268), // crown
    new THREE.Vector2(0.005, 0.276),
  ];
  const headGeo = new THREE.LatheGeometry(headPts, 16);
  headGeo.scale(0.88, 1.0, 1.02);
  // Subtle facial forward protrusion for nose bridge & chin
  const hPos = headGeo.attributes.position;
  for (let i = 0; i < hPos.count; i++) {
    const x = hPos.getX(i);
    const y = hPos.getY(i);
    const z = hPos.getZ(i);
    if (z > 0.05 && Math.abs(x) < 0.032 && y > 0.115 && y < 0.175) {
      hPos.setZ(i, z + 0.020 * (1.0 - Math.abs(x) / 0.032));
    }
    if (z > 0.03 && Math.abs(x) < 0.045 && y >= 0.07 && y <= 0.105) {
      hPos.setZ(i, z + 0.012);
    }
  }
  headGeo.computeVertexNormals();

  // 3. Sculpted Hair Cap (covers top, crown, sides behind ears & nape of neck, open at face +Z)
  const hairTop = new THREE.SphereGeometry(0.103, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56);
  hairTop.scale(0.92, 0.98, 1.06);
  hairTop.rotateX(-0.24); // tilts forward slightly at brow, deeper at nape
  hairTop.translate(0, 0.175, -0.012);

  const hairBack = new THREE.CylinderGeometry(0.096, 0.082, 0.125, 12, 1, false, Math.PI * 0.55, Math.PI * 0.90);
  hairBack.scale(0.92, 1.0, 1.02);
  hairBack.translate(0, 0.125, -0.014);
  const hairGeo = mergeParts([hairTop, hairBack]);

  // 4. Sculpted Curved Arm (Shoulder pivot at 0,0,0 -> slightly bent elbow -> forearm cuff at y = -0.47)
  const armCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.0, 0),
    new THREE.Vector3(0, -0.14, -0.008),
    new THREE.Vector3(0, -0.26, -0.012), // elbow
    new THREE.Vector3(0, -0.38, 0.028),  // forearm angled slightly forward
    new THREE.Vector3(0, -0.47, 0.068),  // wrist
  ]);
  const armGeo = new THREE.TubeGeometry(armCurve, 10, 0.044, 9, false);
  // Subtle shoulder cap & taper toward wrist
  const aPos = armGeo.attributes.position;
  for (let i = 0; i < aPos.count; i++) {
    const y = aPos.getY(i);
    const t = Math.max(0, Math.min(1, -y / 0.47));
    const taper = 1.08 - t * 0.34;
    aPos.setX(i, aPos.getX(i) * taper);
  }
  const shoulderCap = new THREE.SphereGeometry(0.052, 8, 8);
  const fullArmGeo = mergeParts([armGeo, shoulderCap]);

  // 5. Bare Hand anchored at wrist end (0, -0.50, 0.08) in same shoulder pivot frame
  const handGeo = new THREE.SphereGeometry(0.038, 8, 8);
  handGeo.scale(0.68, 1.35, 0.95);
  handGeo.rotateX(0.35);
  handGeo.translate(0, -0.505, 0.082);

  // 6. Articulated Thigh (Hip pivot at y=0 down to Knee joint at y=-0.39)
  const thighPts = [
    new THREE.Vector2(0.056, -0.40), // knee overlap
    new THREE.Vector2(0.062, -0.34),
    new THREE.Vector2(0.072, -0.20),
    new THREE.Vector2(0.082, -0.06),
    new THREE.Vector2(0.076, 0.01),
    new THREE.Vector2(0.01, 0.03),
  ];
  const thighGeo = new THREE.LatheGeometry(thighPts, 12);
  thighGeo.scale(0.95, 1.0, 1.05);
  thighGeo.computeVertexNormals();

  // 7. Articulated Shin/Calf (Knee pivot at y=0 down to Ankle at y=-0.37)
  const shinPts = [
    new THREE.Vector2(0.040, -0.38), // ankle
    new THREE.Vector2(0.048, -0.26),
    new THREE.Vector2(0.062, -0.14), // natural calf muscle curve
    new THREE.Vector2(0.058, -0.04),
    new THREE.Vector2(0.056, 0.02),  // rounded knee overlap
    new THREE.Vector2(0.005, 0.03),
  ];
  const shinGeo = new THREE.LatheGeometry(shinPts, 12);
  shinGeo.computeVertexNormals();

  // 8. Sculpted Human Shoe (anchored in Knee frame at y = -0.44 sole to y = -0.36 collar)
  const shoeGeo = extrudeSilhouetteX(
    (s) => {
      s.moveTo(-0.055, -0.445); // flat heel bottom
      s.lineTo(0.155, -0.445);  // flat sole to toe
      s.quadraticCurveTo(0.182, -0.440, 0.176, -0.410); // rounded toe bumper
      s.quadraticCurveTo(0.130, -0.388, 0.068, -0.372); // instep lace slope
      s.lineTo(0.036, -0.362);  // ankle collar front
      s.lineTo(-0.048, -0.362); // ankle collar back
      s.lineTo(-0.058, -0.425); // heel counter
      s.closePath();
    },
    0.078,
    { thickness: 0.012, size: 0.010, segments: 2, curveSegments: 8 }
  );

  return { torsoGeo, headGeo, hairGeo, armGeo: fullArmGeo, handGeo, thighGeo, shinGeo, shoeGeo };
}

export class TrafficSystem {
  constructor(scene, terrainRefs, textures) {
    this.scene = scene;
    this.terrainRefs = terrainRefs;
    const roadLines = [-120, -80, -40, 0, 40, 80, 120];
    this.signalIntersections = [-80, -40, 0, 40, 80];

    const carPaintMat = new THREE.MeshPhysicalMaterial({
      metalness: 0.84,
      roughness: 0.16,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
    });
    const coupePaintMat = carPaintMat.clone();
    const suvPaintMat = carPaintMat.clone();
    const carGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x091320,
      metalness: 0.18,
      roughness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
    });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x161f2c, metalness: 0.62, roughness: 0.36 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.94, roughness: 0.12 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.88, metalness: 0.04 });

    this.headLightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfffbeb,
      emissiveIntensity: 2.0,
      roughness: 0.1,
    });
    const tailLightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xff2222,
      emissiveIntensity: 1.5,
      roughness: 0.1,
    });
    this.beamMat = new THREE.MeshBasicMaterial({
      map: textures?.headlightBeam || null,
      color: 0xfef3c7,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const shadowMat = new THREE.MeshBasicMaterial({
      map: textures?.contactShadow || null,
      color: 0x000000,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    });

    // 1. Executive Sedans (28)
    this.sedanCount = 28;
    const sedan = createSedanGeometries();
    const sedanWheel = createAlloyWheelGeometries(0.30, 0.24);
    this.sedanBodyMesh = new THREE.InstancedMesh(sedan.bodyGeo, carPaintMat, this.sedanCount);
    this.sedanGlassMesh = new THREE.InstancedMesh(sedan.glassGeo, carGlassMat, this.sedanCount);
    this.sedanTrimMesh = new THREE.InstancedMesh(sedan.trimGeo, trimMat, this.sedanCount);
    this.sedanHeadMesh = new THREE.InstancedMesh(sedan.headGeo, this.headLightMat, this.sedanCount);
    this.sedanTailMesh = new THREE.InstancedMesh(sedan.tailGeo, tailLightMat, this.sedanCount);
    this.sedanWheelMesh = new THREE.InstancedMesh(sedanWheel.tireGeo, tireMat, this.sedanCount * 4);
    this.sedanRimMesh = new THREE.InstancedMesh(sedanWheel.rimGeo, chromeMat, this.sedanCount * 4);

    // 2. Sport GT Coupes (14)
    this.coupeCount = 14;
    const coupe = createCoupeGeometries();
    const coupeWheel = createAlloyWheelGeometries(0.29, 0.25);
    this.coupeBodyMesh = new THREE.InstancedMesh(coupe.bodyGeo, coupePaintMat, this.coupeCount);
    this.coupeGlassMesh = new THREE.InstancedMesh(coupe.glassGeo, carGlassMat, this.coupeCount);
    this.coupeTrimMesh = new THREE.InstancedMesh(coupe.trimGeo, trimMat, this.coupeCount);
    this.coupeHeadMesh = new THREE.InstancedMesh(coupe.headGeo, this.headLightMat, this.coupeCount);
    this.coupeTailMesh = new THREE.InstancedMesh(coupe.tailGeo, tailLightMat, this.coupeCount);
    this.coupeWheelMesh = new THREE.InstancedMesh(coupeWheel.tireGeo, tireMat, this.coupeCount * 4);
    this.coupeRimMesh = new THREE.InstancedMesh(coupeWheel.rimGeo, chromeMat, this.coupeCount * 4);

    // 3. Modern Executive SUVs (22)
    this.suvCount = 22;
    const suv = createSuvGeometries();
    const suvWheel = createAlloyWheelGeometries(0.35, 0.27);
    this.suvBodyMesh = new THREE.InstancedMesh(suv.bodyGeo, suvPaintMat, this.suvCount);
    this.suvGlassMesh = new THREE.InstancedMesh(suv.glassGeo, carGlassMat, this.suvCount);
    this.suvTrimMesh = new THREE.InstancedMesh(suv.trimGeo, trimMat, this.suvCount);
    this.suvHeadMesh = new THREE.InstancedMesh(suv.headGeo, this.headLightMat, this.suvCount);
    this.suvTailMesh = new THREE.InstancedMesh(suv.tailGeo, tailLightMat, this.suvCount);
    this.suvWheelMesh = new THREE.InstancedMesh(suvWheel.tireGeo, tireMat, this.suvCount * 4);
    this.suvRimMesh = new THREE.InstancedMesh(suvWheel.rimGeo, chromeMat, this.suvCount * 4);

    // 4. Sculpted Long-Nose Semi-Trucks (16)
    this.truckCount = 16;
    const truck = createTruckGeometries();
    const truckWheelGeo = createAlloyWheelGeometries(0.40, 0.30);
    const truckCabMat = new THREE.MeshPhysicalMaterial({ metalness: 0.78, roughness: 0.20, clearcoat: 0.90 });
    const truckCargoMat = new THREE.MeshStandardMaterial({
      map: textures?.corrugatedMap || null,
      bumpMap: textures?.corrugatedBump || null,
      bumpScale: 0.04,
      color: 0xe2e8f0,
      roughness: 0.45,
      metalness: 0.35,
    });

    this.truckCabMesh = new THREE.InstancedMesh(truck.cabGeo, truckCabMat, this.truckCount);
    this.truckGlassMesh = new THREE.InstancedMesh(truck.glassGeo, carGlassMat, this.truckCount);
    this.truckTrimMesh = new THREE.InstancedMesh(truck.trimGeo, chromeMat, this.truckCount);
    this.truckHeadMesh = new THREE.InstancedMesh(truck.headGeo, this.headLightMat, this.truckCount);
    this.truckTailMesh = new THREE.InstancedMesh(truck.tailGeo, tailLightMat, this.truckCount);
    this.truckCargoMesh = new THREE.InstancedMesh(truck.trailerGeo, truckCargoMat, this.truckCount);
    this.truckWheelMesh = new THREE.InstancedMesh(truckWheelGeo.tireGeo, tireMat, this.truckCount * 6);
    this.truckRimMesh = new THREE.InstancedMesh(truckWheelGeo.rimGeo, chromeMat, this.truckCount * 6);

    // Contact Shadows & Night Headlight Ground Cones
    this.totalVehicles = this.sedanCount + this.coupeCount + this.suvCount + this.truckCount;
    const carShadowGeo = new THREE.PlaneGeometry(2.35, 4.95);
    carShadowGeo.rotateX(-Math.PI / 2);
    this.vehicleShadowMesh = new THREE.InstancedMesh(carShadowGeo, shadowMat, this.totalVehicles);

    const beamGeo = new THREE.PlaneGeometry(3.4, 7.2);
    beamGeo.rotateX(-Math.PI / 2);
    this.vehicleBeamMesh = new THREE.InstancedMesh(beamGeo, this.beamMat, this.totalVehicles);
    this.vehicleBeamMesh.visible = false;

    [
      this.sedanBodyMesh, this.sedanGlassMesh, this.sedanTrimMesh, this.sedanHeadMesh, this.sedanTailMesh, this.sedanWheelMesh, this.sedanRimMesh,
      this.coupeBodyMesh, this.coupeGlassMesh, this.coupeTrimMesh, this.coupeHeadMesh, this.coupeTailMesh, this.coupeWheelMesh, this.coupeRimMesh,
      this.suvBodyMesh, this.suvGlassMesh, this.suvTrimMesh, this.suvHeadMesh, this.suvTailMesh, this.suvWheelMesh, this.suvRimMesh,
      this.truckCabMesh, this.truckGlassMesh, this.truckTrimMesh, this.truckHeadMesh, this.truckTailMesh, this.truckCargoMesh, this.truckWheelMesh, this.truckRimMesh,
      this.vehicleShadowMesh, this.vehicleBeamMesh,
    ].forEach((m) => {
      m.frustumCulled = false;
      scene.add(m);
    });
    [this.sedanBodyMesh, this.coupeBodyMesh, this.suvBodyMesh, this.truckCabMesh, this.truckCargoMesh].forEach((m) => {
      m.castShadow = true;
      m.receiveShadow = true;
    });

    // Populate Vehicle Fleet
    const carColors = [0x0f172a, 0xf1f5f9, 0x94a3b8, 0x1e40af, 0x991b1b, 0x065f46, 0x334155, 0x475569];
    const coupeColors = [0xb91c1c, 0x0284c7, 0xeab308, 0x0f172a, 0xe2e8f0, 0x047857];
    const suvColors = [0x111827, 0xe2e8f0, 0x1e3a5f, 0x3f4a3c, 0x57534e, 0x7f1d1d];
    const truckColors = [0x0369a1, 0xb45309, 0x1e293b, 0x047857];

    this.vehicles = [];
    for (let i = 0; i < this.totalVehicles; i++) {
      let kind, localIdx;
      if (i < this.sedanCount) {
        kind = 'sedan';
        localIdx = i;
      } else if (i < this.sedanCount + this.coupeCount) {
        kind = 'coupe';
        localIdx = i - this.sedanCount;
      } else if (i < this.sedanCount + this.coupeCount + this.suvCount) {
        kind = 'suv';
        localIdx = i - this.sedanCount - this.coupeCount;
      } else {
        kind = 'truck';
        localIdx = i - this.sedanCount - this.coupeCount - this.suvCount;
      }

      const laneIdx = i % (roadLines.length * 2);
      const axis = laneIdx % 2 === 0 ? 'z' : 'x';
      const roadCoord = roadLines[(Math.floor(i / 2)) % roadLines.length];
      const dir = (i % 4 < 2) ? 1 : -1;
      const maxSpeed =
        kind === 'coupe' ? 14.0 + (i % 4) * 1.6 :
        kind === 'sedan' ? 12.0 + (i % 4) * 1.4 :
        kind === 'suv' ? 10.8 + (i % 3) * 1.3 :
        8.4 + (i % 3) * 1.1;

      this.vehicles.push({
        kind,
        localIdx,
        axis,
        roadCoord,
        dir,
        laneOffset: dir * 1.78,
        pos: -130 + ((i * 23) % 260),
        maxSpeed,
        curSpeed: maxSpeed,
        wheelSpin: i * 0.7,
        braking: false,
      });

      if (kind === 'sedan') {
        _color.setHex(carColors[localIdx % carColors.length]);
        this.sedanBodyMesh.setColorAt(localIdx, _color);
        _color.setHex(0x881111);
        this.sedanTailMesh.setColorAt(localIdx, _color);
      } else if (kind === 'coupe') {
        _color.setHex(coupeColors[localIdx % coupeColors.length]);
        this.coupeBodyMesh.setColorAt(localIdx, _color);
        _color.setHex(0x881111);
        this.coupeTailMesh.setColorAt(localIdx, _color);
      } else if (kind === 'suv') {
        _color.setHex(suvColors[localIdx % suvColors.length]);
        this.suvBodyMesh.setColorAt(localIdx, _color);
        _color.setHex(0x881111);
        this.suvTailMesh.setColorAt(localIdx, _color);
      } else {
        _color.setHex(truckColors[localIdx % truckColors.length]);
        this.truckCabMesh.setColorAt(localIdx, _color);
        _color.setHex(0x881111);
        this.truckTailMesh.setColorAt(localIdx, _color);
      }
    }
    this.sedanBodyMesh.instanceColor.needsUpdate = true;
    this.sedanTailMesh.instanceColor.needsUpdate = true;
    this.coupeBodyMesh.instanceColor.needsUpdate = true;
    this.coupeTailMesh.instanceColor.needsUpdate = true;
    this.suvBodyMesh.instanceColor.needsUpdate = true;
    this.suvTailMesh.instanceColor.needsUpdate = true;
    this.truckCabMesh.instanceColor.needsUpdate = true;
    this.truckTailMesh.instanceColor.needsUpdate = true;

    // 5. Realistic Articulated Multi-Part Pedestrians (8 batched InstancedMeshes for 96 humans)
    this.pedCount = 96;
    const humanGeo = createRealisticHumanGeometries();
    const clothMat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.04 });
    const skinMat = new THREE.MeshStandardMaterial({ roughness: 0.66, metalness: 0.02 });
    const hairMat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.08 });
    const pantsMat = new THREE.MeshStandardMaterial({ roughness: 0.86, metalness: 0.04 });
    const shoeMat = new THREE.MeshStandardMaterial({ roughness: 0.56, metalness: 0.14 });
    const pedShadowMat = new THREE.MeshBasicMaterial({
      map: textures?.contactShadow || null,
      color: 0x000000,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    });

    this.pedTorsoMesh = new THREE.InstancedMesh(humanGeo.torsoGeo, clothMat, this.pedCount);
    this.pedHeadMesh = new THREE.InstancedMesh(humanGeo.headGeo, skinMat, this.pedCount);
    this.pedHairMesh = new THREE.InstancedMesh(humanGeo.hairGeo, hairMat, this.pedCount);
    this.pedArmMesh = new THREE.InstancedMesh(humanGeo.armGeo, clothMat, this.pedCount * 2);
    this.pedHandMesh = new THREE.InstancedMesh(humanGeo.handGeo, skinMat, this.pedCount * 2);
    this.pedThighMesh = new THREE.InstancedMesh(humanGeo.thighGeo, pantsMat, this.pedCount * 2);
    this.pedShinMesh = new THREE.InstancedMesh(humanGeo.shinGeo, pantsMat, this.pedCount * 2);
    this.pedShoeMesh = new THREE.InstancedMesh(humanGeo.shoeGeo, shoeMat, this.pedCount * 2);

    const pedShadowGeo = new THREE.PlaneGeometry(0.68, 0.68);
    pedShadowGeo.rotateX(-Math.PI / 2);
    this.pedShadowMesh = new THREE.InstancedMesh(pedShadowGeo, pedShadowMat, this.pedCount);

    [
      this.pedTorsoMesh,
      this.pedHeadMesh,
      this.pedHairMesh,
      this.pedArmMesh,
      this.pedHandMesh,
      this.pedThighMesh,
      this.pedShinMesh,
      this.pedShoeMesh,
      this.pedShadowMesh,
    ].forEach((m) => {
      m.frustumCulled = false;
      if (m !== this.pedShadowMesh) m.castShadow = true;
      scene.add(m);
    });

    const skinTones = [0xf5d0b5, 0xebc09e, 0xd9a27b, 0xbd835b, 0x8d5534, 0x5c3824];
    const hairTones = [0x141210, 0x2c1d13, 0x4e3222, 0x6f4628, 0xa87d43, 0x9ca3af, 0x7c2d12];
    const topColors = [0x1e3a5f, 0x334155, 0x7f1d1d, 0x064e3b, 0xe2e8f0, 0xb45309, 0x312e81, 0x475569, 0x0f766e, 0x78350f];
    const pantColors = [0x0f172a, 0x1e293b, 0x1d3557, 0x4b5563, 0x786852, 0x27272a];
    const shoeColors = [0x111827, 0x3b2416, 0xe2e8f0, 0x1e293b, 0x451a03];

    this.peds = [];
    for (let i = 0; i < this.pedCount; i++) {
      const axis = i % 2 === 0 ? 'z' : 'x';
      const roadCoord = roadLines[(i * 3) % roadLines.length];
      const side = (i % 4 < 2 ? 1 : -1) * 4.65;
      const dir = i % 3 === 0 ? 1 : -1;
      const heightScale = 0.94 + ((i * 13) % 15) * 0.01;
      const buildScale = 0.92 + ((i * 7) % 13) * 0.015;
      this.peds.push({
        axis,
        roadCoord,
        side,
        dir,
        pos: -126 + ((i * 19) % 252),
        speed: 1.48 + (i % 4) * 0.25,
        phase: i * 0.9,
        heightScale,
        buildScale,
      });

      _color.setHex(topColors[i % topColors.length]);
      this.pedTorsoMesh.setColorAt(i, _color);
      this.pedArmMesh.setColorAt(i * 2, _color);
      this.pedArmMesh.setColorAt(i * 2 + 1, _color);

      _color.setHex(skinTones[(i * 3) % skinTones.length]);
      this.pedHeadMesh.setColorAt(i, _color);
      this.pedHandMesh.setColorAt(i * 2, _color);
      this.pedHandMesh.setColorAt(i * 2 + 1, _color);

      _color.setHex(hairTones[(i * 5) % hairTones.length]);
      this.pedHairMesh.setColorAt(i, _color);

      _color.setHex(pantColors[(i * 7) % pantColors.length]);
      this.pedThighMesh.setColorAt(i * 2, _color);
      this.pedThighMesh.setColorAt(i * 2 + 1, _color);
      this.pedShinMesh.setColorAt(i * 2, _color);
      this.pedShinMesh.setColorAt(i * 2 + 1, _color);

      _color.setHex(shoeColors[(i * 11) % shoeColors.length]);
      this.pedShoeMesh.setColorAt(i * 2, _color);
      this.pedShoeMesh.setColorAt(i * 2 + 1, _color);
    }
    this.pedTorsoMesh.instanceColor.needsUpdate = true;
    this.pedArmMesh.instanceColor.needsUpdate = true;
    this.pedHeadMesh.instanceColor.needsUpdate = true;
    this.pedHandMesh.instanceColor.needsUpdate = true;
    this.pedHairMesh.instanceColor.needsUpdate = true;
    this.pedThighMesh.instanceColor.needsUpdate = true;
    this.pedShinMesh.instanceColor.needsUpdate = true;
    this.pedShoeMesh.instanceColor.needsUpdate = true;

    // 6. Ocean Container Ship + Harbor Tugboat
    const shipBuilt = createRealisticContainerShip();
    this.ship = shipBuilt.ship;
    this.shipRadar = shipBuilt.shipRadar;
    this.ship.position.set(-75, -0.45, 178);
    scene.add(this.ship);

    this.tug = createHarborTugboat();
    this.tug.position.set(-60, -0.45, 163);
    scene.add(this.tug);

    // 7. Commercial Jetliner flying coastal approach circuit over the runway
    const planeBuilt = createRealisticAirliner();
    this.plane = planeBuilt.plane;
    this.planeBeacon = planeBuilt.planeBeacon;
    scene.add(this.plane);

    this.elapsed = 0;
    this.shipVelSign = 1;
    this.tugVelSign = 1;
    this.effectEmitters = {
      shipPos: new THREE.Vector3(),
      shipDir: 1,
      shipFunnel: new THREE.Vector3(),
      tugPos: new THREE.Vector3(),
      tugDir: 1,
      planeEngineL: new THREE.Vector3(),
      planeEngineR: new THREE.Vector3(),
      movingCars: [],
    };
  }

  _planePositionAt(t, out) {
    const angle = (t * 0.044) * Math.PI * 2;
    const cx = 104;
    const cz = -10;
    const rx = 56;
    const rz = 126;
    const x = cx + Math.sin(angle) * rx;
    const z = cz + Math.cos(angle) * rz;
    // Lower smoothly when aligned on coastal runway side (x > 140), climb gracefully out to sea/city
    const runwayDip = Math.max(0, Math.sin(angle));
    const y = 38 - runwayDip * 23 + Math.sin(angle * 2) * 3.5;
    return out.set(x, y, z);
  }

  _shouldStop(v, vIdx, nsGreen, ewGreen) {
    const isGreen = v.axis === 'z' ? nsGreen : ewGreen;
    if (!isGreen && Math.abs(v.roadCoord) <= 85) {
      for (const inter of this.signalIntersections) {
        const distAhead = (inter - v.pos) * v.dir;
        if (distAhead > 4.6 && distAhead < 10.2) return true;
      }
    }

    const minGap = v.kind === 'truck' ? 9.4 : 7.5;
    for (let j = 0; j < this.totalVehicles; j++) {
      if (j === vIdx) continue;
      const other = this.vehicles[j];
      if (other.axis !== v.axis || other.roadCoord !== v.roadCoord || other.dir !== v.dir) continue;
      let delta = (other.pos - v.pos) * v.dir;
      if (delta < -230) delta += 268;
      if (delta > 0 && delta < minGap) return true;
    }
    return false;
  }

  update(dt, daylight = 1.0) {
    this.elapsed += dt;
    const phase = this.elapsed % 14;
    const nsGreen = phase < 6;
    const ewGreen = phase >= 7 && phase < 13;

    if (this.terrainRefs?.sigNSMat && this.terrainRefs?.sigEWMat) {
      this.terrainRefs.sigNSMat.color.setHex(nsGreen ? 0x10b981 : phase < 7 ? 0xf59e0b : 0xef4444);
      this.terrainRefs.sigNSMat.emissive.setHex(nsGreen ? 0x10b981 : phase < 7 ? 0xf59e0b : 0xef4444);
      this.terrainRefs.sigEWMat.color.setHex(ewGreen ? 0x10b981 : phase >= 13 ? 0xf59e0b : 0xef4444);
      this.terrainRefs.sigEWMat.emissive.setHex(ewGreen ? 0x10b981 : phase >= 13 ? 0xf59e0b : 0xef4444);
    }

    const nightStrength = Math.max(0, 1.0 - daylight * 1.4);
    this.beamMat.opacity = nightStrength * 0.44;
    this.vehicleBeamMesh.visible = nightStrength > 0.03;
    this.headLightMat.emissiveIntensity = 1.4 + nightStrength * 2.3;

    const sedanWheels = [[-0.81, 0.30, 1.32], [0.81, 0.30, 1.32], [-0.81, 0.30, -1.32], [0.81, 0.30, -1.32]];
    const coupeWheels = [[-0.84, 0.29, 1.28], [0.84, 0.29, 1.28], [-0.84, 0.29, -1.28], [0.84, 0.29, -1.28]];
    const suvWheels = [[-0.86, 0.35, 1.34], [0.86, 0.35, 1.34], [-0.86, 0.35, -1.34], [0.86, 0.35, -1.34]];
    const truckWheels = [
      [-0.88, 0.40, 2.46], [0.88, 0.40, 2.46],
      [-0.88, 0.40, 0.35], [0.88, 0.40, 0.35],
      [-0.88, 0.40, -2.95], [0.88, 0.40, -2.95],
    ];

    for (let i = 0; i < this.totalVehicles; i++) {
      const v = this.vehicles[i];
      const stop = this._shouldStop(v, i, nsGreen, ewGreen);
      const targetSpeed = stop ? 0 : v.maxSpeed;
      const prevSpeed = v.curSpeed;
      v.curSpeed = THREE.MathUtils.lerp(v.curSpeed, targetSpeed, Math.min(1, dt * (stop ? 7.8 : 3.0)));
      v.braking = stop || (v.curSpeed < prevSpeed - 0.05) || v.curSpeed < 1.0;

      v.pos += v.dir * v.curSpeed * dt;
      if (v.pos > 134) v.pos = -134;
      if (v.pos < -134) v.pos = 134;

      const wheelRadius = v.kind === 'coupe' ? 0.29 : v.kind === 'sedan' ? 0.30 : v.kind === 'suv' ? 0.35 : 0.40;
      v.wheelSpin += (v.curSpeed * dt) / wheelRadius;

      let wx, wz, rotY;
      if (v.axis === 'z') {
        wx = v.roadCoord + v.laneOffset;
        wz = v.pos;
        rotY = v.dir > 0 ? 0 : Math.PI;
      } else {
        wx = v.pos;
        wz = v.roadCoord - v.laneOffset;
        rotY = v.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }

      const cosR = Math.cos(rotY);
      const sinR = Math.sin(rotY);
      const fwdX = Math.sin(rotY);
      const fwdZ = Math.cos(rotY);

      _dummy.position.set(wx, 0.056, wz);
      _dummy.rotation.set(0, rotY, 0);
      _dummy.scale.set(v.kind === 'truck' ? 1.15 : 1.0, 1, v.kind === 'truck' ? 1.65 : 1.0);
      _dummy.updateMatrix();
      this.vehicleShadowMesh.setMatrixAt(i, _dummy.matrix);

      if (this.vehicleBeamMesh.visible) {
        const beamDist = v.kind === 'truck' ? 6.8 : v.kind === 'suv' ? 5.4 : 5.2;
        _dummy.position.set(wx + fwdX * beamDist, 0.060, wz + fwdZ * beamDist);
        _dummy.rotation.set(0, rotY, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        this.vehicleBeamMesh.setMatrixAt(i, _dummy.matrix);
      }

      _dummy.position.set(wx, 0.048, wz);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();

      if (v.kind === 'sedan') {
        const idx = v.localIdx;
        this.sedanBodyMesh.setMatrixAt(idx, _dummy.matrix);
        this.sedanGlassMesh.setMatrixAt(idx, _dummy.matrix);
        this.sedanTrimMesh.setMatrixAt(idx, _dummy.matrix);
        this.sedanHeadMesh.setMatrixAt(idx, _dummy.matrix);
        this.sedanTailMesh.setMatrixAt(idx, _dummy.matrix);
        _color.setHex(v.braking ? 0xff4433 : 0x660b0b);
        this.sedanTailMesh.setColorAt(idx, _color);

        for (let w = 0; w < 4; w++) {
          const [lx, ly, lz] = sedanWheels[w];
          _wheelDummy.position.set(wx + lx * cosR + lz * sinR, ly + 0.048, wz - lx * sinR + lz * cosR);
          _wheelDummy.rotation.set(0, rotY, 0);
          _wheelDummy.rotateX(v.wheelSpin);
          _wheelDummy.updateMatrix();
          this.sedanWheelMesh.setMatrixAt(idx * 4 + w, _wheelDummy.matrix);
          this.sedanRimMesh.setMatrixAt(idx * 4 + w, _wheelDummy.matrix);
        }
      } else if (v.kind === 'coupe') {
        const idx = v.localIdx;
        this.coupeBodyMesh.setMatrixAt(idx, _dummy.matrix);
        this.coupeGlassMesh.setMatrixAt(idx, _dummy.matrix);
        this.coupeTrimMesh.setMatrixAt(idx, _dummy.matrix);
        this.coupeHeadMesh.setMatrixAt(idx, _dummy.matrix);
        this.coupeTailMesh.setMatrixAt(idx, _dummy.matrix);
        _color.setHex(v.braking ? 0xff4433 : 0x660b0b);
        this.coupeTailMesh.setColorAt(idx, _color);

        for (let w = 0; w < 4; w++) {
          const [lx, ly, lz] = coupeWheels[w];
          _wheelDummy.position.set(wx + lx * cosR + lz * sinR, ly + 0.048, wz - lx * sinR + lz * cosR);
          _wheelDummy.rotation.set(0, rotY, 0);
          _wheelDummy.rotateX(v.wheelSpin);
          _wheelDummy.updateMatrix();
          this.coupeWheelMesh.setMatrixAt(idx * 4 + w, _wheelDummy.matrix);
          this.coupeRimMesh.setMatrixAt(idx * 4 + w, _wheelDummy.matrix);
        }
      } else if (v.kind === 'suv') {
        const idx = v.localIdx;
        this.suvBodyMesh.setMatrixAt(idx, _dummy.matrix);
        this.suvGlassMesh.setMatrixAt(idx, _dummy.matrix);
        this.suvTrimMesh.setMatrixAt(idx, _dummy.matrix);
        this.suvHeadMesh.setMatrixAt(idx, _dummy.matrix);
        this.suvTailMesh.setMatrixAt(idx, _dummy.matrix);
        _color.setHex(v.braking ? 0xff4433 : 0x660b0b);
        this.suvTailMesh.setColorAt(idx, _color);

        for (let w = 0; w < 4; w++) {
          const [lx, ly, lz] = suvWheels[w];
          _wheelDummy.position.set(wx + lx * cosR + lz * sinR, ly + 0.048, wz - lx * sinR + lz * cosR);
          _wheelDummy.rotation.set(0, rotY, 0);
          _wheelDummy.rotateX(v.wheelSpin);
          _wheelDummy.updateMatrix();
          this.suvWheelMesh.setMatrixAt(idx * 4 + w, _wheelDummy.matrix);
          this.suvRimMesh.setMatrixAt(idx * 4 + w, _wheelDummy.matrix);
        }
      } else {
        const idx = v.localIdx;
        this.truckCabMesh.setMatrixAt(idx, _dummy.matrix);
        this.truckGlassMesh.setMatrixAt(idx, _dummy.matrix);
        this.truckTrimMesh.setMatrixAt(idx, _dummy.matrix);
        this.truckHeadMesh.setMatrixAt(idx, _dummy.matrix);
        this.truckTailMesh.setMatrixAt(idx, _dummy.matrix);
        this.truckCargoMesh.setMatrixAt(idx, _dummy.matrix);
        _color.setHex(v.braking ? 0xff4433 : 0x660b0b);
        this.truckTailMesh.setColorAt(idx, _color);

        for (let w = 0; w < 6; w++) {
          const [lx, ly, lz] = truckWheels[w];
          _wheelDummy.position.set(wx + lx * cosR + lz * sinR, ly + 0.048, wz - lx * sinR + lz * cosR);
          _wheelDummy.rotation.set(0, rotY, 0);
          _wheelDummy.rotateX(v.wheelSpin);
          _wheelDummy.updateMatrix();
          this.truckWheelMesh.setMatrixAt(idx * 6 + w, _wheelDummy.matrix);
          this.truckRimMesh.setMatrixAt(idx * 6 + w, _wheelDummy.matrix);
        }
      }
    }

    [
      this.sedanBodyMesh, this.sedanGlassMesh, this.sedanTrimMesh, this.sedanHeadMesh, this.sedanTailMesh, this.sedanWheelMesh, this.sedanRimMesh,
      this.coupeBodyMesh, this.coupeGlassMesh, this.coupeTrimMesh, this.coupeHeadMesh, this.coupeTailMesh, this.coupeWheelMesh, this.coupeRimMesh,
      this.suvBodyMesh, this.suvGlassMesh, this.suvTrimMesh, this.suvHeadMesh, this.suvTailMesh, this.suvWheelMesh, this.suvRimMesh,
      this.truckCabMesh, this.truckGlassMesh, this.truckTrimMesh, this.truckHeadMesh, this.truckTailMesh, this.truckCargoMesh, this.truckWheelMesh, this.truckRimMesh,
      this.vehicleShadowMesh, this.vehicleBeamMesh,
    ].forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
    });
    this.sedanTailMesh.instanceColor.needsUpdate = true;
    this.coupeTailMesh.instanceColor.needsUpdate = true;
    this.suvTailMesh.instanceColor.needsUpdate = true;
    this.truckTailMesh.instanceColor.needsUpdate = true;

    for (let i = 0; i < this.pedCount; i++) {
      const p = this.peds[i];
      p.pos += p.dir * p.speed * dt;
      if (p.pos > 130) p.pos = -130;
      if (p.pos < -130) p.pos = 130;

      const gaitPhase = this.elapsed * (p.speed * 3.8) + p.phase;
      const stride = Math.sin(gaitPhase);
      const bob = Math.abs(Math.cos(gaitPhase)) * 0.032 * p.heightScale;
      const px = p.axis === 'z' ? p.roadCoord + p.side : p.pos;
      const pz = p.axis === 'z' ? p.pos : p.roadCoord + p.side;
      const rotY = p.axis === 'z' ? (p.dir > 0 ? 0 : Math.PI) : (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2);

      // Soft contact shadow grounded flush on sidewalk top (y = 0.135)
      _dummy.position.set(px, 0.136, pz);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(p.buildScale, 1, p.buildScale);
      _dummy.updateMatrix();
      this.pedShadowMesh.setMatrixAt(i, _dummy.matrix);

      // Hip/Pelvis base matrix with natural stride bob & slight pelvic twist
      const hipY = 0.132 + 0.802 * p.heightScale + bob * 0.45;
      _euler.set(0.04, rotY + stride * 0.055, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _vecA.set(p.buildScale, p.heightScale, p.buildScale);
      _matA.compose(_dummy.position.set(px, hipY, pz), _quat, _vecA);
      this.pedTorsoMesh.setMatrixAt(i, _matA);

      // Neck & Head + Hair mounted at top of torso (local y = 0.545) with subtle head counter-balance
      _euler.set(-0.04, -stride * 0.045, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _matB.compose(_dummy.position.set(0, 0.545, 0.012), _quat, _scaleOne);
      _matC.multiplyMatrices(_matA, _matB);
      this.pedHeadMesh.setMatrixAt(i, _matC);
      this.pedHairMesh.setMatrixAt(i, _matC);

      // Left & Right Arms + Hands (natural opposite counter-swing from shoulders at ±0.215, 0.475, 0)
      for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
        const sgn = sideIdx === 0 ? -1 : 1;
        const armSwing = (sideIdx === 0 ? stride : -stride) * 0.46;
        _euler.set(armSwing, 0, sgn * 0.08, 'XYZ');
        _quat.setFromEuler(_euler);
        _matB.compose(_dummy.position.set(sgn * 0.215, 0.475, 0), _quat, _scaleOne);
        _matC.multiplyMatrices(_matA, _matB);
        this.pedArmMesh.setMatrixAt(i * 2 + sideIdx, _matC);
        this.pedHandMesh.setMatrixAt(i * 2 + sideIdx, _matC);
      }

      // Left & Right Articulated Legs: Hip Thigh Swing + Authentic Asymmetric Knee Flexion + Shoes
      for (let legIdx = 0; legIdx < 2; legIdx++) {
        const sgn = legIdx === 0 ? -1 : 1;
        const legPhase = legIdx === 0 ? gaitPhase : gaitPhase + Math.PI;
        // Hip swings negative X = forward leg lift in Three.js (+Z forward!)
        const hipPitch = -Math.sin(legPhase) * 0.46;
        // Real human knee bends backward (+X rotation) during swing-through & relaxes on stance
        const kneeBend = Math.max(0.04, Math.sin(legPhase - 0.55) * 0.68);

        _euler.set(hipPitch, 0, 0, 'XYZ');
        _quat.setFromEuler(_euler);
        _matB.compose(_dummy.position.set(sgn * 0.095, 0.02, 0), _quat, _scaleOne);
        // _matC = Thigh world matrix
        _matC.multiplyMatrices(_matA, _matB);
        this.pedThighMesh.setMatrixAt(i * 2 + legIdx, _matC);

        // Knee joint sits at thigh local (0, -0.39, 0)
        _euler.set(kneeBend, 0, 0, 'XYZ');
        _quat.setFromEuler(_euler);
        _matB.compose(_dummy.position.set(0, -0.39, 0), _quat, _scaleOne);
        _matC.multiply(_matB);
        this.pedShinMesh.setMatrixAt(i * 2 + legIdx, _matC);
        this.pedShoeMesh.setMatrixAt(i * 2 + legIdx, _matC);
      }
    }
    this.pedTorsoMesh.instanceMatrix.needsUpdate = true;
    this.pedHeadMesh.instanceMatrix.needsUpdate = true;
    this.pedHairMesh.instanceMatrix.needsUpdate = true;
    this.pedArmMesh.instanceMatrix.needsUpdate = true;
    this.pedHandMesh.instanceMatrix.needsUpdate = true;
    this.pedThighMesh.instanceMatrix.needsUpdate = true;
    this.pedShinMesh.instanceMatrix.needsUpdate = true;
    this.pedShoeMesh.instanceMatrix.needsUpdate = true;
    this.pedShadowMesh.instanceMatrix.needsUpdate = true;

    // Ocean Container Ship + Harbor Tugboat cruising smoothly along harbor channel at realistic waterline draft
    const shipVx = Math.cos(this.elapsed * 0.055);
    this.shipVelSign = shipVx >= 0 ? 1 : -1;
    const sx = -75 + Math.sin(this.elapsed * 0.055) * 62;
    const shipWave = Math.sin((0.32 * sx + 0.95 * 178) * 0.085 + this.elapsed * 1.45) * 0.11;
    this.ship.position.x = sx;
    this.ship.position.y = -1.30 + shipWave;
    this.ship.rotation.z = Math.sin(this.elapsed * 0.95) * 0.014;
    this.ship.rotation.x = Math.cos(this.elapsed * 1.25) * 0.008;
    this.ship.rotation.y = this.shipVelSign > 0 ? 0 : Math.PI;
    this.shipRadar.rotation.y = this.elapsed * 2.8;

    const tugVx = -Math.sin(this.elapsed * 0.14);
    this.tugVelSign = tugVx >= 0 ? 1 : -1;
    const tx = -72 + Math.cos(this.elapsed * 0.14) * 52;
    const tz = 164 + Math.sin(this.elapsed * 0.14) * 2.5;
    const tugWave = Math.sin((0.32 * tx + 0.95 * tz) * 0.085 + this.elapsed * 1.45) * 0.09;
    this.tug.position.x = tx;
    this.tug.position.z = tz;
    this.tug.position.y = -0.54 + tugWave;
    this.tug.rotation.y = this.tugVelSign > 0 ? 0 : Math.PI;
    this.tug.rotation.x = Math.sin(this.elapsed * 2.0) * 0.025;
    this.tug.rotation.z = Math.cos(this.elapsed * 1.7) * 0.018;

    // Commercial Jetliner aligned strictly with forward flight tangent + coordinated bank
    this._planePositionAt(this.elapsed, this.plane.position);
    this._planePositionAt(this.elapsed + 0.06, _planeNext);
    _planeDir.subVectors(_planeNext, this.plane.position).normalize();
    this.plane.lookAt(_planeNext);
    this.plane.rotateZ(-0.26); // Coordinated left-wing bank around oval track
    this.planeBeacon.visible = Math.sin(this.elapsed * 7.5) > 0.35;

    // Update dynamic effect emitter anchors
    this.plane.updateMatrixWorld();
    this.effectEmitters.planeEngineL.set(-2.5, -0.58, -0.6).applyMatrix4(this.plane.matrixWorld);
    this.effectEmitters.planeEngineR.set(2.5, -0.58, -0.6).applyMatrix4(this.plane.matrixWorld);
    this.effectEmitters.shipPos.copy(this.ship.position);
    this.effectEmitters.shipDir = this.shipVelSign;
    this.effectEmitters.shipFunnel.set(
      this.ship.position.x - this.shipVelSign * 13.6,
      this.ship.position.y + 9.2,
      this.ship.position.z
    );
    this.effectEmitters.tugPos.copy(this.tug.position);
    this.effectEmitters.tugDir = this.tugVelSign;
  }

  getMovingVehicleSpots(outArr) {
    outArr.length = 0;
    for (let i = 0; i < this.totalVehicles; i++) {
      const v = this.vehicles[i];
      if (v.curSpeed < 4.5) continue;
      const wx = v.axis === 'z' ? v.roadCoord + v.laneOffset : v.pos;
      const wz = v.axis === 'z' ? v.pos : v.roadCoord - v.laneOffset;
      outArr.push({ x: wx, z: wz, dir: v.dir, axis: v.axis });
    }
    return outArr;
  }
}
