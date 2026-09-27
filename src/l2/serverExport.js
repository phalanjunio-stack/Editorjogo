// Exportação para o servidor (L2Mobius / L2J): spawns, zonas, multisells e HTML.
import { escapeXml, editorToL2, degToHeading, slug, rng } from '../core/util.js';
import { multisellToXml, validateMultisell } from './multisell.js';
import { validateHtml, npcMultisellLinks } from './htmlCore.js';

const TAB = '\t';

// Posições de cada spawn (NPCs com quantidade > 1 são espalhados dentro do raio).
export function expandSpawns(project) {
  const out = [];
  for (const n of project.npcs) {
    const count = Math.max(1, n.count | 0);
    const r = rng(hashString(n.uid));
    for (let i = 0; i < count; i++) {
      let x = n.pos[0], z = n.pos[2];
      if (count > 1 && n.radius > 0) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * n.radius;
        x += Math.cos(a) * d;
        z += Math.sin(a) * d;
      }
      out.push({ npc: n, pos: { x, y: n.pos[1], z } });
    }
  }
  return out;
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Para spawns com espalhamento, a altura é recalculada pelo terreno quando disponível.
export function spawnsToXml(project, heightAt = null) {
  const s = project.server;
  const name = `EditorJogo_${slug(project.name, 'Projeto')}`;
  const L = [];
  L.push('<?xml version="1.0" encoding="UTF-8"?>');
  L.push(`<!-- Spawns de "${escapeXml(project.name).replace(/--/g, '- -')}" | gerado pelo EditorJogo | tile ${s.tileX}_${s.tileY} -->`);
  L.push('<list xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="../../../xsd/spawns.xsd">');
  L.push(`${TAB}<spawn name="${escapeXml(name)}">`);
  L.push(`${TAB}${TAB}<group>`);
  for (const sp of expandSpawns(project)) {
    const y = heightAt && sp.npc.count > 1 ? heightAt(sp.pos.x, sp.pos.z) : sp.pos.y;
    const c = editorToL2({ x: sp.pos.x, y, z: sp.pos.z }, s);
    const heading = degToHeading(sp.npc.heading);
    L.push(`${TAB}${TAB}${TAB}<npc id="${sp.npc.npcId | 0}" x="${c.x}" y="${c.y}" z="${c.z}" heading="${heading}" respawnTime="${Math.max(1, sp.npc.respawn | 0)}sec" /> <!-- ${escapeXml(sp.npc.name).replace(/--/g, '- -')} -->`);
  }
  L.push(`${TAB}${TAB}</group>`);
  L.push(`${TAB}</spawn>`);
  L.push('</list>');
  return L.join('\n') + '\n';
}

// SQL para pacotes antigos (L2J High Five) que usam a tabela custom_spawnlist.
export function spawnsToSql(project, heightAt = null) {
  const s = project.server;
  const loc = slug(project.name, 'EditorJogo').slice(0, 40);
  const rows = expandSpawns(project).map((sp) => {
    const y = heightAt && sp.npc.count > 1 ? heightAt(sp.pos.x, sp.pos.z) : sp.pos.y;
    const c = editorToL2({ x: sp.pos.x, y, z: sp.pos.z }, s);
    return `('${loc}',1,${sp.npc.npcId | 0},${c.x},${c.y},${c.z},0,0,${degToHeading(sp.npc.heading)},${Math.max(1, sp.npc.respawn | 0)},0,0)`;
  });
  if (!rows.length) return '-- Nenhum NPC no projeto.\n';
  return `-- Spawns de "${project.name}" gerados pelo EditorJogo (L2J High Five: tabela custom_spawnlist).
-- Confira os nomes das colunas no seu pacote antes de executar.
INSERT INTO \`custom_spawnlist\` (\`location\`,\`count\`,\`npc_templateid\`,\`locx\`,\`locy\`,\`locz\`,\`randomx\`,\`randomy\`,\`heading\`,\`respawn_delay\`,\`loc_id\`,\`periodOfDay\`) VALUES
${rows.join(',\n')};
`;
}

export function zonesToXml(project) {
  const s = project.server;
  const L = [];
  L.push('<?xml version="1.0" encoding="UTF-8"?>');
  L.push(`<!-- Zonas de "${escapeXml(project.name).replace(/--/g, '- -')}" | gerado pelo EditorJogo -->`);
  L.push('<list enabled="true" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="../../xsd/zones.xsd">');
  for (const z of project.zones) {
    const minZ = z.minZ ?? s.zoneMinZ;
    const maxZ = z.maxZ ?? s.zoneMaxZ;
    L.push(`${TAB}<zone name="${escapeXml(slug(z.name, 'zona'))}" type="${escapeXml(z.type)}" shape="NPoly" minZ="${minZ | 0}" maxZ="${maxZ | 0}">`);
    for (const p of z.points) {
      const c = editorToL2({ x: p[0], y: 0, z: p[1] }, s);
      L.push(`${TAB}${TAB}<node X="${c.x}" Y="${c.y}" />`);
    }
    L.push(`${TAB}</zone>`);
  }
  L.push('</list>');
  return L.join('\n') + '\n';
}

