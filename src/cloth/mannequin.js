// Manequim procedural (~1,8 m) com animações simples para testar capas e roupas.
// Olha para +Z. Fornece âncoras (ombros, cintura) e colisores (cápsulas).
import * as THREE from 'three';

function capsule(r, len, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export class Mannequin {
  constructor(color = '#c9b8a4') {
    const skin = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const cloth = new THREE.MeshStandardMaterial({ color: '#3b3f4a', roughness: 0.9 });
    const leather = new THREE.MeshStandardMaterial({ color: '#4a3322', roughness: 0.8 });
    this.materials = [skin, cloth, leather];

    this.root = new THREE.Group();
    this.root.name = 'Manequim';
    this.hips = new THREE.Group();
    this.hips.position.y = 0.95;
    this.root.add(this.hips);

    const pelvis = capsule(0.14, 0.12, cloth);
    pelvis.rotation.z = Math.PI / 2;
    this.hips.add(pelvis);

    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    const chest = capsule(0.17, 0.32, cloth);
    chest.position.y = 0.28;
    chest.scale.set(1.15, 1, 0.75);
    this.torso.add(chest);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 16), leather);
    belt.position.y = 0.06;
    belt.scale.z = 0.8;
    this.torso.add(belt);

    this.head = new THREE.Group();
    this.head.position.y = 0.62;
    this.torso.add(this.head);
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 16), skin);
    headMesh.position.y = 0.08;
    headMesh.scale.set(0.9, 1.08, 1);
    headMesh.castShadow = true;
    this.head.add(headMesh);
    const neck = capsule(0.05, 0.06, skin);
    this.head.add(neck);

    // âncora da capa: nas costas, na altura dos ombros
    this.capeAnchor = new THREE.Object3D();
    this.capeAnchor.position.set(0, 0.5, -0.1);
    this.torso.add(this.capeAnchor);
    // âncora de saia/manto: cintura
    this.waistAnchor = new THREE.Object3D();
    this.waistAnchor.position.set(0, 0.06, 0);
    this.hips.add(this.waistAnchor);

    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.24 * side, 0.47, 0);
      this.torso.add(shoulder);
      const upper = capsule(0.055, 0.24, skin);
      upper.position.y = -0.15;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      shoulder.add(elbow);
      const lower = capsule(0.045, 0.22, skin);
      lower.position.y = -0.14;
      elbow.add(lower);
      shoulder.rotation.z = side * 0.08;
      this.arms.push({ shoulder, elbow, side });
    }
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(0.1 * side, -0.05, 0);
      this.hips.add(hip);
      const upper = capsule(0.075, 0.32, cloth);
      upper.position.y = -0.22;
      hip.add(upper);
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      hip.add(knee);
      const lower = capsule(0.06, 0.3, cloth);
      lower.position.y = -0.2;
      knee.add(lower);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.24), leather);
      boot.position.set(0, -0.42, 0.05);
      boot.castShadow = true;
      knee.add(boot);
      this.legs.push({ hip, knee, side });
    }

    this.colliders = [
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.19, name: 'tronco' },
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.1, name: 'ombros' },
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.09, name: 'coxa E' },
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.09, name: 'coxa D' },
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.075, name: 'perna E' },
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.075, name: 'perna D' },
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.13, name: 'cabeça' },
    ];
    this.phase = 0;
    this.pathAngle = 0;
  }

  setBodyRadius(r) {
    this.colliders[0].r = r;
  }

  /**
   * @param {number} dt
   * @param {'parado'|'andando'|'correndo'|'girando'|'pulando'} anim
   * @param {number} speed  multiplicador
   */
  animate(dt, anim, speed = 1) {
    const R = 5;
    let stride = 0, move = 0, bob = 0, lean = 0;
    const root = this.root;
    if (anim === 'andando') { stride = 0.45; move = 1.5; bob = 0.03; lean = 0.05; }
    else if (anim === 'correndo') { stride = 0.85; move = 5; bob = 0.07; lean = 0.2; }
    this.phase += dt * speed * (anim === 'correndo' ? 10 : 6);

    if (move > 0) {
      this.pathAngle += (move * speed * dt) / R;
      root.position.set(Math.cos(this.pathAngle) * R, 0, Math.sin(this.pathAngle) * R);
      // tangente do círculo: o boneco olha para onde anda (+Z local)
      root.rotation.y = -this.pathAngle;
    } else if (anim === 'girando') {
      root.rotation.y += dt * speed * 6;
    } else if (anim === 'pulando') {
      const jp = (this.phase * 0.25) % 1;
      root.position.y = Math.max(0, Math.sin(jp * Math.PI)) * 1.0;
    }
    if (anim !== 'pulando') root.position.y = 0;

    const still = anim === 'parado' || anim === 'girando' || anim === 'pulando';
    this._limbs(still ? 0 : stride, bob, lean, anim === 'pulando');
    root.updateMatrixWorld(true);
    this._updateColliders();
  }

  // Modo Play: o controle de posição/rotação é externo; aqui só anima pernas e braços.
  pose(dt, moveSpeed, airborne = false) {
    const run = moveSpeed > 5;
    const k = Math.min(1, moveSpeed / (run ? 8 : 4));
    const stride = k * (run ? 0.85 : 0.45);
    this.phase += dt * (run ? 10 : 6) * (moveSpeed > 0.1 ? 1 : 0.3);
    this._limbs(airborne ? 0 : stride, k * (run ? 0.07 : 0.03), k * (run ? 0.2 : 0.05), airborne);
    this.root.updateMatrixWorld(true);
    this._updateColliders();
  }

  _limbs(stride, bob, lean, airborne) {
    const s = Math.sin(this.phase);
    this.hips.position.y = 0.95 - Math.abs(Math.cos(this.phase)) * bob + (stride === 0 ? Math.sin(this.phase * 0.3) * 0.005 : 0);
    this.torso.rotation.set(lean, s * stride * 0.15, 0);
    for (const l of this.legs) {
      l.hip.rotation.x = s * l.side * stride;
      l.knee.rotation.x = airborne ? 0.3 : Math.max(0, -Math.cos(this.phase + (l.side > 0 ? 0 : Math.PI))) * stride * 1.3;
    }
    for (const a of this.arms) {
      a.shoulder.rotation.x = -s * a.side * stride * 0.9;
      a.elbow.rotation.x = -0.15 - stride * 0.6;
    }
  }

  _updateColliders() {
    const c = this.colliders;
    const w = (obj, x, y, z, out) => out.set(x, y, z).applyMatrix4(obj.matrixWorld);
    w(this.torso, 0, 0.05, 0.03, c[0].a);
    w(this.torso, 0, 0.42, 0.03, c[0].b);
    w(this.torso, -0.22, 0.46, 0, c[1].a);
    w(this.torso, 0.22, 0.46, 0, c[1].b);
    const [l0, l1] = this.legs;
    w(l0.hip, 0, 0, 0, c[2].a); w(l0.knee, 0, 0, 0, c[2].b);
    w(l1.hip, 0, 0, 0, c[3].a); w(l1.knee, 0, 0, 0, c[3].b);
    w(l0.knee, 0, 0, 0, c[4].a); w(l0.knee, 0, -0.42, 0, c[4].b);
    w(l1.knee, 0, 0, 0, c[5].a); w(l1.knee, 0, -0.42, 0, c[5].b);
    w(this.head, 0, 0.08, 0, c[6].a); c[6].b.copy(c[6].a);
  }

  dispose() {
    this.root.traverse((o) => o.geometry?.dispose());
    for (const m of this.materials) m.dispose();
  }
}
