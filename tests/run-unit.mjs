// Testes de unidade das partes sem interface (rodam no Node): npm test
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { editorToL2, l2ToEditor, degToHeading, headingToDeg, l2TileOrigin, slug, escapeXml } from '../src/core/util.js';
import { newMultisell, newEntry, multisellToXml, xmlToMultisell, validateMultisell } from '../src/l2/multisell.js';
import { interpretBypass, chatPagePath, htmlTemplate, validateHtml, npcMultisellLinks } from '../src/l2/htmlCore.js';
import { spawnsToXml, zonesToXml, spawnsToSql, npcTemplatesToXml, buildServerFiles, validateProject } from '../src/l2/serverExport.js';
import { parseItemsFile, ItemDB } from '../src/l2/items.js';
import { defaultProject, normalizeProject, DEFAULT_BYPASS, npcDefaults } from '../src/core/state.js';
import { ZipWriter } from '../src/core/zip.js';
import { readZip } from '../src/core/unzip.js';
import { classifyTexture, assignTextureSet } from '../src/world/pbrNames.js';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { readPsk, readPsa, ueToViewPos } from '../src/rig/actorx.js';
import { objectFromPsk, clipsFromPsa, rigInfo, retargetClip, adaptClip, resetPose } from '../src/rig/rig.js';
import { mapHumanoid, humanoidScore } from '../src/rig/humanoid.js';
import { orientMesh, detectMarkers, decimate, flatTris, rigWeights, skeletonFromMarkers, symmetrize } from '../src/rig/autorig.js';
import { STANDARD_BONES, buildDefaultCharacter, standardClips, guessSlots } from '../src/rig/standard.js';

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ---------------------------------------------------------------- coordenadas
test('tile 20_18 começa em 0,0 e o centro do terreno cai no meio do tile', () => {
  assert.deepEqual(l2TileOrigin(20, 18), { x: 0, y: 0 });
  assert.deepEqual(l2TileOrigin(22, 22), { x: 65536, y: 131072 });
  const s = { tileX: 20, tileY: 18, unitsPerMeter: 32, zBase: -3500 };
  assert.deepEqual(editorToL2({ x: 0, y: 0, z: 0 }, s), { x: 16384, y: 16384, z: -3500 });
  assert.deepEqual(editorToL2({ x: 10, y: 2, z: -5 }, s), { x: 16704, y: 16224, z: -3436 });
  const back = l2ToEditor({ x: 16704, y: 16224, z: -3436 }, s);
  assert.ok(Math.abs(back.x - 10) < 1e-9 && Math.abs(back.y - 2) < 1e-9 && Math.abs(back.z + 5) < 1e-9);
});

test('heading do L2: 0 = leste, 90° = 16384, volta completa', () => {
  assert.equal(degToHeading(0), 0);
  assert.equal(degToHeading(90), 16384);
  assert.equal(degToHeading(180), 32768);
  assert.equal(degToHeading(360), 0);
  assert.equal(degToHeading(-90), 49152);
  assert.equal(headingToDeg(49152), 270);
});

// ---------------------------------------------------------------- multisell
test('multisell gera XML e importa de volta igual', () => {
  const ms = newMultisell(900123, 'Teste -- loja');
  ms.npcs = [30001];
  ms.entries.push(newEntry(1835, 1000, 57, 7000));
  ms.entries.push({ productions: [{ id: 6364, count: 1, enchant: 4, chance: 100 }], ingredients: [{ id: 6364, count: 1, enchant: 0 }, { id: 959, count: 4, enchant: 0 }] });
  const xml = multisellToXml(ms, { itemName: (id) => ({ 57: 'Adena' })[id] || null, schemaPath: '../../../xsd/multisell.xsd', extraNpcs: [30002, 30001] });
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(xml, /xsi:noNamespaceSchemaLocation="..\/..\/..\/xsd\/multisell.xsd"/);
  assert.match(xml, /<npc>30001<\/npc>\s*<npc>30002<\/npc>/);
  assert.match(xml, /<ingredient id="57" count="7000" \/> <!-- Adena -->/);
  assert.match(xml, /<production id="6364" count="1" enchantmentLevel="4" \/>/);
  assert.ok(!xml.includes('Teste -- loja'), 'comentário XML não pode ter "--"');
  const back = xmlToMultisell(xml, 900123);
  assert.equal(back.entries.length, 2);
  assert.deepEqual(back.npcs, [30001, 30002]);
  assert.equal(back.entries[1].ingredients[1].id, 959);
  assert.equal(back.entries[1].productions[0].enchant, 4);
  assert.deepEqual(validateMultisell(back), []);
});