// Templates de NPC novo (L2Mobius: data/stats/npcs/custom/). Só para NPCs marcados como "NPC novo".
export function npcTemplatesToXml(project, itemName = null) {
  const seen = new Set();
  const L = [];
  L.push('<?xml version="1.0" encoding="UTF-8"?>');
  L.push('<!-- NPCs novos gerados pelo EditorJogo (formato L2Mobius). Confira com um NPC do seu datapack antes de usar. -->');
  L.push('<list xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="../../../../xsd/npcs.xsd">');
  for (const n of project.npcs) {
    if (!n.customTemplate || seen.has(n.npcId)) continue;
    seen.add(n.npcId);
    const monster = n.type === 'Monster';
    const type = { Merchant: 'Merchant', Teleporter: 'Teleporter', Warehouse: 'Warehouse', Guard: 'Guard', Monster: 'Monster' }[n.type] || 'Folk';
    const disp = n.displayId > 0 ? ` displayId="${n.displayId | 0}"` : '';
    L.push(`${TAB}<npc id="${n.npcId | 0}"${disp} level="${n.level | 0}" type="${type}" name="${escapeXml(n.name)}" usingServerSideName="true" title="${escapeXml(n.title || '')}" usingServerSideTitle="true">`);
    L.push(`${TAB}${TAB}<race>${escapeXml(n.race || 'HUMAN')}</race>`);
    L.push(`${TAB}${TAB}<sex>MALE</sex>`);
    L.push(`${TAB}${TAB}<stats>`);
    L.push(`${TAB}${TAB}${TAB}<vitals hp="${Math.max(1, n.hp | 0)}" mp="${Math.max(0, n.mp | 0)}" />`);
    L.push(`${TAB}${TAB}</stats>`);
    L.push(`${TAB}${TAB}<status attackable="${monster ? 'true' : 'false'}" />`);
    if (monster || n.aggressive) L.push(`${TAB}${TAB}<ai aggroRange="${Math.max(0, n.aggroRange | 0)}" isAggressive="${n.aggressive ? 'true' : 'false'}" />`);
    const drops = (n.drops || []).filter((d) => d.id > 0);
    if (drops.length) {
      L.push(`${TAB}${TAB}<dropLists>`);
      L.push(`${TAB}${TAB}${TAB}<drop>`);
      for (const d of drops) {
        const nm = itemName?.(d.id);
        L.push(`${TAB}${TAB}${TAB}${TAB}<item id="${d.id | 0}" min="${Math.max(1, d.min | 0)}" max="${Math.max(d.min | 0, d.max | 0, 1)}" chance="${Number(d.chance) || 0}" />${nm ? ` <!-- ${escapeXml(nm).replace(/--/g, '- -')} -->` : ''}`);
      }
      L.push(`${TAB}${TAB}${TAB}</drop>`);
      L.push(`${TAB}${TAB}</dropLists>`);
    }
    L.push(`${TAB}${TAB}<collision>`);
    L.push(`${TAB}${TAB}${TAB}<radius normal="8" />`);
    L.push(`${TAB}${TAB}${TAB}<height normal="23" />`);
    L.push(`${TAB}${TAB}</collision>`);
    L.push(`${TAB}</npc>`);
  }
  L.push('</list>');
  return { xml: L.join('\n') + '\n', count: seen.size };
}

export function npcReference(project) {
  const s = project.server;
  const lines = [`NPCs de "${project.name}" (tile ${s.tileX}_${s.tileY}, ${s.unitsPerMeter} unidades L2 por metro)`, ''];
  for (const n of project.npcs) {
    const c = editorToL2({ x: n.pos[0], y: n.pos[1], z: n.pos[2] }, s);
    lines.push(`${n.npcId}\t${n.name}${n.title ? ` <${n.title}>` : ''}\t${n.type}\tx=${c.x} y=${c.y} z=${c.z} heading=${degToHeading(n.heading)}\tHTML=${n.html || '-'}\tmultisell=${n.multisell || '-'}`);
  }
  lines.push('', 'Teleporte de GM para testar:  //teleport X Y Z  (ou //goto / //recall conforme o seu pacote)');
  return lines.join('\n') + '\n';
}

