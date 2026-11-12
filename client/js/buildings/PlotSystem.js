import * as THREE from 'three';
import { PLOT_BLUEPRINTS, DISTRICTS } from '../../../config/gameConfig.ts';
import { createBuildingModel } from './BuildingFactory.js';

export class PlotSystem {
  constructor(scene, textures) {
    this.scene = scene;
    this.textures = textures;
    this.plotGroup = new THREE.Group();
    this.hitMeshes = [];
    this.plotVisuals = new Map();
    this.buildingInstances = new Map();
    this.windowMaterials = [];

    const padGeo = new THREE.BoxGeometry(11.8, 0.16, 11.8);
    const borderGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(12.0, 0.2, 12.0));

    for (const bp of PLOT_BLUEPRINTS) {
      const district = DISTRICTS[bp.district];
      const padMat = new THREE.MeshStandardMaterial({
        map: textures.stoneMap,
        bumpMap: textures.sidewalkBump,
        bumpScale: 0.02,
        color: 0x334155,
        roughness: 0.86,
        metalness: 0.08,
      });
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.set(bp.x, 0.16, bp.z);
      pad.receiveShadow = true;
      pad.layers.enable(1);
      pad.userData.plotId = bp.id;

      const borderMat = new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.55 });
      const border = new THREE.LineSegments(borderGeo, borderMat);
      border.position.set(bp.x, 0.22, bp.z);

      this.plotGroup.add(pad, border);
      this.hitMeshes.push(pad);
      this.plotVisuals.set(bp.id, { bp, pad, padMat, border, borderMat, districtColor: district?.accentColor || '#38bdf8' });
    }

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
  }

  syncState(ownedPlotIds, buildings, selectedPlotId, hoveredPlotId) {
    const ownedSet = new Set(ownedPlotIds || []);
    const bldByPlot = new Map((buildings || []).map((b) => [b.plot_id, b]));

    // Update plot colors & selection ring
    for (const [plotId, vis] of this.plotVisuals.entries()) {
      const isOwned = ownedSet.has(plotId);
      const isHovered = plotId === hoveredPlotId;
      const isSelected = plotId === selectedPlotId;

      if (isSelected) {
        vis.borderMat.color.setHex(0x38bdf8);
        vis.borderMat.opacity = 1.0;
        vis.padMat.color.setHex(isOwned ? 0x164e63 : 0x1e3a5f);
        this.selectionRing.position.set(vis.bp.x, 0.3, vis.bp.z);
        this.selectionRing.visible = true;
      } else if (isHovered) {
        vis.borderMat.color.setHex(0x7dd3fc);
        vis.borderMat.opacity = 0.9;
        vis.padMat.color.setHex(isOwned ? 0x1e3a4c : 0x263449);
      } else if (isOwned) {
        vis.borderMat.color.set(vis.districtColor);
        vis.borderMat.opacity = 0.85;
        vis.padMat.color.setHex(0x162436);
      } else {
        vis.borderMat.color.setHex(0x475569);
        vis.borderMat.opacity = 0.45;
        vis.padMat.color.setHex(0x1b2432);
      }
    }

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

      if (b.is_constructing === 0 && inst.model.smokeEmitters.length > 0) {
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

    return smokePositions;
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
