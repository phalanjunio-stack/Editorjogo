// Multisell: modelo, geração de XML (formato L2J / L2Mobius) e importação de XML existente.
import { escapeXml, uid } from '../core/util.js';

export function newMultisell(listId = 900001, name = 'Nova loja') {
  return {
    uid: uid('ms'),
    listId,
    name,
    npcs: [],
    applyTaxes: false,
    maintainEnchantment: false,
    isChance: false,
    entries: [],
  };
}

export function newEntry(productionId = 57, productionCount = 1, priceId = 57, price = 1) {
  return {
    uid: uid('ent'),
    productions: [{ id: productionId, count: productionCount, enchant: 0, chance: 100 }],
    ingredients: [{ id: priceId, count: price, enchant: 0 }],
  };
}

/**
 * @param {object} ms multisell
 * @param {{ itemName?: (id:number)=>string|null, schemaPath?: string, extraNpcs?: number[] }} opt
 */
export function multisellToXml(ms, opt = {}) {
  const tab = '\t';
  const L = [];
  L.push('<?xml version="1.0" encoding="UTF-8"?>');
  L.push(`<!-- ${escapeXml(ms.name || `Multisell ${ms.listId}`).replace(/--/g, '- -')} | gerado pelo EditorJogo -->`);
  const attrs = [];
  if (opt.schemaPath) attrs.push(`xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="${escapeXml(opt.schemaPath)}"`);
  attrs.push(`applyTaxes="${ms.applyTaxes ? 'true' : 'false'}"`);
  attrs.push(`maintainEnchantment="${ms.maintainEnchantment ? 'true' : 'false'}"`);
  if (ms.isChance) attrs.push('isChanceMultisell="true"');
  L.push(`<list ${attrs.join(' ')}>`);
  const npcs = [...new Set([...(ms.npcs || []), ...(opt.extraNpcs || [])].map(Number).filter((n) => n > 0))];
  if (npcs.length) {
    L.push(`${tab}<npcs>`);
    for (const n of npcs) L.push(`${tab}${tab}<npc>${n}</npc>`);
    L.push(`${tab}</npcs>`);
  }
  const comment = (id) => {
    const n = opt.itemName?.(id);
    return n ? ` <!-- ${escapeXml(n).replace(/--/g, '- -')} -->` : '';
  };
  for (const e of ms.entries) {
    L.push(`${tab}<item>`);
    for (const ing of e.ingredients) {
      const en = ing.enchant > 0 ? ` enchantmentLevel="${ing.enchant | 0}"` : '';
      L.push(`${tab}${tab}<ingredient id="${ing.id | 0}" count="${Math.max(1, Math.round(ing.count))}"${en} />${comment(ing.id)}`);
    }
    for (const p of e.productions) {
      const en = p.enchant > 0 ? ` enchantmentLevel="${p.enchant | 0}"` : '';
      const ch = ms.isChance ? ` chance="${Number(p.chance ?? 100)}"` : '';
      L.push(`${tab}${tab}<production id="${p.id | 0}" count="${Math.max(1, Math.round(p.count))}"${en}${ch} />${comment(p.id)}`);
    }
    L.push(`${tab}</item>`);
  }
  L.push('</list>');
  return L.join('\n') + '\n';
}

// Importa um XML de multisell (L2J/L2Mobius). Usa regex para funcionar também fora do navegador.
export function xmlToMultisell(xml, listId = 900001, name = '') {
  const ms = newMultisell(listId, name || `Multisell ${listId}`);
  const head = /<list\b([^>]*)>/i.exec(xml);
  if (head) {
    ms.applyTaxes = /applyTaxes\s*=\s*"true"/i.test(head[1]);
    ms.maintainEnchantment = /maintainEnchantment\s*=\s*"true"/i.test(head[1]);
    ms.isChance = /isChanceMultisell\s*=\s*"true"/i.test(head[1]);
  }
  const npcs = /<npcs>([\s\S]*?)<\/npcs>/i.exec(xml);
  if (npcs) {
    const re = /<npc>\s*(\d+)\s*<\/npc>/gi;
    let m;
    while ((m = re.exec(npcs[1]))) ms.npcs.push(Number(m[1]));
  }
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let im;
  const num = (attrs, key, def = 0) => {
    const r = new RegExp(`\\b${key}\\s*=\\s*"(-?[\\d.]+)"`, 'i').exec(attrs);
    return r ? Number(r[1]) : def;
  };
  while ((im = itemRe.exec(xml))) {
    const body = im[1];
    const e = { uid: uid('ent'), ingredients: [], productions: [] };
    const tagRe = /<(ingredient|production)\b([^>]*)\/?>/gi;
    let t;
    while ((t = tagRe.exec(body))) {
      const a = t[2];
      const row = { id: num(a, 'id'), count: num(a, 'count', 1), enchant: num(a, 'enchantmentLevel', 0) };
      if (t[1].toLowerCase() === 'ingredient') e.ingredients.push(row);
      else e.productions.push({ ...row, chance: num(a, 'chance', 100) });
    }
    if (e.ingredients.length || e.productions.length) ms.entries.push(e);
  }
  return ms;
}

export function validateMultisell(ms) {
  const w = [];
  if (!ms.entries.length) w.push(`Multisell ${ms.listId}: não tem nenhuma entrada.`);
  ms.entries.forEach((e, i) => {
    if (!e.productions.length) w.push(`Multisell ${ms.listId}, entrada ${i + 1}: sem produto.`);
    if (!e.ingredients.length) w.push(`Multisell ${ms.listId}, entrada ${i + 1}: sem custo (fica de graça).`);
    if (ms.isChance) {
      const total = e.productions.reduce((s, p) => s + Number(p.chance || 0), 0);
      if (total > 100.0001) w.push(`Multisell ${ms.listId}, entrada ${i + 1}: soma das chances passa de 100%.`);
    }
  });
  return w;
}
