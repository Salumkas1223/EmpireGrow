import * as THREE from 'three';

const _dummy = new THREE.Object3D();

export class SmokeAndParticles {
  constructor(scene) {
    this.maxPuffs = 90;
    this.puffMesh = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.55, 1),
      new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        roughness: 0.95,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
      this.maxPuffs
    );
    this.puffMesh.frustumCulled = false;
    scene.add(this.puffMesh);

    this.puffs = Array.from({ length: this.maxPuffs }, (_, i) => ({
      active: false,
      x: 0,
      y: -50,
      z: 0,
      age: (i % 10) * 0.35,
      life: 3.4,
      driftX: (Math.random() - 0.5) * 1.2,
      driftZ: (Math.random() - 0.5) * 1.2,
    }));

    this.emitters = [];
    this.spawnCursor = 0;
    this.spawnTimer = 0;
  }

  setEmitters(positions) {
    this.emitters = positions;
  }

  update(dt) {
    this.spawnTimer += dt;
    if (this.emitters.length > 0 && this.spawnTimer >= 0.28) {
      this.spawnTimer = 0;
      const em = this.emitters[this.spawnCursor % this.emitters.length];
      const puff = this.puffs[this.spawnCursor % this.maxPuffs];
      this.spawnCursor++;
      puff.active = true;
      puff.x = em.x;
      puff.y = em.y;
      puff.z = em.z;
      puff.age = 0;
    }

    for (let i = 0; i < this.maxPuffs; i++) {
      const p = this.puffs[i];
      if (!p.active) {
        _dummy.position.set(0, -100, 0);
        _dummy.scale.set(0.001, 0.001, 0.001);
        _dummy.updateMatrix();
        this.puffMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        continue;
      }

      const t = p.age / p.life;
      _dummy.position.set(p.x + p.driftX * p.age * 1.4, p.y + p.age * 2.6, p.z + p.driftZ * p.age * 1.4);
      const s = 0.45 + t * 1.65;
      _dummy.scale.set(s, s * 0.85, s);
      _dummy.rotation.set(t * 2, t * 1.5, 0);
      _dummy.updateMatrix();
      this.puffMesh.setMatrixAt(i, _dummy.matrix);
    }

    this.puffMesh.instanceMatrix.needsUpdate = true;
  }
}