test('multisell de chance e validação', () => {
  const ms = newMultisell(1, 'x');
  assert.equal(validateMultisell(ms).length, 1);
  ms.isChance = true;
  ms.entries.push({ productions: [{ id: 1, count: 1, chance: 70 }, { id: 2, count: 1, chance: 40 }], ingredients: [{ id: 57, count: 1 }] });
  assert.match(multisellToXml(ms), /isChanceMultisell="true"/);
  assert.match(multisellToXml(ms), /chance="70"/);
  assert.ok(validateMultisell(ms).some((w) => w.includes('100%')));
});

// ---------------------------------------------------------------- HTML
test('bypass: chat, link, multisell, teleporte', () => {
  assert.deepEqual(interpretBypass('bypass -h npc_%objectId%_Chat 1', 'merchant/30001.htm'), { type: 'page', path: 'merchant/30001-1.htm' });
  assert.deepEqual(interpretBypass('bypass -h npc_%objectId%_Chat 0', 'merchant/30001-2.htm'), { type: 'page', path: 'merchant/30001.htm' });
  assert.deepEqual(interpretBypass('bypass -h npc_%objectId%_link default/1.htm'), { type: 'page', path: 'default/1.htm' });
  assert.deepEqual(interpretBypass('link teleporter/30006-1.htm'), { type: 'page', path: 'teleporter/30006-1.htm' });
  assert.deepEqual(interpretBypass('bypass -h npc_%objectId%_multisell 900001'), { type: 'multisell', id: 900001 });
  assert.deepEqual(interpretBypass('bypass npc_12345_exc_multisell 7'), { type: 'multisell', id: 7 });
  assert.equal(interpretBypass('bypass -h npc_%objectId%_goto 3').type, 'teleport');
  assert.equal(chatPagePath('default/30001.htm', 2), 'default/30001-2.htm');
});

test('modelos de HTML usam os comandos configurados e validam', () => {
  const html = htmlTemplate('Merchant', { name: 'Tomas', multisellId: 900001, bypass: DEFAULT_BYPASS });
  assert.match(html, /npc_%objectId%_multisell 900001/);
  const p = defaultProject();
  p.htmls.push({ path: 'merchant/30001.htm', content: html });
  const w = validateHtml(p.htmls[0], p);
  assert.ok(w.some((x) => x.includes('multisell 900001')), 'avisa do multisell inexistente');
  assert.ok(w.some((x) => x.includes('30001-1.htm')), 'avisa da página de chat inexistente');
});

test('NPCs que abrem uma loja pelo HTML entram em <npcs>', () => {
  const p = defaultProject();
  p.htmls.push({ path: 'merchant/1.htm', content: '<html><body><a action="bypass -h npc_%objectId%_Chat 1">x</a></body></html>' });
  p.htmls.push({ path: 'merchant/1-1.htm', content: '<html><body><a action="bypass -h npc_%objectId%_multisell 55">loja</a></body></html>' });
  p.npcs.push({ ...npcDefaults('Merchant'), uid: 'a', npcId: 1, name: 'A', type: 'Merchant', html: 'merchant/1.htm', pos: [0, 0, 0], heading: 0 });
  assert.deepEqual([...npcMultisellLinks(p).get(55)], [1]);
});

