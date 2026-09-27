// Plano de água simples: reflete o céu (environment map) e tem ondas animadas via normal map.
import * as THREE from 'three';
import { makeWaterNormalTexture } from './textures.js';

export class Water {
  constructor() {
    this.normal = makeWaterNormalTexture();
    this.material = new THREE.MeshStandardMaterial({
      color: 0x1d4f63,
      roughness: 0.06,
      metalness: 0.05,
      transparent: true,
      opacity: 0.84,
      normalMap: this.normal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      envMapIntensity: 1.2,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.name = 'Água';
    this.mesh.renderOrder = 1;
  }

  setSize(size) {
    this.mesh.scale.set(size * 3, size * 3, 1);
    this.normal.repeat.set(size * 3 / 8, size * 3 / 8);
  }

  apply(t) {
    this.mesh.visible = !!t.waterEnabled;
    this.mesh.position.y = t.waterLevel;
  }

  update(time) {
    this.normal.offset.set(time * 0.012, time * 0.008);
  }
}
