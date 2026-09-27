// Personagem controlável no modo Play (mesma interface do manequim de teste): escolhe a animação
// pela velocidade (parado / andar / correr / no ar), fornece as âncoras da capa e da saia (presas
// no peito e no quadril, acompanhando a animação) e cápsulas de colisão para o tecido.
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class CharacterActor {
  /** @param {import('./characters.js').CharacterInstance} inst */
  constructor(inst) {
    this.inst = inst;
    this.root = inst.object;
    const tpl = inst.tpl;
    const h = tpl.def.height || 1.8;
    const k = h / 1.8;
    this.bone = (id) => inst.canonBone(id);
    this.root.updateMatrixWorld(true);
    // âncoras: posição de descanso no espaço do personagem, presas ao osso (seguem a animação)
    this.capeAnchor = new THREE.Object3D();
    this.waistAnchor = new THREE.Object3D();
    this.capeAnchor.matrixAutoUpdate = this.waistAnchor.matrixAutoUpdate = false;
    this._anchors = [];
    const attach = (obj, boneId, offset) => {
      const b = this.bone(boneId) || this.bone('hips');
      if (!b) return;
      const bw = b.matrixWorld.clone();
      const rootInv = this.root.matrixWorld.clone().invert();
      const pos = _v.setFromMatrixPosition(bw).applyMatrix4(rootInv).add(offset);
      const anchorRest = new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z).premultiply(this.root.matrixWorld);
      this._anchors.push({ obj, bone: b, rel: bw.invert().multiply(anchorRest) });
    };
    attach(this.capeAnchor, 'chest', new THREE.Vector3(0, 0.12 * k, -0.12 * k));
    attach(this.waistAnchor, 'hips', new THREE.Vector3(0, 0.02 * k, 0));
    // cápsulas para o tecido não atravessar o corpo
    const seg = (a, b, r, name) => ({ ids: [a, b], a: new THREE.Vector3(), b: new THREE.Vector3(), r: r * k, name });
    this.colliders = [
      seg('hips', 'chest', 0.19, 'tronco'),
      seg('L_upperarm', 'R_upperarm', 0.1, 'ombros'),
      seg('L_thigh', 'L_calf', 0.09, 'coxa E'),
      seg('R_thigh', 'R_calf', 0.09, 'coxa D'),
      seg('L_calf', 'L_foot', 0.075, 'perna E'),
      seg('R_calf', 'R_foot', 0.075, 'perna D'),
      seg('head', 'head', 0.13, 'cabeça'),
    ].filter((c) => this.bone(c.ids[0]) && this.bone(c.ids[1]));
    this.speedRef = { andar: this._clipSpeed('andar', 2.2), correr: this._clipSpeed('correr', 5.5) };
    inst.play('parado', { fade: 0 });
    this._update(0);
  }

  _clipSpeed(slot, fallback) {
    const name = this.inst.tpl.def.slots?.[slot];
    const clip = name && this.inst.tpl.clips.get(name);
    return (clip?.userData?.speed || fallback) * ((this.inst.tpl.def.height || 1.8) / 1.8);
  }

  /** Mesmo papel do Mannequin.pose(): chamado a cada quadro pelo modo Play. */
  pose(dt, moveSpeed, airborne = false) {
    const inst = this.inst;
    if (airborne && inst.play('pular', { fade: 0.15 })) {
      inst.setTimeScale(1);
    } else if (moveSpeed < 0.1) {
      inst.play('parado', { fade: 0.25 });
      inst.setTimeScale(1);
    } else {
      const run = moveSpeed > 5 || !inst.tpl.def.slots?.andar;
      const slot = run ? 'correr' : 'andar';
      if (!inst.play(slot, { fade: 0.2 })) inst.play(run ? 'andar' : 'correr', { fade: 0.2 });
      const ref = this.speedRef[inst.slot] || 3;
      inst.setTimeScale(THREE.MathUtils.clamp(moveSpeed / ref, 0.6, 1.8));
    }
    this._update(dt);
  }

  animate(dt) {
    this.inst.play('parado');
    this._update(dt);
  }

  _update(dt) {
    this.inst.update(dt);
    this.root.updateMatrixWorld(true);
    for (const a of this._anchors) a.obj.matrixWorld.multiplyMatrices(a.bone.matrixWorld, a.rel);
    for (const c of this.colliders) {
      c.a.setFromMatrixPosition(this.bone(c.ids[0]).matrixWorld);
      c.b.setFromMatrixPosition(this.bone(c.ids[1]).matrixWorld);
    }
  }

  dispose() {
    this.inst.dispose();
  }
}