// ---------------------------------------------------------------- servidor
function sampleProject() {
  const p = normalizeProject(defaultProject());
  p.name = 'Vila Teste';
  p.npcs.push({ ...npcDefaults('Merchant'), uid: 'n1', npcId: 30001, name: 'Tomas <&>', title: 'Mercador', type: 'Merchant', pos: [0, 2, 0], heading: 90, respawn: 60, html: 'merchant/30001.htm', multisell: 900001, count: 1, radius: 0 });
  p.npcs.push({ ...npcDefaults('Monster'), uid: 'n2', npcId: 900500, name: 'Lobo', title: '', type: 'Monster', pos: [10, 0, 10], heading: 0, respawn: 30, html: '', multisell: '', count: 3, radius: 5, customTemplate: true, aggressive: true, drops: [{ id: 57, min: 10, max: 20, chance: 70 }] });
  p.zones.push({ uid: 'z', name: 'vila paz', type: 'PeaceZone', points: [[-10, -10], [10, -10], [10, 10]], minZ: null, maxZ: null });
  p.multisells.push({ ...newMultisell(900001, 'Loja'), entries: [newEntry(1835, 1000, 57, 7000)] });
  p.htmls.push({ path: 'merchant/30001.htm', content: htmlTemplate('Merchant', { name: 'Tomas', multisellId: 900001, bypass: DEFAULT_BYPASS }) });
  return p;
}

test('spawns: XML com coordenadas L2, heading e quantidade expandida', () => {
  const p = sampleProject();
  const xml = spawnsToXml(p, () => 0);
  assert.match(xml, /<npc id="30001" x="16384" y="16384" z="-3436" heading="16384" respawnTime="60sec" \/> <!-- Tomas &lt;&amp;&gt; -->/);
  assert.equal((xml.match(/<npc id="900500"/g) || []).length, 3);
  assert.match(spawnsToSql(p), /INSERT INTO `custom_spawnlist`/);
});

test('zonas: NPoly com nós em coordenadas L2', () => {
  const xml = zonesToXml(sampleProject());
  assert.match(xml, /<zone name="vila_paz" type="PeaceZone" shape="NPoly" minZ="-5000" maxZ="1000">/);
  assert.match(xml, /<node X="16064" Y="16064" \/>/);
});

test('template de NPC novo com IA e drops', () => {
  const { xml, count } = npcTemplatesToXml(sampleProject(), (id) => (id === 57 ? 'Adena' : null));
  assert.equal(count, 1);
  assert.match(xml, /<npc id="900500" level="20" type="Monster" name="Lobo"/);
  assert.match(xml, /<ai aggroRange="300" isAggressive="true" \/>/);
  assert.match(xml, /<item id="57" min="10" max="20" chance="70" \/> <!-- Adena -->/);
});

test('pacote do servidor tem todos os arquivos e os avisos esperados', () => {
  const p = sampleProject();
  const { files, warnings } = buildServerFiles(p, { heightAt: () => 0 });
  const paths = files.map((f) => f.path);
  for (const want of ['data/multisell/custom/900001.xml', 'data/html/merchant/30001.htm', 'data/spawns/Custom/EditorJogo_Vila_Teste.xml', 'data/zones/editorjogo_Vila_Teste.xml', 'data/stats/npcs/custom/editorjogo_Vila_Teste.xml', 'sql/custom_spawnlist.sql', 'LEIA-ME.txt']) {
    assert.ok(paths.includes(want), `falta ${want}`);
  }
  // o NPC 30001 abre a loja pelo HTML: entra no <npcs> do multisell
  assert.match(files.find((f) => f.path.endsWith('900001.xml')).content, /<npc>30001<\/npc>/);
  assert.ok(warnings.some((w) => w.includes('30001-1.htm')));
  assert.deepEqual(validateProject(p), warnings);
});

