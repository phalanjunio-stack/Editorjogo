// Leitura dos formatos ActorX (.psk malha + esqueleto, .psa animações) do Unreal Engine 2 —
// o que o UE Viewer (umodel) exporta dos pacotes .ukx do Lineage II e o que o Verdant Rig grava.
// Porte de verdantrig/actorx.py. Só lê: o EditorJogo guarda os personagens em GLB.
//
// Convenções do arquivo (conferidas com a FFighter do L2 H5, ver AGENTS.md do Verdant Rig):
//   - Z para cima, mão direita; faces em sentido horário vistas de fora;
//   - quaternion do osso raiz (índice 0) como está, dos filhos CONJUGADO;
//   - cada quadro do .psa traz rotação e posição LOCAIS inteiras de cada osso.

const dec = new TextDecoder('latin1');

export class ActorXError extends Error {}

function name(bytes, off, size) {
  let end = off;
  while (end < off + size && bytes[end] !== 0) end++;
  return dec.decode(bytes.subarray(off, end)).trimEnd();
}

function* chunks(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let p = 0;
  while (p < u8.length) {
    if (p + 32 > u8.length) throw new ActorXError('cabeçalho de bloco truncado');
    const id = name(u8, p, 20);
    const flag = dv.getInt32(p + 20, true);
    const size = dv.getInt32(p + 24, true);
    const count = dv.getInt32(p + 28, true);
    p += 32;
    const total = size * count;
    if (p + total > u8.length) throw new ActorXError(`bloco ${id} truncado`);
    yield { id, flag, size, count, off: p, u8, dv };
    p += total;
  }
}

function readBones(c) {
  const out = [];
  for (let i = 0; i < c.count; i++) {
    const o = c.off + i * c.size;
    const f = (k) => c.dv.getFloat32(o + k, true);
    out.push({
      name: name(c.u8, o, 64),
      flags: c.dv.getUint32(o + 64, true),
      numChildren: c.dv.getInt32(o + 68, true),
      parent: c.dv.getInt32(o + 72, true),
      rot: [f(76), f(80), f(84), f(88)], // x y z w, como no arquivo
      pos: [f(92), f(96), f(100)],
      length: f(104),
    });
  }
  return out;
}

/**
 * @param {ArrayBuffer|Uint8Array} buf
 * @returns {{points: Float32Array, wedges: {point:number,u:number,v:number,mat:number}[],
 *   faces: {w:[number,number,number], mat:number}[], materials: string[],
 *   bones: object[], weights: {w:number, point:number, bone:number}[]}}
 */
export function readPsk(buf) {
  const psk = { points: new Float32Array(0), wedges: [], faces: [], materials: [], bones: [], weights: [] };
  let first = true;
  for (const c of chunks(buf)) {
    if (first) {
      if (c.id !== 'ACTRHEAD') throw new ActorXError('não é um arquivo .psk (falta ACTRHEAD)');
      first = false;
      continue;
    }
    const { dv, off, size, count } = c;
    if (c.id === 'PNTS0000') {
      psk.points = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) for (let k = 0; k < 3; k++) psk.points[i * 3 + k] = dv.getFloat32(off + i * size + k * 4, true);
    } else if (c.id === 'VTXW0000' || c.id === 'VTXW3200') {
      // alguns exportadores gravam o índice do ponto com 32 bits quando há mais de 65536 pontos
      const wide = c.id === 'VTXW3200' || psk.points.length / 3 > 65536;
      for (let i = 0; i < count; i++) {
        const o = off + i * size;
        psk.wedges.push(wide
          ? { point: dv.getUint32(o, true), u: dv.getFloat32(o + 4, true), v: dv.getFloat32(o + 8, true), mat: c.u8[o + 12] }
          : { point: dv.getUint16(o, true), u: dv.getFloat32(o + 4, true), v: dv.getFloat32(o + 8, true), mat: c.u8[o + 12] });
      }
    } else if (c.id === 'FACE0000' || c.id === 'FACE3200') {
      const wide = c.id === 'FACE3200';
      for (let i = 0; i < count; i++) {
        const o = off + i * size;
        psk.faces.push(wide
          ? { w: [dv.getUint32(o, true), dv.getUint32(o + 4, true), dv.getUint32(o + 8, true)], mat: c.u8[o + 12] }
          : { w: [dv.getUint16(o, true), dv.getUint16(o + 2, true), dv.getUint16(o + 4, true)], mat: c.u8[o + 6] });
      }
    } else if (c.id === 'MATT0000') {
      for (let i = 0; i < count; i++) psk.materials.push(name(c.u8, off + i * size, 64));
    } else if (c.id === 'REFSKELT') {
      psk.bones = readBones(c);
    } else if (c.id === 'RAWWEIGHTS') {
      for (let i = 0; i < count; i++) {
        const o = off + i * size;
        psk.weights.push({ w: dv.getFloat32(o, true), point: dv.getInt32(o + 4, true), bone: dv.getInt32(o + 8, true) });
      }
    }
  }
  if (first) throw new ActorXError('arquivo vazio');
  return psk;
}

/**
 * @returns {{bones: object[], sequences: {name:string, group:string, rate:number, first:number, frames:number}[],
 *   keys: Float32Array}} keys: 8 números por chave (px py pz qx qy qz qw tempo), quadro a quadro, osso a osso
 */
export function readPsa(buf) {
  const psa = { bones: [], sequences: [], keys: new Float32Array(0) };
  let first = true;
  for (const c of chunks(buf)) {
    if (first) {
      if (c.id !== 'ANIMHEAD') throw new ActorXError('não é um arquivo .psa (falta ANIMHEAD)');
      first = false;
      continue;
    }
    const { dv, off, size, count } = c;
    if (c.id === 'BONENAMES') {
      psa.bones = readBones(c);
    } else if (c.id === 'ANIMINFO') {
      for (let i = 0; i < count; i++) {
        const o = off + i * size;
        psa.sequences.push({
          name: name(c.u8, o, 64),
          group: name(c.u8, o + 64, 64),
          totalBones: dv.getInt32(o + 128, true),
          trackTime: dv.getFloat32(o + 148, true),
          rate: dv.getFloat32(o + 152, true) || 30,
          first: dv.getInt32(o + 160, true),
          frames: dv.getInt32(o + 164, true),
        });
      }
    } else if (c.id === 'ANIMKEYS') {
      psa.keys = new Float32Array(count * 8);
      for (let i = 0; i < count; i++) for (let k = 0; k < 8; k++) psa.keys[i * 8 + k] = dv.getFloat32(off + i * size + k * 4, true);
    }
  }
  if (first) throw new ActorXError('arquivo vazio');
  return psa;
}

// ------------------------------------------------------------------ espaço do arquivo -> tela
// O .psk é Z para cima; na tela (three.js) Y é para cima. Só GIRAR −90° em X, nunca espelhar:
// (x, y, z) -> (x, z, −y) e o quaternion R·q·R⁻¹ = (x, z, −y, w).
export const ueToViewPos = (p) => [p[0], p[2], -p[1]];
export const ueToViewQuat = (q) => [q[0], q[2], -q[1], q[3]];

/** Rotação local "de verdade" do osso i (os filhos vêm conjugados no arquivo). */
export function trueLocalRot(bone, index) {
  const q = bone.rot;
  return index === 0 ? [q[0], q[1], q[2], q[3]] : [-q[0], -q[1], -q[2], q[3]];
}
