// HTML de NPC do Lineage 2: modelos prontos, interpretação de bypass e validação.
// (Sem DOM: pode ser testado no Node.)

export const NPC_HTML_FOLDERS = {
  Merchant: 'merchant',
  Teleporter: 'teleporter',
  Warehouse: 'warehouse',
  Guard: 'guard',
  Buffer: 'default',
  Folk: 'default',
  Monster: 'default',
};

export function htmlPathFor(npc) {
  return `${NPC_HTML_FOLDERS[npc.type] || 'default'}/${npc.npcId}.htm`;
}

export function fillBypass(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

// Gera o HTML inicial de um NPC de acordo com o tipo.
export function htmlTemplate(type, { name = 'NPC', multisellId = 0, bypass } = {}) {
  const b = (kind, vars) => fillBypass(bypass[kind], vars);
  const chat1 = b('chat', { n: 1 });
  switch (type) {
    case 'Merchant':
      return `<html><body>${name}:<br>
Seja bem-vindo, aventureiro! Tenho as melhores mercadorias da região.<br><br>
<center><img src="L2UI.SquareGray" width=270 height=1></center><br>
<a action="${b('multisell', { id: multisellId || 900001 })}">Comprar itens</a><br>
<a action="${chat1}">Perguntar sobre a cidade</a><br>
<center><img src="L2UI.SquareGray" width=270 height=1></center>
</body></html>
`;
    case 'Teleporter':
      return `<html><body>Gatekeeper ${name}:<br>
Para onde deseja viajar? O preço é justo e a viagem é segura.<br><br>
<a action="${b('teleport', { id: 1 })}">Cidade de Giran - <font color="LEVEL">10.000 Adena</font></a><br>
<a action="${b('teleport', { id: 2 })}">Cidade de Aden - <font color="LEVEL">15.000 Adena</font></a><br>
<a action="${b('teleport', { id: 3 })}">Vila Inicial - <font color="LEVEL">Grátis</font></a><br><br>
<a action="${chat1}">Informações</a>
</body></html>
`;
    case 'Warehouse':
      return `<html><body>Armazém ${name}:<br>
Posso guardar seus itens com segurança.<br><br>
<a action="bypass -h npc_%objectId%_DepositP">Guardar itens</a><br>
<a action="bypass -h npc_%objectId%_WithdrawP">Retirar itens</a><br>
</body></html>
`;
    case 'Buffer':
      return `<html><title>Buffer</title><body><center>
<font color="LEVEL">${name}</font><br>
Escolha sua bênção:<br><br>
<table width=260>
<tr><td><button value="Guerreiro" action="${chat1}" width=120 height=24 back="L2UI_CT1.Button_DF_Down" fore="L2UI_CT1.Button_DF"></td>
<td><button value="Mago" action="${b('chat', { n: 2 })}" width=120 height=24 back="L2UI_CT1.Button_DF_Down" fore="L2UI_CT1.Button_DF"></td></tr>
</table><br>
<img src="L2UI.SquareWhite" width=260 height=1>
</center></body></html>
`;
    case 'Guard':
      return `<html><body>Guarda ${name}:<br>
Mantenha a ordem na cidade, forasteiro. Monstros foram vistos perto dos portões.<br>
</body></html>
`;
    default:
      return `<html><body>${name}:<br>
Olá! Que dia bonito na nossa cidade, não acha?<br><br>
<a action="${chat1}">Conversar</a>
</body></html>
`;
  }
}

export function chatPagePath(currentPath, n) {
  const m = /^(.*?)(-\d+)?\.html?$/i.exec(currentPath || '');
  const base = m ? m[1] : (currentPath || '').replace(/\.html?$/i, '');
  const num = Number(n) || 0;
  return num === 0 ? `${base}.htm` : `${base}-${num}.htm`;
}

// Interpreta a ação de um link/botão: página, multisell, teleporte etc.
export function interpretBypass(action, currentPath = '') {
  const a = String(action || '').trim();
  let m = /^link\s+(.+)$/i.exec(a);
  if (m) return { type: 'page', path: m[1].trim() };
  const b = a.replace(/^bypass\s+(-h\s+)?/i, '').trim();
  m = /^npc_(?:%objectId%|\d+)_(\w+)\s*(.*)$/i.exec(b);
  if (m) {
    const cmd = m[1].toLowerCase();
    const arg = m[2].trim();
    if (cmd === 'chat') return { type: 'page', path: chatPagePath(currentPath, arg) };
    if (cmd === 'link') return { type: 'page', path: arg };
    if (cmd === 'multisell' || cmd === 'exc_multisell') return { type: 'multisell', id: parseInt(arg, 10) };
    if (cmd === 'goto' || cmd === 'teleport' || cmd === 'teleportto') return { type: 'teleport', arg };
    if (cmd === 'quest') return { type: 'quest', arg };
    return { type: 'other', cmd, arg };
  }
  return { type: 'other', cmd: b, arg: '' };
}

// Lista todos os "action" de um HTML.
export function extractActions(html) {
  const out = [];
  const re = /action\s*=\s*"([^"]*)"/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

export function validateHtml(page, project) {
  const w = [];
  const text = page.content || '';
  if (!/<html/i.test(text)) w.push(`${page.path}: falta a tag <html>.`);
  if (!/<body/i.test(text)) w.push(`${page.path}: falta a tag <body>.`);
  if (text.length > 8000) w.push(`${page.path}: ${text.length} caracteres — páginas muito grandes podem travar clientes antigos (divida em páginas com Chat 1, Chat 2...).`);
  const paths = new Set(project.htmls.map((h) => h.path.toLowerCase()));
  const lists = new Set(project.multisells.map((m) => Number(m.listId)));
  for (const act of extractActions(text)) {
    const r = interpretBypass(act, page.path);
    if (r.type === 'page' && !paths.has(r.path.toLowerCase())) w.push(`${page.path}: link para "${r.path}", que não existe no projeto.`);
    if (r.type === 'multisell' && !lists.has(r.id)) w.push(`${page.path}: abre o multisell ${r.id}, que não existe no projeto.`);
    if (/\{\w+\}/.test(act)) w.push(`${page.path}: comando com marcador não preenchido: ${act}`);
  }
  const opens = (text.match(/<a\b/gi) || []).length, closes = (text.match(/<\/a>/gi) || []).length;
  if (opens !== closes) w.push(`${page.path}: ${opens} <a> abertos e ${closes} fechados.`);
  return w;
}

// Multisells que cada NPC abre (pelo HTML ligado a ele ou pela propriedade do NPC).
export function npcMultisellLinks(project) {
  const byList = new Map();
  const pageByPath = new Map(project.htmls.map((h) => [h.path.toLowerCase(), h]));
  for (const npc of project.npcs) {
    const ids = new Set();
    if (npc.multisell) ids.add(Number(npc.multisell));
    // segue o HTML principal e as páginas de chat ligadas a ele (até 20 páginas)
    const seen = new Set();
    const queue = npc.html ? [npc.html] : [];
    while (queue.length && seen.size < 20) {
      const p = queue.shift();
      if (seen.has(p.toLowerCase())) continue;
      seen.add(p.toLowerCase());
      const page = pageByPath.get(p.toLowerCase());
      if (!page) continue;
      for (const act of extractActions(page.content)) {
        const r = interpretBypass(act, page.path);
        if (r.type === 'multisell' && r.id) ids.add(r.id);
        if (r.type === 'page') queue.push(r.path);
      }
    }
    for (const id of ids) {
      if (!byList.has(id)) byList.set(id, new Set());
      byList.get(id).add(Number(npc.npcId));
    }
  }
  return byList;
}