test('itens: lê XML do servidor e CSV', () => {
  const xml = '<list><item id="57" type="EtcItem" name="Adena"><set/></item><item id="1" type="Weapon" name="Short Sword"/></list>';
  assert.deepEqual(parseItemsFile(xml).map((i) => i.id), [57, 1]);
  assert.deepEqual(parseItemsFile('10;Foo\n11\tBar\nlixo\n12,0,Baz').map((i) => i.name), ['Foo', 'Bar', 'Baz']);
  const db = new ItemDB([{ id: 999999, name: 'Moeda Custom' }]);
  assert.equal(db.name(57), 'Adena');
  assert.equal(db.search('custom')[0].id, 999999);
});

test('projeto antigo é completado com os campos novos', () => {
  const p = normalizeProject({ name: 'x', terrain: { layers: [{ name: 'A', tiling: 1 }] }, npcs: [{ uid: 'a', type: 'Monster', npcId: 1 }] });
  assert.equal(p.terrain.layers.length, 8);
  assert.equal(p.npcs[0].level, 20);
  assert.ok(Array.isArray(p.npcs[0].drops));
  assert.equal(p.server.bypass.multisell, DEFAULT_BYPASS.multisell);
});

test('utilidades', () => {
  assert.equal(slug('Vila São João!'), 'Vila_Sao_Joao');
  assert.equal(escapeXml('<a b="c">&'), '&lt;a b=&quot;c&quot;&gt;&amp;');
});

// ---------------------------------------------------------------- ZIP
test('ZIP abre no Python (zipfile) com o conteúdo certo', async () => {
  const z = new ZipWriter();
  z.add('data/html/a.htm', '<html>olá ção</html>'.repeat(20));
  z.add('LEIA-ME.txt', 'curto');
  z.add('bin.dat', new Uint8Array([0, 1, 2, 255]));
  const bytes = await z.build();
  const dir = mkdtempSync(path.join(tmpdir(), 'ej-'));
  const file = path.join(dir, 't.zip');
  writeFileSync(file, bytes);
  let py;
  try {
    py = execFileSync('python3', ['-c', `import zipfile,sys,json
z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
print(json.dumps({n: z.read(n).decode('latin1') for n in z.namelist()}))`, file]).toString();
  } catch {
    console.log('   (python3 não encontrado: teste do zip pulado)');
    return;
  }
  const out = JSON.parse(py);
  assert.deepEqual(Object.keys(out), ['data/html/a.htm', 'LEIA-ME.txt', 'bin.dat']);
  assert.equal(Buffer.from(out['data/html/a.htm'], 'latin1').toString('utf8'), '<html>olá ção</html>'.repeat(20));
  assert.deepEqual([...Buffer.from(out['bin.dat'], 'latin1')], [0, 1, 2, 255]);
});

test('ZIP: o leitor abre o que o gerador cria (com e sem compressão)', async () => {
  const z = new ZipWriter();
  const big = 'textura '.repeat(500);
  z.add('pasta/a.txt', big);
  z.add('b.bin', new Uint8Array([9, 8, 7]));
  const files = await readZip(await z.build());
  assert.deepEqual(files.map((f) => f.name), ['pasta/a.txt', 'b.bin']);
  assert.equal(new TextDecoder().decode(files[0].bytes), big);
  assert.deepEqual([...files[1].bytes], [9, 8, 7]);
});

