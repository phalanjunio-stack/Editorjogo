// Pequena base de itens conhecidos (IDs clássicos de Interlude/High Five) só para facilitar.
// Sempre confira no datapack do SEU servidor — dá para importar a lista completa de itens
// dos XML do servidor (data/stats/items/*.xml) ou de um .txt/.csv "id;nome".

export const BUILTIN_ITEMS = [
  [57, 'Adena', 'Moeda'],
  [5575, 'Ancient Adena', 'Moeda'],
  [6673, 'Festival Adena', 'Moeda'],
  [4037, 'Coin of Luck', 'Moeda'],
  [3470, 'Gold Bar', 'Moeda'],
  [736, 'Scroll of Escape', 'Consumível'],
  [1060, 'Lesser Healing Potion', 'Consumível'],
  [1061, 'Healing Potion', 'Consumível'],
  [1539, 'Greater Healing Potion', 'Consumível'],
  [5591, 'CP Potion', 'Consumível'],
  [5592, 'Greater CP Potion', 'Consumível'],
  [1835, 'Soulshot: No Grade', 'Munição'],
  [1463, 'Soulshot: D-grade', 'Munição'],
  [1464, 'Soulshot: C-grade', 'Munição'],
  [1465, 'Soulshot: B-grade', 'Munição'],
  [1466, 'Soulshot: A-grade', 'Munição'],
  [1467, 'Soulshot: S-grade', 'Munição'],
  [2509, 'Spiritshot: No Grade', 'Munição'],
  [2510, 'Spiritshot: D-grade', 'Munição'],
  [2511, 'Spiritshot: C-grade', 'Munição'],
  [2512, 'Spiritshot: B-grade', 'Munição'],
  [2513, 'Spiritshot: A-grade', 'Munição'],
  [2514, 'Spiritshot: S-grade', 'Munição'],
  [3947, 'Blessed Spiritshot: No Grade', 'Munição'],
  [3948, 'Blessed Spiritshot: D-grade', 'Munição'],
  [3949, 'Blessed Spiritshot: C-grade', 'Munição'],
  [3950, 'Blessed Spiritshot: B-grade', 'Munição'],
  [3951, 'Blessed Spiritshot: A-grade', 'Munição'],
  [3952, 'Blessed Spiritshot: S-grade', 'Munição'],
  [17, 'Wooden Arrow', 'Munição'],
  [1341, 'Bone Arrow', 'Munição'],
  [1342, 'Fine Steel Arrow', 'Munição'],
  [1343, 'Silver Arrow', 'Munição'],
  [1344, 'Mithril Arrow', 'Munição'],
  [1345, 'Shining Arrow', 'Munição'],
  [955, 'Scroll: Enchant Weapon (D)', 'Enchant'],
  [956, 'Scroll: Enchant Armor (D)', 'Enchant'],
  [951, 'Scroll: Enchant Weapon (C)', 'Enchant'],
  [952, 'Scroll: Enchant Armor (C)', 'Enchant'],
  [947, 'Scroll: Enchant Weapon (B)', 'Enchant'],
  [948, 'Scroll: Enchant Armor (B)', 'Enchant'],
  [729, 'Scroll: Enchant Weapon (A)', 'Enchant'],
  [730, 'Scroll: Enchant Armor (A)', 'Enchant'],
  [959, 'Scroll: Enchant Weapon (S)', 'Enchant'],
  [960, 'Scroll: Enchant Armor (S)', 'Enchant'],
  [1458, 'Crystal: D-Grade', 'Material'],
  [1459, 'Crystal: C-Grade', 'Material'],
  [1460, 'Crystal: B-Grade', 'Material'],
  [1461, 'Crystal: A-Grade', 'Material'],
  [1462, 'Crystal: S-Grade', 'Material'],
  [2130, 'Gemstone D', 'Material'],
  [2131, 'Gemstone C', 'Material'],
  [2132, 'Gemstone B', 'Material'],
  [2133, 'Gemstone A', 'Material'],
  [2134, 'Gemstone S', 'Material'],
  [1785, 'Soul Ore', 'Material'],
  [3031, 'Spirit Ore', 'Material'],
  [6364, 'Forgotten Blade', 'Arma S'],
  [6365, 'Basalt Battlehammer', 'Arma S'],
  [6366, 'Imperial Staff', 'Arma S'],
  [6367, 'Angel Slayer', 'Arma S'],
  [6368, 'Shining Bow', 'Arma S'],
  [6369, 'Dragon Hunter Axe', 'Arma S'],
  [6370, 'Saint Spear', 'Arma S'],
  [6371, 'Demon Splinter', 'Arma S'],
  [6372, "Heaven's Divider", 'Arma S'],
  [6579, 'Arcana Mace', 'Arma S'],
  [7575, 'Draconic Bow', 'Arma S'],
  [6373, 'Imperial Crusader Breastplate', 'Armadura S'],
  [6374, 'Imperial Crusader Gaiters', 'Armadura S'],
  [6375, 'Imperial Crusader Gauntlets', 'Armadura S'],
  [6376, 'Imperial Crusader Boots', 'Armadura S'],
  [6377, 'Imperial Crusader Shield', 'Armadura S'],
  [6378, 'Imperial Crusader Helmet', 'Armadura S'],
  [6379, 'Draconic Leather Armor', 'Armadura S'],
  [6380, 'Draconic Leather Gloves', 'Armadura S'],
  [6381, 'Draconic Leather Boots', 'Armadura S'],
  [6382, 'Draconic Leather Helmet', 'Armadura S'],
  [6383, 'Major Arcana Robe', 'Armadura S'],
  [6384, 'Major Arcana Gloves', 'Armadura S'],
  [6385, 'Major Arcana Boots', 'Armadura S'],
  [6386, 'Major Arcana Circlet', 'Armadura S'],
  [6656, 'Earring of Antharas', 'Joia épica'],
  [6657, 'Necklace of Valakas', 'Joia épica'],
  [6658, 'Ring of Baium', 'Joia épica'],
  [6659, 'Zaken\'s Earring', 'Joia épica'],
  [6660, 'Ring of Queen Ant', 'Joia épica'],
  [6661, 'Earring of Orfen', 'Joia épica'],
  [6662, 'Ring of Core', 'Joia épica'],
].map(([id, name, type]) => ({ id, name, type }));

