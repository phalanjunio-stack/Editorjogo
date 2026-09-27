// Projeto de exemplo: vale cercado por montanhas com uma vila murada, NPCs, loja e diálogos.
import * as THREE from 'three';
import { newMultisell, newEntry } from './l2/multisell.js';
import { htmlTemplate, htmlPathFor } from './l2/htmlCore.js';
import { uid } from './core/util.js';

export function populateExample(app) {
  const p = app.project;
  const T = app.terrain;
  const C = app.city;
  p.name = 'Vila de Exemplo';

  T.generate('vale', { seed: 4242, height: 75, scale: 190, roughness: 0.55, plateau: 95, plateauHeight: 2 });
  T.autoPaint({ rockSlope: 34, snowHeight: 78, waterLevel: p.terrain.waterLevel });

  // ruas de terra em cruz + praça
  const road = (x0, z0, x1, z1) => {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 1.5);
    for (let i = 0; i <= n; i++) T.paint(1, x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, 3.2, 1, 0.1);
  };
  road(0, -52, 0, 70);
  road(-52, 0, 52, 0);
  for (let i = 0; i < 6; i++) T.paint(1, 0, 0, 11, 1, 0.1);

  const at = (x, z) => new THREE.Vector3(x, T.heightAt(x, z), z);
  const add = (ref, x, z, yaw = 0, extra = {}) => C.addObject(ref, at(x, z), { yaw, ...extra });

  add('fonte', 0, 0);
  add('templo', 0, -36, 0);
  add('taverna', 22, 16, -90);
  add('casa', -20, 14, 90);
  add('casa', -20, 30, 90);
  add('casa', 20, 32, -90);
  add('casa', -34, -14, 0);
  add('casa', 34, -16, 180);
  add('barraca', -12, -8, 90);
  add('barraca', -12, 8, 90);
  add('barraca', 12, -9, -90);
  for (const [x, z] of [[6, 6], [-6, 6], [6, -6], [-6, -6], [0, 20], [0, 40], [18, 0], [-18, 0]]) add('poste', x + 1.5, z);
  add('bandeira', 8, -14, 0);
  add('bandeira', -8, -14, 0);
  add('teleporte', 24, -6);
  add('estatua', 0, 50, 180);
  add('poco', -26, -28);
  add('barril', -13.5, -5.8);
  add('caixote', -13.5, 5.8);
  add('barril', 13.5, -6.5);

  // muralha com torres e portão ao sul
  C.opts.wallTowers = true;
  C.opts.wallClosed = true;
  C.pathPoints = [[-56, -56], [56, -56], [56, 58], [-56, 58]];
  C.finishWall();
  p.objects = p.objects.filter((o) => {
    const isGateWall = o.ref === 'muralha' && Math.abs(o.pos[0]) < 7 && Math.abs(o.pos[2] - 58) < 3;
    if (isGateWall) {
      const n = C.nodes.get(o.uid);
      n?.removeFromParent();
      C.nodes.delete(o.uid);
    }
    return !isGateWall;
  });
  add('portao', 0, 58, 0);

  // natureza fora dos muros
  C.opts.scatterSet = ['arvore', 'pinheiro', 'arbusto', 'pedra'];
  C.opts.scatterRadius = 22;
  C.opts.scatterDensity = 1;
  C.opts.scatterSpacing = 6;
  const r = mulberry(99);
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = 80 + r() * 120;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(x) < 70 && Math.abs(z) < 72) continue;
    C.scatterAt(at(x, z));
  }

  // lojas
  const shop = newMultisell(900001, 'Loja de consumíveis');
  shop.entries.push(
    newEntry(1835, 1000, 57, 7000),
    newEntry(1463, 1000, 57, 14000),
    newEntry(2509, 1000, 57, 15000),
    newEntry(736, 1, 57, 400),
    newEntry(1539, 1, 57, 300),
    newEntry(5592, 1, 57, 1500),
  );
  const weapons = newMultisell(900002, 'Armas S (troca por Adena)');
  for (const id of [6364, 6367, 6372, 6579, 7575]) weapons.entries.push(newEntry(id, 1, 57, 150000000));
  weapons.entries.push({ uid: uid('ent'), productions: [{ id: 6364, count: 1, enchant: 4, chance: 100 }], ingredients: [{ id: 6364, count: 1, enchant: 0 }, { id: 959, count: 4, enchant: 0 }] });
  p.multisells.push(shop, weapons);

  // NPCs (IDs ilustrativos: troque pelos IDs que existem no SEU datapack)
  const npc = (x, z, heading, data) => C.addNpc(at(x, z), { heading, ...data });
  const merchant = npc(-9, 0, 0, { npcId: 30001, name: 'Tomas', title: 'Mercador', type: 'Merchant', multisell: 900001 });
  const smith = npc(9, -2, 180, { npcId: 30002, name: 'Braun', title: 'Armas S', type: 'Merchant', multisell: 900002 });
  const gk = npc(24, -1, 270, { npcId: 30006, name: 'Selene', title: 'Gatekeeper', type: 'Teleporter' });
  const wh = npc(-20, 4, 0, { npcId: 30005, name: 'Otto', title: 'Armazém', type: 'Warehouse' });
  npc(-5, 62, 90, { npcId: 30039, name: 'Guarda', title: '', type: 'Guard', respawn: 60 });
  npc(5, 62, 90, { npcId: 30039, name: 'Guarda', title: '', type: 'Guard', respawn: 60 });
  npc(0, 130, 90, { npcId: 20120, name: 'Lobo', title: '', type: 'Monster', count: 6, radius: 14, respawn: 30, level: 12, hp: 450, mp: 120, race: 'ANIMAL', aggressive: true, aggroRange: 300, drops: [{ id: 57, chance: 70, min: 12, max: 30 }, { id: 1835, chance: 15, min: 5, max: 20 }] });

  const bypass = p.server.bypass;
  for (const n of [merchant, smith, gk, wh]) {
    const path = htmlPathFor(n);
    p.htmls.push({ uid: uid('html'), path, content: htmlTemplate(n.type, { name: n.name, multisellId: n.multisell, bypass }) });
    n.html = path;
  }
  p.htmls.push({
    uid: uid('html'),
    path: 'merchant/30001-1.htm',
    content: `<html><body>Tomas:<br>
Esta vila foi construída no <font color="LEVEL">EditorJogo</font>.<br>
Os muros protegem contra os lobos do vale ao sul.<br><br>
<a action="${bypass.chat.replace('{n}', '0')}">Voltar</a>
</body></html>
`,
  });
  p.htmls.push({
    uid: uid('html'),
    path: 'merchant/30002-1.htm',
    content: `<html><body>Braun:<br>
Traga uma arma S e 4 <font color="LEVEL">Scroll: Enchant Weapon (S)</font> que eu devolvo ela +4.<br><br>
<a action="${bypass.chat.replace('{n}', '0')}">Voltar</a>
</body></html>
`,
  });
  p.htmls.push({
    uid: uid('html'),
    path: 'teleporter/30006-1.htm',
    content: `<html><body>Gatekeeper Selene:<br>
Os preços dependem da distância. Jogadores abaixo do nível 40 viajam de graça.<br><br>
<a action="${bypass.chat.replace('{n}', '0')}">Voltar</a>
</body></html>
`,
  });

  C.addZone([[-54, -54], [54, -54], [54, 56], [-54, 56]], { name: 'vila_exemplo_paz', type: 'PeaceZone' });
  C.addZone([[-58, -58], [58, -58], [58, 60], [-58, 60]], { name: 'vila_exemplo', type: 'TownZone' });
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