test('texturas PBR: reconhece os nomes do Poly Haven, ambientCG, Megascans e Unreal', () => {
  const k = (n) => classifyTexture(n).kind;
  // Poly Haven
  assert.equal(k('aerial_rocks_02_diff_2k.jpg'), 'color');
  assert.deepEqual(classifyTexture('aerial_rocks_02_nor_gl_2k.jpg'), { kind: 'normal', dx: false });
  assert.deepEqual(classifyTexture('aerial_rocks_02_nor_dx_2k.jpg'), { kind: 'normal', dx: true });
  assert.equal(k('aerial_rocks_02_rough_2k.jpg'), 'rough');
  assert.equal(k('aerial_rocks_02_arm_2k.jpg'), 'orm');
  assert.equal(k('aerial_rocks_02_disp_2k.png'), null);
  // ambientCG
  assert.equal(k('Rock030_2K-JPG_Color.jpg'), 'color');
  assert.deepEqual(classifyTexture('Rock030_2K-JPG_NormalDX.jpg'), { kind: 'normal', dx: true });
  assert.deepEqual(classifyTexture('Rock030_2K-JPG_NormalGL.jpg'), { kind: 'normal', dx: false });
  assert.equal(k('Rock030_2K-JPG_Roughness.jpg'), 'rough');
  assert.equal(k('Rock030_2K-JPG_AmbientOcclusion.jpg'), 'ao');
  assert.equal(k('Rock030_2K-JPG_Displacement.jpg'), null);
  // Megascans
  assert.equal(k('Cliff_Rock_Albedo.jpg'), 'color');
  assert.equal(k('Cliff_Rock_AO.jpg'), 'ao');
  // Unreal (T_Nome_Sufixo; normal padrão DirectX)
  assert.equal(k('T_Ground_D.tga'), 'color');
  assert.deepEqual(classifyTexture('T_Ground_N.tga'), { kind: 'normal', dx: true });
  assert.equal(k('T_Ground_ORM.png'), 'orm');
  assert.equal(k('leia-me.txt'), null);
});

test('texturas PBR: monta o conjunto e prefere a normal OpenGL', () => {
  const set = assignTextureSet(['Rock030.png', 'Rock030_2K-JPG_Color.jpg', 'Rock030_2K-JPG_NormalDX.jpg', 'Rock030_2K-JPG_NormalGL.jpg', 'Rock030_2K-JPG_Roughness.jpg', 'Rock030_2K-JPG_Displacement.jpg']);
  assert.equal(set.color, 'Rock030_2K-JPG_Color.jpg');
  assert.equal(set.normal, 'Rock030_2K-JPG_NormalGL.jpg');
  assert.equal(set.normalDX, false);
  assert.equal(set.rough, 'Rock030_2K-JPG_Roughness.jpg');
  // um arquivo só, sem nome conhecido: vira a cor
  assert.deepEqual(assignTextureSet(['minha_grama.png']), { normalDX: false, color: 'minha_grama.png' });
});

// ---------------------------------------------------------------- personagens e rig
const FX = new URL('./fixtures/', import.meta.url);
const golden = JSON.parse(readFileSync(new URL('vr_golden.json', FX)));
const demoPsk = () => readPsk(readFileSync(new URL('demo_humano.psk', FX)));
const demoPsa = () => readPsa(readFileSync(new URL('demo_humano.psa', FX)));
const bonesOf = (o) => o.children.find((c) => c.isSkinnedMesh).skeleton.bones;
function posedWorld(obj, clip, t) {
  resetPose(obj);
  const m = new THREE.AnimationMixer(obj);
  m.clipAction(clip).play();
  m.setTime(t);
  obj.updateMatrixWorld(true);
  const out = bonesOf(obj).map((b) => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld));
  m.stopAllAction();
  m.uncacheRoot(obj);
  return out;
}

test('ActorX: lê .psk/.psa igual ao Verdant Rig (pontos, faces, ossos, sequências)', () => {
  const psk = demoPsk(), psa = demoPsa(), g = golden;
  assert.equal(psk.points.length / 3, g.psk.points);
  assert.equal(psk.wedges.length, g.psk.wedges);
  assert.equal(psk.faces.length, g.psk.faces);
  assert.equal(psk.bones.length, g.psk.bones);
  assert.equal(psk.weights.length, g.psk.weights);
  assert.deepEqual(psk.materials, g.psk.materials);
  assert.equal(psk.bones[8].name, g.psk.bone8[0]);
  assert.equal(psk.bones[8].parent, g.psk.bone8[1]);
  assert.deepEqual(psk.faces[0].w, g.psk.face0);
  assert.equal(psk.wedges[5].point, g.psk.wedge5[0]);
  assert.deepEqual(psa.sequences.map((q) => [q.name, q.frames, q.rate, q.first]), g.psa.seqs);
  assert.equal(psa.keys.length / 8, g.psa.keys);
});