export class ItemDB {
  constructor(custom = []) {
    this.map = new Map();
    for (const it of BUILTIN_ITEMS) this.map.set(it.id, it);
    this.setCustom(custom);
  }

  setCustom(list) {
    for (const it of list) this.map.set(it.id, it);
  }

  name(id) {
    return this.map.get(Number(id))?.name || null;
  }

  all() {
    return [...this.map.values()].sort((a, b) => a.id - b.id);
  }

  search(q, limit = 50) {
    const s = String(q || '').trim().toLowerCase();
    if (!s) return this.all().slice(0, limit);
    const out = [];
    for (const it of this.map.values()) {
      if (String(it.id).startsWith(s) || it.name.toLowerCase().includes(s)) out.push(it);
      if (out.length >= limit) break;
    }
    return out;
  }
}

// Lê itens de: XML do L2J/L2Mobius (<item id=".." name=".." type="..">), CSV/TXT ("id;nome", "id,nome", "id<TAB>nome").
export function parseItemsFile(text) {
  const out = [];
  if (/<item\s/i.test(text)) {
    const re = /<item\b([^>]*)>/gi;
    let m;
    while ((m = re.exec(text))) {
      const attrs = m[1];
      const id = /\bid\s*=\s*"(\d+)"/i.exec(attrs);
      const name = /\bname\s*=\s*"([^"]*)"/i.exec(attrs);
      const type = /\btype\s*=\s*"([^"]*)"/i.exec(attrs);
      if (id) out.push({ id: Number(id[1]), name: name ? name[1] : `Item ${id[1]}`, type: type ? type[1] : '' });
    }
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split(/[;\t,]/).map((s) => s.trim());
    if (parts.length < 2 || !/^\d+$/.test(parts[0])) continue;
    let name = parts[1];
    if (/^\d+$/.test(name) && parts[2]) name = parts[2]; // formatos com coluna extra numérica
    out.push({ id: Number(parts[0]), name, type: '' });
  }
  return out;
}
