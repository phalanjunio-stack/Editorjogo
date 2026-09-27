// Testes de unidade das partes sem interface (rodam no Node): npm test
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
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
import { encodeGrayPNG } from '../src/core/png.js';
import { ZipWriter } from '../src/core/zip.js';
import { toUERotator, toUELocation, landscapeParams } from '../src/ue5/coords.js';

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

test('conversão para o UE5: cm, eixos e yaw', () => {
  assert.deepEqual(toUELocation([1, 2, 3]), [100, 300, 200]);
  assert.deepEqual(toUERotator([0, 0, 0]), [0, 0, 0]);
  // girar +90° no editor (em torno de Y) = yaw -90° no UE
  assert.deepEqual(toUERotator([0, 90, 0]), [0, -90, 0]);
  assert.deepEqual(toUERotator([0, -30, 0]), [0, 30, 0]);
});

test('parâmetros do Landscape cobrem a altura sem estourar 16 bits', () => {
  const lp = landscapeParams(-10, 120, 512, 253);
  assert.equal(lp.components, 4);
  assert.ok(Math.abs(lp.xyScale - 203.175) < 0.01);
  assert.ok(lp.toValue(120) <= 65535 && lp.toValue(120) > 60000);
  assert.equal(lp.toValue(0), 32768);
  // valor -> cm pela fórmula do UE
  const cm = ((lp.toValue(100) - 32768) * lp.zScale) / 128;
  assert.ok(Math.abs(cm - 10000) < lp.zScale);
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

// ---------------------------------------------------------------- PNG e ZIP
test('PNG 16 bits em tons de cinza: cabeçalho, CRC e pixels', async () => {
  const w = 3, h = 2;
  const px = new Uint16Array([0, 32768, 65535, 1, 2, 3]);
  const png = await encodeGrayPNG(w, h, px, 16);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const dv = new DataView(png.buffer, png.byteOffset);
  assert.equal(dv.getUint32(16), 3);
  assert.equal(dv.getUint32(20), 2);
  assert.equal(png[24], 16);
  assert.equal(png[25], 0);
  // IDAT começa depois do IHDR (8 + 25 bytes)
  const idatLen = dv.getUint32(33);
  const raw = zlib.inflateSync(png.subarray(41, 41 + idatLen));
  assert.equal(raw.length, h * (w * 2 + 1));
  assert.equal(raw[0], 0);
  assert.equal((raw[3] << 8) | raw[4], 32768);
  assert.equal((raw[5] << 8) | raw[6], 65535);
});

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