test('ActorX: pose de descanso e animação do .psa batem com o Verdant Rig (Z-up -> Y-up)', () => {
  const obj = objectFromPsk(demoPsk());
  obj.updateMatrixWorld(true);
  bonesOf(obj).forEach((b, i) => {
    const p = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
    assert.ok(p.distanceTo(new THREE.Vector3(...ueToViewPos(golden.world[i][1]))) < 1e-4, b.name);
  });
  const walk = clipsFromPsa(demoPsa(), obj).find((c) => c.name === 'walk');
  const at = posedWorld(obj, walk, 10.5 / 30);
  at.forEach((p, i) => assert.ok(p.distanceTo(new THREE.Vector3(...ueToViewPos(golden.walk10_5[i][1]))) < 1e-3, `quadro 10.5 osso ${i}`));
});

test('humanoide: reconhece os ossos do L2, Mixamo, Unreal, Blender e os nossos', () => {
  const chain = (names) => mapHumanoid(names.map((name, i) => ({ name, parent: i - 1 })));
  const m = chain(['Bip01', 'Bip01 Pelvis', 'Bip01 Spine', 'Bip01 Spine1', 'Bip01 Spine2', 'Bip01 Neck', 'Bip01 Head']);
  assert.equal(m.get('hips'), 1);
  assert.equal(m.get('spine'), 2);
  assert.equal(m.get('chest'), 4);
  assert.equal(m.get('head'), 6);
  const leaf = (name) => [...mapHumanoid([{ name: 'hips', parent: -1 }, { name, parent: 0 }])].find(([, i]) => i === 1)?.[0];
  assert.equal(leaf('mixamorig:LeftForeArm'), 'L_forearm');
  assert.equal(leaf('mixamorigRightUpLeg'), 'R_thigh');
  assert.equal(leaf('upperarm_l'), 'L_upperarm');
  assert.equal(leaf('DEF-shin.R'), 'R_calf');
  assert.equal(leaf('Bip01 L Finger12'), 'L_index3');
  assert.equal(leaf('mixamorig:LeftHandThumb1'), 'L_thumb1');
  assert.equal(leaf('braco_E'), 'L_upperarm');
  assert.equal(leaf('dedos_pe_D'), 'R_toe');
  assert.equal(leaf('Shoulder_L_Bone'), undefined); // ombreira do L2 não é osso do corpo
  const std = rigInfo(buildDefaultCharacter());
  assert.equal(humanoidScore(std.map), 22);
});

test('retarget: copiar para o próprio esqueleto não muda nada; girado e maior dá os mesmos ângulos', () => {
  const obj = objectFromPsk(demoPsk());
  const info = rigInfo(obj);
  const walk = clipsFromPsa(demoPsa(), obj).find((c) => c.name === 'walk');
  const self = retargetClip(walk, info, info);
  for (const t of [0.1, 0.5]) {
    const a = posedWorld(obj, walk, t), b = posedWorld(obj, self, t);
    for (const [, i] of info.map) assert.ok(a[i].distanceTo(b[i]) < 1e-3);
  }
  const obj2 = objectFromPsk(demoPsk());
  const root2 = obj2.children.find((c) => c.isBone);
  root2.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
  obj2.traverse((o) => { if (o.isBone) o.position.multiplyScalar(2); });
  const info2 = rigInfo(obj2);
  const clip2 = retargetClip(walk, info, info2);
  const a = posedWorld(obj, walk, 0.33), b = posedWorld(obj2, clip2, 0.33);
  for (const [id, child] of [['L_thigh', 'L_calf'], ['R_upperarm', 'R_forearm']]) {
    const da = a[info.map.get(child)].clone().sub(a[info.map.get(id)]).normalize().applyQuaternion(info.frame);
    const db = b[info2.map.get(child)].clone().sub(b[info2.map.get(id)]).normalize().applyQuaternion(info2.frame);
    assert.ok(da.angleTo(db) < 0.01, id);
  }
  assert.ok(Math.abs(b[info2.map.get('hips')].y / a[info.map.get('hips')].y - 2) < 0.01);
});