export function validateProject(project) {
  const w = [];
  const ids = new Map();
  for (const m of project.multisells) {
    if (ids.has(Number(m.listId))) w.push(`Dois multisells usam o ID ${m.listId}.`);
    ids.set(Number(m.listId), m);
    w.push(...validateMultisell(m));
  }
  const paths = new Set();
  for (const h of project.htmls) {
    if (paths.has(h.path.toLowerCase())) w.push(`Duas páginas com o mesmo caminho: ${h.path}.`);
    paths.add(h.path.toLowerCase());
    if (!/\.html?$/i.test(h.path)) w.push(`${h.path}: o arquivo deveria terminar em .htm`);
    w.push(...validateHtml(h, project));
  }
  for (const n of project.npcs) {
    if (!(n.npcId > 0)) w.push(`NPC "${n.name}" está sem ID.`);
    if (n.type !== 'Monster' && n.type !== 'Guard' && !n.html) w.push(`NPC "${n.name}" (${n.npcId}) não tem página HTML ligada.`);
    if (n.html && !paths.has(n.html.toLowerCase())) w.push(`NPC "${n.name}" aponta para a página ${n.html}, que não existe.`);
    if (n.multisell && !ids.has(Number(n.multisell))) w.push(`NPC "${n.name}" aponta para o multisell ${n.multisell}, que não existe.`);
  }
  for (const z of project.zones) if (z.points.length < 3) w.push(`Zona "${z.name}" tem menos de 3 pontos.`);
  return w;
}

export function readmeServer(project) {
  const s = project.server;
  return `PACOTE DO SERVIDOR — ${project.name}
Gerado pelo EditorJogo.

COMO INSTALAR (L2Mobius / L2J Server com XML)
1. Copie a pasta "data" deste zip para dentro da pasta "game" do seu servidor
   (a mesma que já tem data/html, data/multisell etc.). Não apague nada: os arquivos são novos.
2. Multisell: os arquivos ficam em data/multisell/custom/.
   No L2Mobius, ative em config/General.ini (ou Custom.ini):  CustomMultisellLoad = True
3. HTML: vai para data/html/... com o mesmo caminho mostrado no editor.
4. Spawns: data/spawns/Custom/${`EditorJogo_${slug(project.name, 'Projeto')}`}.xml
   Se o seu pacote usa banco de dados (L2J High Five antigo), use o arquivo
   sql/custom_spawnlist.sql e ative CustomSpawnlistTable = True.
5. Zonas: data/zones/editorjogo_${slug(project.name, 'projeto')}.xml
   NPCs novos (se você marcou "NPC novo" em algum): data/stats/npcs/custom/
   No L2Mobius ative CustomNpcData = True. O formato muda entre versões: compare
   com um NPC do seu datapack (stats, skills, collision) antes de usar em produção.
6. Reinicie o servidor (ou use //reload multisell, //reload html quando o seu pacote suportar).

COORDENADAS
- O centro do terreno do editor = centro do tile ${s.tileX}_${s.tileY}.
- Escala: ${s.unitsPerMeter} unidades L2 por metro. Z do chão (altura 0 do editor) = ${s.zBase}.
- Veja referencia/npcs.txt para as coordenadas de cada NPC (use //teleport para testar).

IMPORTANTE
- Os IDs de NPC precisam existir no servidor (data/stats/npcs). Para NPC novo, crie o
  template em data/stats/npcs/custom/ copiando um NPC parecido.
- Os IDs de itens das multisells precisam existir em data/stats/items.
- Os comandos de bypass (teleporte, chat, multisell) variam entre pacotes; você pode mudar
  os modelos na aba Exportar do editor.
- O cliente do jogador também precisa do mapa: sem geodata o servidor aceita o Z enviado,
  mas o ideal é gerar geodata do mapa novo depois.
`;
}

/**
 * Monta todos os arquivos do servidor.
 * @returns {{files: Array<{path:string, content:string}>, warnings: string[]}}
 */
export function buildServerFiles(project, { heightAt = null, itemName = null } = {}) {
  const files = [];
  const links = npcMultisellLinks(project);
  for (const ms of project.multisells) {
    files.push({
      path: `data/multisell/custom/${ms.listId}.xml`,
      content: multisellToXml(ms, { itemName, schemaPath: '../../../xsd/multisell.xsd', extraNpcs: [...(links.get(Number(ms.listId)) || [])] }),
    });
  }
  for (const h of project.htmls) files.push({ path: `data/html/${h.path.replace(/^\/+/, '')}`, content: h.content });
  if (project.npcs.length) {
    files.push({ path: `data/spawns/Custom/EditorJogo_${slug(project.name, 'Projeto')}.xml`, content: spawnsToXml(project, heightAt) });
    files.push({ path: 'sql/custom_spawnlist.sql', content: spawnsToSql(project, heightAt) });
    files.push({ path: 'referencia/npcs.txt', content: npcReference(project) });
  }
  if (project.zones.length) files.push({ path: `data/zones/editorjogo_${slug(project.name, 'projeto')}.xml`, content: zonesToXml(project) });
  const tpl = npcTemplatesToXml(project, itemName);
  if (tpl.count) files.push({ path: `data/stats/npcs/custom/editorjogo_${slug(project.name, 'projeto')}.xml`, content: tpl.xml });
  files.push({ path: 'LEIA-ME.txt', content: readmeServer(project) });
  return { files, warnings: validateProject(project) };
}
