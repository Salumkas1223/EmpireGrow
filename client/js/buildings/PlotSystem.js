import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLOT_BLUEPRINTS, DISTRICTS } from '../../../config/gameConfig.ts';
import { createBuildingModel } from './BuildingFactory.js';

function createPlotBorderFrameGeometry(size = 12.0, barWidth = 0.22, height = 0.08) {
  const half = size * 0.5 - barWidth * 0.5;
  const parts = [
    new THREE.BoxGeometry(size, height, barWidth).translate(0, 0, -half),
    new THREE.BoxGeometry(size, height, barWidth).translate(0, 0, half),
    new THREE.BoxGeometry(barWidth, height, size - barWidth * 2).translate(-half, 0, 0),
    new THREE.BoxGeometry(barWidth, height, size - barWidth * 2).translate(half, 0, 0),
  ];
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

export class PlotSystem {
  constructor(scene, textures) {
    this.scene = scene;
    this.textures = textures;
    this.plotGroup = new THREE.Group();
    this.plotVisuals = new Map();
    this.buildingInstances = new Map();
    this.windowMaterials = [];

    const count = PLOT_BLUEPRINTS.length;
    const padGeo = new THREE.BoxGeometry(11.8, 0.16, 11.8);
    const padMat = new THREE.MeshStandardMaterial({
      map: textures.plotPadMap || textures.stoneMap,
      bumpMap: textures.plotPadBump || textures.sidewalkBump,
      bumpScale: 0.03,
      color: 0xffffff,
      roughness: 0.86,
      metalness: 0.04,
    });
    this.padsMesh = new THREE.InstancedMesh(padGeo, padMat, count);
    this.padsMesh.receiveShadow = true;
    this.padsMesh.layers.enable(1);
    this.padsMesh.userData.plotIds = [];

    const borderGeo = createPlotBorderFrameGeometry(12.0, 0.20, 0.08);
    const borderMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.88,
    });
    this.bordersMesh = new THREE.InstancedMesh(borderGeo, borderMat, count);

    const dummy = new THREE.Object3D();
    const tmpCol = new THREE.Color();

    PLOT_BLUEPRINTS.forEach((bp, idx) => {
      const district = DISTRICTS[bp.district];

      dummy.position.set(bp.x, 0.16, bp.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.padsMesh.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(bp.x, 0.23, bp.z);
      dummy.updateMatrix();
      this.bordersMesh.setMatrixAt(idx, dummy.matrix);

      tmpCol.setHex(0x88b878);
      this.padsMesh.setColorAt(idx, tmpCol);
      tmpCol.setHex(0x94a3b8);
      this.bordersMesh.setColorAt(idx, tmpCol);

      this.padsMesh.userData.plotIds.push(bp.id);
      this.plotVisuals.set(bp.id, {
        idx,
        bp,
        districtColor: district?.accentColor || '#38bdf8',
      });
    });

    this.padsMesh.instanceMatrix.needsUpdate = true;
    this.padsMesh.instanceColor.needsUpdate = true;
    this.padsMesh.computeBoundingSphere();
    this.bordersMesh.instanceMatrix.needsUpdate = true;
    this.bordersMesh.instanceColor.needsUpdate = true;
    this.bordersMesh.computeBoundingSphere();

    this.plotGroup.add(this.padsMesh, this.bordersMesh);
    this.hitMeshes = [this.padsMesh];

    // Selection highlight ring
    this.selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(6.4, 7.1, 4),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.rotation.z = Math.PI / 4;
    this.selectionRing.position.y = 0.28;
    this.selectionRing.visible = false;
    this.plotGroup.add(this.selectionRing);

    scene.add(this.plotGroup);
    this._padColor = new THREE.Color();
    this._borderColor = new THREE.Color();
  }

  syncState(ownedPlotIds, buildings, selectedPlotId, hoveredPlotId) {
    const ownedSet = new Set(ownedPlotIds || []);
    const bldByPlot = new Map((buildings || []).map((b) => [b.plot_id, b]));

    // Batch-update all 108 plot pad & border colors inside 2 instanced attributes
    for (const [plotId, vis] of this.plotVisuals.entries()) {
      const isOwned = ownedSet.has(plotId);
      const isHovered = plotId === hoveredPlotId;
      const isSelected = plotId === selectedPlotId;

      if (isSelected) {
        this._borderColor.setHex(0x38bdf8);
        this._padColor.setHex(isOwned ? 0x1a5b75 : 0x2a6982);
        this.selectionRing.position.set(vis.bp.x, 0.3, vis.bp.z);
        this.selectionRing.visible = true;
      } else if (isHovered) {
        this._borderColor.setHex(0x7dd3fc);
        this._padColor.setHex(isOwned ? 0x214e66 : 0x5f9d78);
      } else if (isOwned) {
        this._borderColor.set(vis.districtColor);
        this._padColor.setHex(0x1d3f54);
      } else {
        this._borderColor.setHex(0x8a99ad);
        this._padColor.setHex(0x88b878);
      }

      this.padsMesh.setColorAt(vis.idx, this._padColor);
      this.bordersMesh.setColorAt(vis.idx, this._borderColor);
    }
    this.padsMesh.instanceColor.needsUpdate = true;
    this.bordersMesh.instanceColor.needsUpdate = true;

    if (!selectedPlotId) {
      this.selectionRing.visible = false;
    }

    // Remove deleted buildings
    for (const [plotId, inst] of this.buildingInstances.entries()) {
      const b = bldByPlot.get(plotId);
      const sig = b ? `${b.id}_${b.level}_${b.rotation}_${b.skin_id}_${b.custom_color}_${b.is_constructing}` : null;
      if (!b || inst.sig !== sig) {
        this.plotGroup.remove(inst.model.group);
        inst.model.group.traverse((obj) => {
          if (obj.isMesh) {
            obj.geometry?.dispose();
          }
        });
        this.buildingInstances.delete(plotId);
      }
    }

    // Spawn new or updated buildings
    const smokePositions = [];
    const constructionSites = [];
    for (const b of buildings || []) {
      const vis = this.plotVisuals.get(b.plot_id);
      if (!vis) continue;
      const sig = `${b.id}_${b.level}_${b.rotation}_${b.skin_id}_${b.custom_color}_${b.is_constructing}`;

      let inst = this.buildingInstances.get(b.plot_id);
      if (!inst) {
        const model = createBuildingModel(b, this.textures);
        model.group.position.set(vis.bp.x, 0.24, vis.bp.z);
        model.group.rotation.y = (b.rotation || 0) * (Math.PI / 2);
        this.plotGroup.add(model.group);
        inst = { data: b, sig, model };
        this.buildingInstances.set(b.plot_id, inst);
      }

      if (b.is_constructing === 1) {
        constructionSites.push({ x: vis.bp.x, y: 1.6, z: vis.bp.z });
      } else if (inst.model.smokeEmitters.length > 0) {
        for (const localPos of inst.model.smokeEmitters) {
          const worldPos = localPos.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), inst.model.group.rotation.y);
          worldPos.add(inst.model.group.position);
          smokePositions.push(worldPos);
        }
      }
    }

    this.windowMaterials = [];
    for (const inst of this.buildingInstances.values()) {
      if (inst.model.windowMaterials) {
        this.windowMaterials.push(...inst.model.windowMaterials);
      }
    }

    return { smokePositions, constructionSites };
  }

  update(dt) {
    const now = Date.now();
    const tSec = now * 0.001;
    for (const inst of this.buildingInstances.values()) {
      const { model, data } = inst;
      // Rotate turbines, radar dishes
      for (const part of model.animatedParts) {
        part.mesh.rotation[part.axis] += dt * part.speed;
      }
      // Realistic Tower Crane slewing, trolley traverse, hook hoist & aviation beacon
      if (data.is_constructing === 1) {
        if (model.craneBoom) {
          model.craneBoom.rotation.y += dt * 0.42;
        }
        if (model.craneTrolley) {
          model.craneTrolley.position.x = -5.4 + Math.sin(tSec * 0.75) * 2.2;
        }
        if (model.craneHookGroup && model.craneCables) {
          const drop = 3.6 + Math.sin(tSec * 1.15) * 1.5;
          model.craneCables.scale.y = drop;
          model.craneHookGroup.position.y = -drop - 0.1;
        }
        if (model.craneBeacon) {
          model.craneBeacon.visible = Math.sin(tSec * 5.2) > 0.1;
        }
        const total = Math.max(1000, (data.build_completes_at || now) - (data.build_started_at || now - 1000));
        const progress = THREE.MathUtils.clamp((now - (data.build_started_at || now)) / total, 0.15, 1.0);
        model.modelRoot.scale.y = THREE.MathUtils.lerp(model.modelRoot.scale.y, progress, Math.min(1, dt * 4));
      } else {
        model.modelRoot.scale.y = THREE.MathUtils.lerp(model.modelRoot.scale.y, 1.0, Math.min(1, dt * 6));
      }
    }
  }
}