test('animações do EditorJogo tocam no esqueleto do L2 (pose T -> braços do L2 em pose A)', () => {
  const std = buildDefaultCharacter();
  const src = rigInfo(std);
  const obj = objectFromPsk(demoPsk());
  const dst = rigInfo(obj);
  const idle = standardClips().find((c) => c.name === 'parado');
  const clip = adaptClip(idle, src, dst);
  const p = posedWorld(obj, clip, 0.5);
  // braços caídos ao lado do corpo: a mão fica bem abaixo do ombro
  const sh = p[dst.map.get('L_upperarm')], hand = p[dst.map.get('L_hand')];
  assert.ok(sh.y - hand.y > 0.5 * sh.distanceTo(hand), `mão ${hand.y.toFixed(1)} ombro ${sh.y.toFixed(1)}`);
  assert.deepEqual(Object.keys(guessSlots(['Idle_Battle', 'Run_1HS', 'Walk', 'SpAtk01', 'Death'])).sort(), ['andar', 'atacar', 'correr', 'morrer', 'parado']);
});

test('rig automático: acha as juntas como o Verdant Rig e os pesos somam 1', () => {
  const src = readFileSync(new URL('heroina_saia_capa.obj', FX), 'utf8');
  const pts = [], tris = [];
  for (const line of src.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') pts.push(+p[1], +p[2], +p[3]);
    else if (p[0] === 'f') {
      const c = p.slice(1).map((x) => +x.split('/')[0] - 1);
      for (let k2 = 1; k2 < c.length - 1; k2++) tris.push({ p: [c[0], c[k2], c[k2 + 1]], uv: [[0, 0], [0, 0], [0, 0]], mat: 0 });
    }
  }
  const { points } = orientMesh(Float64Array.from(pts));
  const flat = flatTris({ tris });
  const r = detectMarkers(points, flat);
  const py = JSON.parse(readFileSync(new URL('vr_markers.json', FX))).heroina_saia_capa;
  for (const id of ['pelvis', 'chest', 'neck', 'head', 'L_hip', 'L_knee', 'L_ankle', 'R_hip', 'R_knee', 'R_ankle', 'L_shoulder']) {
    const a = r.markers[id], b = py[id];
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / r.height < 0.04, id);
  }
  const sym = symmetrize(r.markers, 'L');
  assert.ok(Math.abs(sym.R_wrist[0] + sym.L_wrist[0] - 2 * sym.pelvis[0]) < 1e-9);
  const { pose, tips } = skeletonFromMarkers(r.markers, { top: r.top });
  const defs = STANDARD_BONES.map((b) => ({ name: b.name, parent: b.parent, canon: b.id, attach: b.attach }));
  const w = rigWeights(points, flat, defs, pose, tips);
  assert.equal(w.length, points.length / 3);
  for (const ws of w) assert.ok(Math.abs(ws.reduce((s2, x) => s2 + x[1], 0) - 1) < 1e-6 && ws.length <= 4);
  const mesh = { points: [...points], tris: tris.map((t) => ({ ...t })) };
  const d = decimate(mesh, 1200);
  assert.ok(d.after <= 1200 && d.after > 1000, `${d.after}`);
});

for (const t of tests) {
  try {
    await t.fn();
    passed++;
    console.log(`✔ ${t.name}`);
  } catch (err) {
    console.log(`✘ ${t.name}\n  ${err.stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} testes passaram.`);
