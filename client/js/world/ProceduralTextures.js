import * as THREE from 'three';

export function createProceduralTextures(maxAniso = 8) {
  const prep = (canvas, repeatX = 1, repeatY = 1, isColor = true) => {
    const tex = new THREE.CanvasTexture(canvas);
    if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = maxAniso;
    tex.needsUpdate = true;
    return tex;
  };

  // 1. High-Res Architectural Glass Curtain Wall (Albedo + Interior Floor Depth + Emissive + Bump + Roughness)
  const wW = 512;
  const wH = 1024;
  const winCanvas = document.createElement('canvas');
  winCanvas.width = wW;
  winCanvas.height = wH;
  const wctx = winCanvas.getContext('2d');

  const emCanvas = document.createElement('canvas');
  emCanvas.width = wW;
  emCanvas.height = wH;
  const ectx = emCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = wW;
  bumpCanvas.height = wH;
  const bctx = bumpCanvas.getContext('2d');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = wW;
  roughCanvas.height = wH;
  const rghCtx = roughCanvas.getContext('2d');

  wctx.fillStyle = '#182232';
  wctx.fillRect(0, 0, wW, wH);
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, wW, wH);
  bctx.fillStyle = '#dcdce0';
  bctx.fillRect(0, 0, wW, wH);
  rghCtx.fillStyle = '#858585';
  rghCtx.fillRect(0, 0, wW, wH);

  const cols = 10;
  const rows = 20;
  const cw = wW / cols;
  const ch = wH / rows;

  for (let r = 0; r < rows; r++) {
    // Spandrel structural floor slab band
    wctx.fillStyle = '#263347';
    wctx.fillRect(0, r * ch, wW, 9);
    wctx.fillStyle = '#334155';
    wctx.fillRect(0, r * ch + 9, wW, 2);

    for (let c = 0; c < cols; c++) {
      const gx = c * cw + 3;
      const gy = r * ch + 11;
      const gw = cw - 6;
      const gh = ch - 14;

      const grad = wctx.createLinearGradient(gx, gy, gx, gy + gh);
      const seed = (r * 17 + c * 31) % 11;
      grad.addColorStop(0, seed > 3 ? '#3c6890' : '#264463');
      grad.addColorStop(0.55, '#19314a');
      grad.addColorStop(1, '#0c1828');
      wctx.fillStyle = grad;
      wctx.fillRect(gx, gy, gw, gh);

      // Subtle interior Venetian blinds on upper portion of random office bays
      if (seed % 3 === 0) {
        wctx.fillStyle = 'rgba(203, 213, 225, 0.16)';
        for (let b = 0; b < 5; b++) {
          wctx.fillRect(gx + 1, gy + 2 + b * 3, gw - 2, 1.5);
        }
      }

      bctx.fillStyle = '#323232';
      bctx.fillRect(gx, gy, gw, gh);
      rghCtx.fillStyle = '#121212';
      rghCtx.fillRect(gx, gy, gw, gh);

      const roomLit = ((r * 7 + Math.floor(c / 2) * 13) % 9) < 5;
      if (roomLit) {
        const warm = ((r + Math.floor(c / 2)) % 3) !== 0;
        const eGrad = ectx.createLinearGradient(gx, gy, gx, gy + gh);
        eGrad.addColorStop(0, warm ? '#fff4cc' : '#e0f2fe');
        eGrad.addColorStop(0.65, warm ? '#f59e0b' : '#38bdf8');
        eGrad.addColorStop(1, 'rgba(15, 23, 42, 0.2)');
        ectx.fillStyle = eGrad;
        ectx.fillRect(gx + 1, gy + 1, gw - 2, gh - 2);
      }
    }
  }

  // 1b. Warm Architectural Sandstone / Brick Mid-Rise Facade
  const facCanvas = document.createElement('canvas');
  facCanvas.width = 512;
  facCanvas.height = 512;
  const fctx = facCanvas.getContext('2d');
  const facEmCanvas = document.createElement('canvas');
  facEmCanvas.width = 512;
  facEmCanvas.height = 512;
  const fectx = facEmCanvas.getContext('2d');
  fctx.fillStyle = '#9a8f82';
  fctx.fillRect(0, 0, 512, 512);
  fectx.fillStyle = '#000000';
  fectx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4500; i++) {
    fctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
    fctx.fillRect((i * 73) % 512, (i * 137) % 512, 3, 2);
  }
  const fCols = 8;
  const fRows = 10;
  const fcw = 512 / fCols;
  const fch = 512 / fRows;
  for (let r = 0; r < fRows; r++) {
    fctx.fillStyle = '#736a5f';
    fctx.fillRect(0, r * fch, 512, 6);
    for (let c = 0; c < fCols; c++) {
      const wx = c * fcw + 10;
      const wy = r * fch + 12;
      const ww = fcw - 20;
      const wh = fch - 20;
      fctx.fillStyle = '#3c3630';
      fctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
      fctx.fillStyle = '#b4aa9d';
      fctx.fillRect(wx - 3, wy + wh + 2, ww + 6, 4); // window sill
      const wg = fctx.createLinearGradient(wx, wy, wx, wy + wh);
      wg.addColorStop(0, '#314b63');
      wg.addColorStop(1, '#121e2b');
      fctx.fillStyle = wg;
      fctx.fillRect(wx, wy, ww, wh);
      if (((r * 11 + c * 5) % 7) < 4) {
        fectx.fillStyle = ((r + c) % 2 === 0) ? '#fde68a' : '#fed7aa';
        fectx.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
      }
    }
  }

  // 1c. Architectural Brick Masonry (Albedo + Bump)
  const brkCanvas = document.createElement('canvas');
  brkCanvas.width = 256;
  brkCanvas.height = 256;
  const brCtx = brkCanvas.getContext('2d');
  const brBumpCanvas = document.createElement('canvas');
  brBumpCanvas.width = 256;
  brBumpCanvas.height = 256;
  const brBCtx = brBumpCanvas.getContext('2d');
  brCtx.fillStyle = '#a89f94';
  brCtx.fillRect(0, 0, 256, 256);
  brBCtx.fillStyle = '#505050';
  brBCtx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 16; row++) {
    const y = row * 16;
    const off = (row % 2) * 16;
    for (let col = -1; col < 9; col++) {
      const x = col * 32 + off;
      const v = ((row * 17 + col * 29) & 15);
      const r = 135 + v * 2;
      const g = 78 + v;
      const b = 62 + Math.floor(v * 0.7);
      brCtx.fillStyle = `rgb(${r},${g},${b})`;
      brCtx.fillRect(x + 1, y + 1, 30, 14);
      brBCtx.fillStyle = `rgb(${180 + v * 2},${180 + v * 2},${180 + v * 2})`;
      brBCtx.fillRect(x + 1, y + 1, 30, 14);
    }
  }

  // 1d. Corrugated Industrial Metal Siding (Albedo + Bump)
  const corCanvas = document.createElement('canvas');
  corCanvas.width = 256;
  corCanvas.height = 256;
  const crM = corCanvas.getContext('2d');
  const corBumpCanvas = document.createElement('canvas');
  corBumpCanvas.width = 256;
  corBumpCanvas.height = 256;
  const crBM = corBumpCanvas.getContext('2d');
  for (let x = 0; x < 256; x += 2) {
    const w = Math.sin((x / 256) * Math.PI * 32);
    const v = Math.round(145 + w * 28);
    const bv = Math.round(128 + w * 85);
    crM.fillStyle = `rgb(${v},${v + 4},${v + 8})`;
    crM.fillRect(x, 0, 2, 256);
    crBM.fillStyle = `rgb(${bv},${bv},${bv})`;
    crBM.fillRect(x, 0, 2, 256);
  }
  crM.fillStyle = 'rgba(15, 23, 42, 0.28)';
  crM.fillRect(0, 126, 256, 4);

  // 1e. Commercial Flat-Roof Ballast Gravel Membrane
  const rgCanvas = document.createElement('canvas');
  rgCanvas.width = 256;
  rgCanvas.height = 256;
  const rgCtx = rgCanvas.getContext('2d');
  rgCtx.fillStyle = '#474c54';
  rgCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6500; i++) {
    const g = 55 + ((i * 29) % 55);
    rgCtx.fillStyle = `rgb(${g},${g + 2},${g + 4})`;
    rgCtx.fillRect((i * 71) % 256, (i * 113) % 256, 2, 2);
  }
  rgCtx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
  rgCtx.lineWidth = 2;
  rgCtx.strokeRect(1, 1, 254, 254);

  // 2. Architectural Limestone / Concrete Cladding with Panel Seams
  const stoneCanvas = document.createElement('canvas');
  stoneCanvas.width = 256;
  stoneCanvas.height = 256;
  const stCtx = stoneCanvas.getContext('2d');
  stCtx.fillStyle = '#64748b';
  stCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    for (let x = 0; x < 256; x += 64) {
      const shade = 104 + (((x * 7 + y * 13) % 21) - 10);
      stCtx.fillStyle = `rgb(${shade}, ${shade + 5}, ${shade + 11})`;
      stCtx.fillRect(x + 1, y + 1, 62, 30);
    }
  }
  for (let i = 0; i < 2200; i++) {
    stCtx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
    stCtx.fillRect((i * 53) % 256, (i * 97) % 256, 2, 2);
  }

  // 2b. Paved Urban Sidewalk Paver Tiles (Albedo + Bump)
  const swCanvas = document.createElement('canvas');
  swCanvas.width = 512;
  swCanvas.height = 512;
  const swCtx = swCanvas.getContext('2d');
  const swBumpCanvas = document.createElement('canvas');
  swBumpCanvas.width = 512;
  swBumpCanvas.height = 512;
  const swBCtx = swBumpCanvas.getContext('2d');
  swCtx.fillStyle = '#475569';
  swCtx.fillRect(0, 0, 512, 512);
  swBCtx.fillStyle = '#5a5a5a';
  swBCtx.fillRect(0, 0, 512, 512);
  const tile = 32;
  for (let y = 0; y < 512; y += tile) {
    for (let x = 0; x < 512; x += tile) {
      const v = 96 + (((x * 13 + y * 29) % 19) - 9);
      swCtx.fillStyle = `rgb(${v}, ${v + 4}, ${v + 9})`;
      swCtx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
      swBCtx.fillStyle = '#c4c4c4';
      swBCtx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
    }
  }
  for (let i = 0; i < 5000; i++) {
    swCtx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.045)';
    swCtx.fillRect((i * 97) % 512, (i * 193) % 512, 2, 2);
  }

  // 2c. High-Detail Organic Meadow & Park Turf Grass (Albedo + Bump) - works cleanly with vertex colors
  const grCanvas = document.createElement('canvas');
  grCanvas.width = 512;
  grCanvas.height = 512;
  const grCtx = grCanvas.getContext('2d');
  const grBumpCanvas = document.createElement('canvas');
  grBumpCanvas.width = 512;
  grBumpCanvas.height = 512;
  const grBCtx = grBumpCanvas.getContext('2d');
  grCtx.fillStyle = '#759164';
  grCtx.fillRect(0, 0, 512, 512);
  grBCtx.fillStyle = '#707070';
  grBCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 240; i++) {
    const px = (i * 137) % 512;
    const py = (i * 269) % 512;
    const rad = 20 + (i % 34);
    const rg = grCtx.createRadialGradient(px, py, 2, px, py, rad);
    rg.addColorStop(
      0,
      i % 3 === 0 ? 'rgba(138, 166, 108, 0.35)' : i % 3 === 1 ? 'rgba(92, 120, 78, 0.34)' : 'rgba(116, 134, 88, 0.28)'
    );
    rg.addColorStop(1, 'rgba(117, 145, 100, 0)');
    grCtx.fillStyle = rg;
    grCtx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 18000; i++) {
    const bx = (i * 89 + (i % 7) * 13) % 512;
    const by = (i * 149 + (i % 11) * 7) % 512;
    grCtx.fillStyle = i % 4 === 0 ? '#8eb073' : i % 4 === 1 ? '#648155' : i % 4 === 2 ? '#9db87b' : '#536e46';
    grCtx.fillRect(bx, by, 1, 3 + (i % 3));
    grBCtx.fillStyle = i % 2 === 0 ? '#b4b4b4' : '#525252';
    grBCtx.fillRect(bx, by, 1, 3);
  }

  // 2d. Furrowed Tree Bark (Albedo + Bump)
  const bkCanvas = document.createElement('canvas');
  bkCanvas.width = 256;
  bkCanvas.height = 256;
  const bkCtx = bkCanvas.getContext('2d');
  const bkBumpCanvas = document.createElement('canvas');
  bkBumpCanvas.width = 256;
  bkBumpCanvas.height = 256;
  const bkBCtx = bkBumpCanvas.getContext('2d');
  bkCtx.fillStyle = '#473628';
  bkCtx.fillRect(0, 0, 256, 256);
  bkBCtx.fillStyle = '#808080';
  bkBCtx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 4) {
    const ridge = Math.sin(x * 0.25) * 18;
    const r = Math.max(25, Math.min(95, Math.round(68 + ridge)));
    const g = Math.max(18, Math.min(76, Math.round(52 + ridge * 0.8)));
    const b = Math.max(14, Math.min(62, Math.round(40 + ridge * 0.6)));
    bkCtx.fillStyle = `rgb(${r},${g},${b})`;
    bkCtx.fillRect(x, 0, 4, 256);
    const bv = Math.max(20, Math.min(230, Math.round(128 + ridge * 3.2)));
    bkBCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    bkBCtx.fillRect(x, 0, 4, 256);
  }
  for (let i = 0; i < 1800; i++) {
    const fx = (i * 53) % 256;
    const fy = (i * 113) % 256;
    bkCtx.fillStyle = i % 5 === 0 ? 'rgba(65, 88, 52, 0.28)' : 'rgba(20, 14, 10, 0.35)';
    bkCtx.fillRect(fx, fy, 2, 10 + (i % 14));
    bkBCtx.fillStyle = i % 2 === 0 ? '#303030' : '#d0d0d0';
    bkBCtx.fillRect(fx, fy, 2, 8);
  }

  // 2e. Dense Botanical Leaf Canopy Texture (Albedo + Bump)
  const lfCanvas = document.createElement('canvas');
  lfCanvas.width = 512;
  lfCanvas.height = 512;
  const lfCtx = lfCanvas.getContext('2d');
  const lfBumpCanvas = document.createElement('canvas');
  lfBumpCanvas.width = 512;
  lfBumpCanvas.height = 512;
  const lfBCtx = lfBumpCanvas.getContext('2d');
  lfCtx.fillStyle = '#234420';
  lfCtx.fillRect(0, 0, 512, 512);
  lfBCtx.fillStyle = '#404040';
  lfBCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4600; i++) {
    const lx = (i * 97 + (i % 13) * 19) % 512;
    const ly = (i * 173 + (i % 17) * 11) % 512;
    const ang = ((i * 41) % 360) * (Math.PI / 180);
    const rx = 5 + (i % 5);
    const ry = 2.6 + (i % 3);
    const tone = i % 5;
    lfCtx.save();
    lfCtx.translate(lx, ly);
    lfCtx.rotate(ang);
    lfCtx.fillStyle =
      tone === 0 ? '#1b3818' :
      tone === 1 ? '#2b5524' :
      tone === 2 ? '#3b6d2e' :
      tone === 3 ? '#4c8237' : '#244a1f';
    lfCtx.beginPath();
    lfCtx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    lfCtx.fill();
    lfCtx.restore();

    lfBCtx.save();
    lfBCtx.translate(lx, ly);
    lfBCtx.rotate(ang);
    lfBCtx.fillStyle = tone >= 2 ? '#c8c8c8' : '#707070';
    lfBCtx.beginPath();
    lfBCtx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    lfBCtx.fill();
    lfBCtx.restore();
  }

  // 3. 1024x1024 Detailed Asphalt Road (Aggregate Grain + Tar Crack Repairs + Wheel Ruts + Markings + Storm Drains)
  const roadCanvas = document.createElement('canvas');
  roadCanvas.width = 1024;
  roadCanvas.height = 1024;
  const rctx = roadCanvas.getContext('2d');
  const roadBumpCanvas = document.createElement('canvas');
  roadBumpCanvas.width = 512;
  roadBumpCanvas.height = 512;
  const rbctx = roadBumpCanvas.getContext('2d');

  rctx.fillStyle = '#1d222a';
  rctx.fillRect(0, 0, 1024, 1024);
  rbctx.fillStyle = '#808080';
  rbctx.fillRect(0, 0, 512, 512);

  // Realistic wheel-rut darkening in both driving lanes
  rctx.fillStyle = 'rgba(7, 10, 15, 0.28)';
  rctx.fillRect(160, 0, 96, 1024);
  rctx.fillRect(310, 0, 96, 1024);
  rctx.fillRect(618, 0, 96, 1024);
  rctx.fillRect(768, 0, 96, 1024);

  // Mineral asphalt aggregate speckles
  for (let i = 0; i < 18000; i++) {
    const ax = (i * 79 + (i % 13) * 17) % 1024;
    const ay = (i * 151 + (i % 17) * 11) % 1024;
    rctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.038)' : 'rgba(0,0,0,0.08)';
    rctx.fillRect(ax, ay, 2, 2);
  }
  for (let i = 0; i < 7000; i++) {
    rbctx.fillStyle = i % 2 === 0 ? '#9e9e9e' : '#626262';
    rbctx.fillRect((i * 79) % 512, (i * 151) % 512, 2, 2);
  }

  // Subtle asphalt tar-seal expansion cracks
  rctx.strokeStyle = 'rgba(8, 11, 16, 0.55)';
  rctx.lineWidth = 3;
  for (let c = 0; c < 6; c++) {
    const sy = 90 + c * 170;
    rctx.beginPath();
    rctx.moveTo(90 + (c * 97) % 140, sy);
    rctx.lineTo(280 + (c * 53) % 120, sy + 42);
    rctx.lineTo(440 + (c * 41) % 100, sy + 18);
    rctx.stroke();
  }

  // Gutter apron & curb edge shadow
  rctx.fillStyle = '#333b48';
  rctx.fillRect(0, 0, 32, 1024);
  rctx.fillRect(992, 0, 32, 1024);

  // Solid crisp thermoplastic shoulder fog lines
  rctx.fillStyle = 'rgba(241, 245, 249, 0.85)';
  rctx.fillRect(46, 0, 10, 1024);
  rctx.fillRect(968, 0, 10, 1024);

  // Double-broken center lane markings
  rctx.fillStyle = 'rgba(248, 250, 252, 0.90)';
  for (let y = 24; y < 1024; y += 128) {
    rctx.fillRect(507, y, 10, 64);
  }

  // Subtle lane direction arrows painted near approach
  const drawLaneArrow = (cx, cy, dir) => {
    rctx.save();
    rctx.translate(cx, cy);
    rctx.scale(1, dir);
    rctx.fillStyle = 'rgba(241, 245, 249, 0.72)';
    rctx.fillRect(-7, -28, 14, 48);
    rctx.beginPath();
    rctx.moveTo(0, -56);
    rctx.lineTo(-24, -22);
    rctx.lineTo(24, -22);
    rctx.closePath();
    rctx.fill();
    rctx.restore();
  };
  drawLaneArrow(286, 840, 1);
  drawLaneArrow(738, 184, -1);

  // Cast-iron storm drain grates in road gutters
  for (const gy of [220, 740]) {
    for (const gx of [10, 996]) {
      rctx.fillStyle = '#11161d';
      rctx.fillRect(gx, gy, 18, 38);
      rctx.fillStyle = '#475569';
      for (let s = 3; s < 35; s += 5) rctx.fillRect(gx + 2, gy + s, 14, 2);
    }
  }

  // 4. Intersection Crosswalk Texture + Stop Lines + Manhole Cover
  const crossCanvas = document.createElement('canvas');
  crossCanvas.width = 512;
  crossCanvas.height = 512;
  const crCtx = crossCanvas.getContext('2d');
  crCtx.fillStyle = '#1d222a';
  crCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4000; i++) {
    crCtx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.07)';
    crCtx.fillRect((i * 53) % 512, (i * 97) % 512, 2, 2);
  }
  crCtx.fillStyle = 'rgba(241, 245, 249, 0.86)';
  for (let i = 68; i < 444; i += 44) {
    crCtx.fillRect(i, 20, 22, 54);
    crCtx.fillRect(i, 438, 22, 54);
    crCtx.fillRect(20, i, 54, 22);
    crCtx.fillRect(438, i, 54, 22);
  }
  // Thick stop bars
  crCtx.fillRect(70, 4, 178, 10);
  crCtx.fillRect(264, 498, 178, 10);
  crCtx.fillRect(4, 264, 10, 178);
  crCtx.fillRect(498, 70, 10, 178);
  // Central manhole cover
  crCtx.fillStyle = '#2d3542';
  crCtx.beginPath();
  crCtx.arc(256, 256, 15, 0, Math.PI * 2);
  crCtx.fill();
  crCtx.strokeStyle = '#11161d';
  crCtx.lineWidth = 2;
  crCtx.stroke();

  // 5. Solar Panel Grid
  const solarCanvas = document.createElement('canvas');
  solarCanvas.width = 256;
  solarCanvas.height = 256;
  const sctx = solarCanvas.getContext('2d');
  sctx.fillStyle = '#071b36';
  sctx.fillRect(0, 0, 256, 256);
  sctx.strokeStyle = '#38bdf8';
  sctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) {
    sctx.beginPath();
    sctx.moveTo(i, 0);
    sctx.lineTo(i, 256);
    sctx.stroke();
    sctx.beginPath();
    sctx.moveTo(0, i);
    sctx.lineTo(256, i);
    sctx.stroke();
  }

  // 6. Helipad Marking
  const heliCanvas = document.createElement('canvas');
  heliCanvas.width = 256;
  heliCanvas.height = 256;
  const hctx = heliCanvas.getContext('2d');
  hctx.fillStyle = '#1e293b';
  hctx.fillRect(0, 0, 256, 256);
  hctx.strokeStyle = '#facc15';
  hctx.lineWidth = 10;
  hctx.beginPath();
  hctx.arc(128, 128, 102, 0, Math.PI * 2);
  hctx.stroke();
  hctx.fillStyle = '#f8fafc';
  hctx.fillRect(78, 66, 22, 124);
  hctx.fillRect(156, 66, 22, 124);
  hctx.fillRect(98, 117, 60, 22);

  // 7. Radial Contact Shadow & Headlight Ground Beam
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const shctx = shadowCanvas.getContext('2d');
  const grad = shctx.createRadialGradient(64, 64, 12, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.72)');
  grad.addColorStop(0.65, 'rgba(0,0,0,0.26)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  shctx.fillStyle = grad;
  shctx.fillRect(0, 0, 128, 128);

  const beamCanvas = document.createElement('canvas');
  beamCanvas.width = 128;
  beamCanvas.height = 128;
  const bmctx = beamCanvas.getContext('2d');
  const bGrad = bmctx.createRadialGradient(64, 114, 2, 64, 72, 54);
  bGrad.addColorStop(0, 'rgba(255, 248, 220, 0.55)');
  bGrad.addColorStop(0.45, 'rgba(254, 243, 199, 0.22)');
  bGrad.addColorStop(1, 'rgba(254, 243, 199, 0)');
  bmctx.fillStyle = bGrad;
  bmctx.fillRect(0, 0, 128, 128);

  // 8. Airport Runway
  const runCanvas = document.createElement('canvas');
  runCanvas.width = 256;
  runCanvas.height = 512;
  const runCtx = runCanvas.getContext('2d');
  runCtx.fillStyle = '#181c24';
  runCtx.fillRect(0, 0, 256, 512);
  runCtx.fillStyle = '#f8fafc';
  runCtx.fillRect(10, 14, 8, 484);
  runCtx.fillRect(238, 14, 8, 484);
  for (let x = 28; x <= 216; x += 22) {
    runCtx.fillRect(x, 18, 12, 34);
    runCtx.fillRect(x, 460, 12, 34);
  }
  for (let y = 66; y < 448; y += 52) {
    runCtx.fillRect(123, y, 10, 30);
  }

  // 9. Multi-Octave Water Bump Map
  const waterCanvas = document.createElement('canvas');
  waterCanvas.width = 256;
  waterCanvas.height = 256;
  const wtCtx = waterCanvas.getContext('2d');
  wtCtx.fillStyle = '#808080';
  wtCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) {
    for (let x = 0; x < 256; x += 2) {
      const wave =
        Math.sin(x * 0.12 + y * 0.08) * 32 +
        Math.cos(y * 0.18 - x * 0.06) * 24 +
        Math.sin(x * 0.28 - y * 0.22) * 14;
      const v = Math.max(0, Math.min(255, Math.round(128 + wave)));
      wtCtx.fillStyle = `rgb(${v},${v},${v})`;
      wtCtx.fillRect(x, y, 2, 2);
    }
  }

  return {
    windowMap: prep(winCanvas, 1, 2, true),
    windowEmissive: prep(emCanvas, 1, 2, true),
    windowBump: prep(bumpCanvas, 1, 2, false),
    windowRough: prep(roughCanvas, 1, 2, false),
    facadeMap: prep(facCanvas, 1, 1, true),
    facadeEmissive: prep(facEmCanvas, 1, 1, true),
    brickMap: prep(brkCanvas, 2, 2, true),
    brickBump: prep(brBumpCanvas, 2, 2, false),
    corrugatedMap: prep(corCanvas, 3, 1, true),
    corrugatedBump: prep(corBumpCanvas, 3, 1, false),
    roofGravelMap: prep(rgCanvas, 2, 2, true),
    stoneMap: prep(stoneCanvas, 2, 2, true),
    sidewalkMap: prep(swCanvas, 2, 2, true),
    sidewalkBump: prep(swBumpCanvas, 2, 2, false),
    grassMap: prep(grCanvas, 12, 12, true),
    grassBump: prep(grBumpCanvas, 12, 12, false),
    barkMap: prep(bkCanvas, 1, 2, true),
    barkBump: prep(bkBumpCanvas, 1, 2, false),
    leafMap: prep(lfCanvas, 1, 1, true),
    leafBump: prep(lfBumpCanvas, 1, 1, false),
    roadMap: prep(roadCanvas, 1, 18, true),
    roadBump: prep(roadBumpCanvas, 1, 18, false),
    crosswalkMap: prep(crossCanvas, 1, 1, true),
    solarMap: prep(solarCanvas, 2, 2, true),
    helipadMap: prep(heliCanvas, 1, 1, true),
    contactShadow: prep(shadowCanvas, 1, 1, false),
    headlightBeam: prep(beamCanvas, 1, 1, false),
    runwayMap: prep(runCanvas, 1, 3, true),
    waterBump: prep(waterCanvas, 32, 32, false),
  };
}
