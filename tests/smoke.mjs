// Teste de fumaça no navegador (Chromium headless via Playwright): abre dist/EditorJogo.html,
// passa por todas as abas, usa as ferramentas, entra no modo Play e gera os pacotes.
//   node tests/smoke.mjs      (capturas e downloads em tests/out/)
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'tests/out');
await mkdir(out, { recursive: true });

const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 960 }, acceptDownloads: true });
// SwiftShader (GPU por software) é lento: usa a qualidade "Baixa" no teste
await page.addInitScript({ content: "try { localStorage.setItem('editorjogo:qualidade', 'baixa'); } catch (e) {}" });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.setDefaultTimeout(120000);

const t0 = Date.now();
await page.goto(`file://${path.join(root, 'dist/EditorJogo.html')}`);
await page.waitForSelector('body.ready', { timeout: 180000 });
console.log(`carregou em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await page.waitForTimeout(3000);
const shot = async (name) => { await page.screenshot({ path: path.join(out, `${name}.png`) }); console.log(`📸 ${name}`); };
const tab = async (label) => { await page.click(`.mode-tab:has-text("${label}")`); await page.waitForTimeout(1500); };
const evalApp = (fn, arg) => page.evaluate(fn, arg);
await shot('01-terreno');

const box = await (await page.$('canvas.gl')).boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

// esculpir, pintar e desfazer
await page.click('.tool:has-text("Levantar")');
await page.mouse.move(cx, cy + 80);
await page.mouse.down();
await page.mouse.move(cx + 60, cy + 90, { steps: 4 });
await page.mouse.up();
await page.click('.col-left .thumb:has-text("Rocha")');
await page.mouse.move(cx - 60, cy + 80);
await page.mouse.down();
await page.mouse.move(cx - 30, cy + 90, { steps: 3 });
await page.mouse.up();
const undoCount = await evalApp(() => window.editorJogo.history.undoStack.length);
await page.keyboard.press('Control+z');
console.log(`pincéis ok (${undoCount} passos no histórico)`);

// folhagem pelo Navegador de Conteúdo
await page.click('.cb-node:has-text("Folhagem")');
await page.click('.cb-card:has-text("Campo Florido")');
await page.waitForTimeout(500);

await tab('Mundo');
await page.click('.btn.tag:has-text("Pôr do sol")');
await page.waitForTimeout(2500);
await shot('02-por-do-sol');
await page.click('.btn.tag:has-text("Manhã")');

// câmera baixa para ver a grama com flores
await evalApp(() => {
  const a = window.editorJogo;
  const h = a.terrain.heightAt(-30, 30);
  a.controls.target.set(-30, h + 1, 30);
  a.camera.position.set(-40, h + 3.5, 42);
});
await page.waitForTimeout(3000);
await shot('03-grama');
await evalApp(() => window.editorJogo.frameTerrain());

// objetos: colocar pelo Navegador de Conteúdo, selecionar, apagar e desfazer
await tab('Objetos');
await page.click('.cb-node:has-text("Construções")');
await page.click('.cb-card:has-text("Casa")');
await page.mouse.move(cx + 140, cy + 150);
await page.mouse.click(cx + 140, cy + 150);
await page.keyboard.press('Escape');
const nObj = await evalApp(() => window.editorJogo.project.objects.length);
await page.mouse.click(cx + 140, cy + 150);
await page.waitForTimeout(1500);
await shot('04-objeto-selecionado');
await page.keyboard.press('Delete');
await page.keyboard.press('Control+z');
const nObj2 = await evalApp(() => window.editorJogo.project.objects.length);
console.log(`objetos: ${nObj} -> ${nObj2} (excluir + desfazer)`);
// espalhar
await page.click('.tool:has-text("Espalhar")');
await page.mouse.move(cx + 250, cy - 60);
await page.mouse.down();
await page.mouse.move(cx + 300, cy - 40, { steps: 4 });
await page.mouse.up();
await page.keyboard.press('q');

// NPC e zona
await tab('NPC');
await page.click('.tool:has-text("NPC")');
await page.mouse.click(cx - 120, cy + 110);
await page.waitForTimeout(1500);
await shot('05-npc');
await page.click('.tool:has-text("Zona")');
for (const [dx, dy] of [[-200, 60], [-100, 60], [-100, 150], [-200, 150]]) await page.mouse.click(cx + dx, cy + dy);
await page.keyboard.press('Enter');
await page.waitForTimeout(500);

await tab('Roupa');
await page.waitForTimeout(3000);
await shot('06-capa');
await page.click('.preset:has-text("Manto de mago")');
await page.waitForTimeout(3000);
await shot('07-manto');
await page.click('.preset:has-text("Capa de cavaleiro")');

await tab('Loja');
await page.click('.card .btn:has-text("Adicionar")');
await page.waitForTimeout(500);
await shot('08-loja');

await tab('HTML');
await page.click('.l2-stage .l2-link >> nth=0');
await page.waitForTimeout(600);
await shot('09-html');

await page.click('.top-btn:has-text("Exportar")');
await page.waitForTimeout(1500);
await shot('10-exportar');
const save = async (trigger, name) => {
  const dl = page.waitForEvent('download', { timeout: 300000 });
  await trigger();
  const d = await dl;
  const file = path.join(out, name || await d.suggestedFilename());
  await d.saveAs(file);
  console.log('⬇', path.basename(file));
  return file;
};
const srvZip = await save(() => page.click('.card .btn:has-text("Baixar pacote do servidor")'));
const ueZip = await save(() => page.click('.card .btn:has-text("Baixar pacote UE5")'));
await save(() => page.click('.card .btn:has-text("Salvar projeto")'), 'projeto.editorjogo.json');
for (const z of [srvZip, ueZip]) {
  const list = execFileSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print("\\n".join(z.namelist()))', z]).toString().trim().split('\n');
  console.log(`   ${path.basename(z)}: ${list.length} arquivos (${list.slice(0, 6).join(', ')}${list.length > 6 ? ', …' : ''})`);
}

// modo Play: andar e falar com o mercador
await tab('Terreno');
await page.keyboard.press('F5');
await page.waitForTimeout(2000);
await page.keyboard.down('w');
await page.waitForTimeout(2500);
await page.keyboard.up('w');
await evalApp(() => {
  const a = window.editorJogo;
  const n = a.project.npcs.find((x) => x.type === 'Merchant');
  a.play.char.root.position.set(n.pos[0] + 1.5, n.pos[1], n.pos[2] + 0.5);
  a.play.yaw = -1.3;
});
await page.waitForFunction(() => window.editorJogo.play.near, null, { timeout: 60000 });
await page.keyboard.press('e');
await page.waitForSelector('.play-dialog', { timeout: 30000 });
await page.waitForTimeout(1500);
await shot('11-play-dialogo');
await page.click('.play-dialog .l2-link >> nth=0');
await page.waitForTimeout(1000);
await shot('12-play-loja');
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const playing = await evalApp(() => window.editorJogo.playing);
console.log(`play encerrado: ${!playing}`);

// reabrir o projeto salvo
const stats = await evalApp(async () => {
  const a = window.editorJogo;
  await a.applyProject(JSON.parse(a.serialize()));
  return { objetos: a.project.objects.length, npcs: a.project.npcs.length, zonas: a.project.zones.length, lojas: a.project.multisells.length, html: a.project.htmls.length };
});
console.log('reaberto:', JSON.stringify(stats));
await page.waitForTimeout(2000);
await shot('13-final');

await writeFile(path.join(out, 'erros.txt'), errors.join('\n\n'));
console.log(errors.length ? `❌ ${errors.length} erros:\n${errors.slice(0, 10).join('\n')}` : '✔ sem erros no console');
await browser.close();
process.exit(errors.length ? 1 : 0);
