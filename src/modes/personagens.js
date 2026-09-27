// Aba "Personagens": o nosso rig. Importa personagens (GLB, FBX, .psk/.psa do L2 e do Verdant
// Rig), cria o esqueleto em malhas estáticas (rig automático), copia animações de qualquer
// esqueleto humanoide para qualquer personagem e liga cada animação a um papel do jogo
// (parado, andar, correr, atacar...). NPCs e o jogador do modo Play usam esses personagens.
import { section, slider, select, checkbox, color, button, buttonRow, hint, el, text, pickFiles, toast, confirmBox, number, downloadBlob } from '../ui/ui.js';
import { icon } from '../ui/icons.js';
import { defaultCharacterDef, ANIM_SLOTS } from '../rig/characters.js';
import { AutoRigSession } from '../rig/autorigThree.js';
import { MARKERS } from '../rig/autorig.js';
import { NPC_TYPES } from '../city/city.js';

const st = {
  char: null,
  pack: 'padrao',
  packClip: '',
  packSlot: '',
  inPlace: false,
  keepPack: true,
  reduceTo: 8000,
  loops: true,
  headless: false,
};

async function readFiles(files) {
  return Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
}

export const personagensMode = {
  id: 'personagens',
  label: 'Personagens',
  short: 'Rig',
  icon: 'user',
  title: 'Personagens e rig: esqueleto, animações, NPCs e jogador',
  view: 'rig',
  hint: 'Arraste com o botão direito para girar • Roda: zoom • No rig automático clique num marcador e arraste as setas',

  enter(app) {
    this.app = app;
    const lab = app.rigLab;
    if (!st.char || !app.characters.def(st.char)) st.char = app.project.characters[0]?.id || null;
    if (!lab.session) lab.setCharacter(st.char);
    lab.focus();
    if (!this._wired) {
      this._wired = true;
      app.events.on('characters-changed', () => {
        if (app.mode?.id !== 'personagens') return;
        if (!app.rigLab.session && st.char && (!app.rigLab.inst || app.rigLab.charId !== st.char || app.rigLab.inst.tpl !== app.characters.get(st.char))) app.rigLab.setCharacter(st.char);
        app.refreshPanels();
      });
      app.events.on('rig-marker', () => { if (app.mode?.id === 'personagens') app.refreshRight(); });
    }
  },

  exit(app) {
    app.rigLab.gizmo.detach();
  },

  select(app, id) {
    st.char = id;
    app.rigLab.setCharacter(id);
    app.rigLab.focus();
    app.refreshPanels();
  },

  // ---------------------------------------------------------------- esquerda
  buildLeft(root, app) {
    const lib = app.characters;
    const lab = app.rigLab;
    const s = section(root, 'Personagens do projeto', { icon: 'user' });
    const list = el('div', { class: 'char-list' });
    for (const d of app.project.characters) {
      const users = app.project.npcs.filter((n) => n.character === d.id).length;
      const isPlayer = app.project.player.character === d.id;
      const loaded = lib.get(d.id);
      const r = el('button', { class: `char-row ${st.char === d.id && !lab.session ? 'active' : ''}`, type: 'button' },
        icon(d.kind === 'padrao' ? 'user' : 'package', 15),
        el('span', { class: 'char-name' }, d.name),
        el('span', { class: 'char-meta' }, `${isPlayer ? '▶ jogador • ' : ''}${users ? `${users} NPC${users > 1 ? 's' : ''} • ` : ''}${loaded ? `${loaded.clips.size} anim.` : 'carregando…'}`));
      r.addEventListener('click', () => { if (lab.session) lab.endSession(); this.select(app, d.id); });
      list.append(r);
    }
    if (!app.project.characters.length) list.append(el('p', { class: 'hint' }, 'Nenhum personagem ainda. Comece pelo boneco padrão ou importe o seu.'));
    s.append(list);
    buttonRow(s,
      button(null, 'Boneco padrão', () => this.addDefault(app), { icon: 'plus', title: 'Humano de 1,8 m com o nosso esqueleto e 8 animações prontas' }),
      button(null, 'Importar…', () => this.importCharacter(app), { icon: 'upload', variant: 'primary', title: 'GLB/FBX com esqueleto (Mixamo, Tripo...), ou .psk + .psa do L2 / Verdant Rig' }),
    );
    button(s, 'Rig automático (malha sem esqueleto)…', () => this.startAutoRig(app), { icon: 'wand', title: 'OBJ/GLB/FBX parado (ex.: gerado no Tripo): o programa acha as juntas e cria o nosso esqueleto' });
    hint(s, 'Formatos: GLB, FBX, OBJ e .psk/.psa (UE Viewer ou Verdant Rig). Tudo fica guardado no projeto em GLB.');

    const a = section(root, 'Animações para copiar', { icon: 'play' });
    const packs = [...lib.packs.values()];
    const listA = el('div', { class: 'char-list' });
    for (const p of packs) {
      const r = el('button', { class: `char-row ${st.pack === p.def.id ? 'active' : ''}`, type: 'button' },
        icon('layers', 15), el('span', { class: 'char-name' }, p.def.name), el('span', { class: 'char-meta' }, `${p.clips.length} anim.${p.def.files ? ' • no projeto' : p.def.id === 'padrao' ? '' : ' • só nesta sessão'}`));
      r.addEventListener('click', () => { st.pack = p.def.id; st.packClip = ''; app.refreshPanels(); });
      listA.append(r);
    }
    a.append(listA);
    button(a, 'Importar animações…', () => this.importPack(app), { icon: 'upload', title: '.psa (L2 / Verdant Rig, pode junto com o .psk), ou FBX/GLB do Mixamo' });
    checkbox(a, 'Guardar o pacote no projeto', st, 'keepPack', { title: 'Desmarque para pacotes muito grandes: as animações copiadas para os personagens ficam guardadas mesmo assim' });
    hint(a, 'Qualquer esqueleto humanoide serve: L2 (Bip01), Mixamo, Unreal, Blender e o nosso. A animação é adaptada às proporções de cada personagem.');
  },

  // ---------------------------------------------------------------- direita
  buildProps(root, app) {
    const lab = app.rigLab;
    if (lab.session) return this._sessionProps(root, app);
    const d = st.char && app.characters.def(st.char);
    if (!d) {
      const s = section(root, 'Personagens', { icon: 'user' });
      hint(s, 'Escolha um personagem à esquerda, crie o boneco padrão ou importe um modelo.');
      return;
    }
    const tpl = app.characters.get(d.id);
    const s = section(root, d.name, { icon: 'user' });
    text(s, 'Nome', d, 'name', { onChange: () => { app.markDirty(); app.refreshLeft(); } });
    slider(s, 'Altura (m)', d, 'height', { min: 0.3, max: 6, step: 0.01, onCommit: () => { app.characters.version++; lab.setCharacter(d.id); lab.focus(); app.city.refreshCharacters(); app.markDirty(); } });
    if (d.kind === 'padrao') {
      const c = d.colors;
      const recolor = () => { app.characters.templates.delete(d.id); app.characters.ensure(d.id).then(() => { lab.setCharacter(d.id); app.city.refreshCharacters(); }); app.markDirty(); };
      color(s, 'Pele', c, 'skin', { onChange: recolor });
      color(s, 'Roupa', c, 'cloth', { onChange: recolor });
      color(s, 'Botas', c, 'leather', { onChange: recolor });
    }
    if (tpl) s.append(el('div', { class: 'kv' },
      el('span', {}, 'Ossos'), el('b', {}, tpl.info.bones.length),
      el('span', {}, 'Humanoide'), el('b', {}, `${tpl.info.score} de 22 ossos reconhecidos`),
      el('span', {}, 'Animações'), el('b', {}, tpl.clips.size)));

    // ---- prévia
    const pv = section(root, 'Prévia', { icon: 'play' });
    const names = tpl ? tpl.clipNames() : [];
    const pvObj = { clip: lab.clip && (names.includes(lab.clip) || d.slots?.[lab.clip]) ? lab.clip : 'parado' };
    select(pv, 'Animação', pvObj, 'clip', [...ANIM_SLOTS.filter((x) => d.slots?.[x.id]).map((x) => ({ value: x.id, label: `▸ ${x.label}` })), ...names.map((n) => ({ value: n, label: n }))], { onChange: (v) => lab.play(v) });
    buttonRow(pv,
      button(null, lab.playing ? 'Pausar' : 'Tocar', () => { lab.setPlaying(!lab.playing); app.refreshRight(); }, { icon: 'play' }),
      button(null, 'Centralizar', () => lab.focus(), { icon: 'target' }),
    );
    slider(pv, 'Velocidade', lab, 'speed', { min: 0, max: 2, step: 0.05, onChange: (v) => lab.setSpeed(v) });
    checkbox(pv, 'Mostrar esqueleto', lab, 'showSkeleton', { onChange: (v) => lab.setShowSkeleton(v) });
    checkbox(pv, 'Girar devagar', lab, 'turntable');

    // ---- papéis
    const sl = section(root, 'Animações do jogo', { icon: 'sliders' });
    for (const slot of ANIM_SLOTS) {
      const obj = { v: d.slots?.[slot.id] || '' };
      select(sl, slot.label, obj, 'v', [{ value: '', label: '(nenhuma)' }, ...names.map((n) => ({ value: n, label: n }))], {
        onChange: (v) => {
          d.slots = { ...d.slots, [slot.id]: v || undefined };
          if (!v) delete d.slots[slot.id];
          app.markDirty();
          app.city.refreshCharacters();
          lab.play(slot.id);
        },
      });
    }
    hint(sl, 'O modo Play troca sozinho entre parado, andar, correr e pular; os NPCs ficam na animação "Parado".');

    // ---- copiar de um pacote
    const cp = section(root, 'Copiar animações', { icon: 'copy' });
    const lib = app.characters;
    const packOpts = [...lib.packs.values()].map((p) => ({ value: p.def.id, label: p.def.name }));
    for (const other of app.project.characters) if (other.id !== d.id && lib.get(other.id)) packOpts.push({ value: `pers:${other.id}`, label: `Personagem: ${other.name}` });
    if (!packOpts.find((o) => o.value === st.pack)) st.pack = packOpts[0]?.value || '';
    select(cp, 'De', st, 'pack', packOpts, { onChange: () => { st.packClip = ''; app.refreshRight(); } });
    const src = st.pack.startsWith('pers:') ? lib.get(st.pack.slice(5)) : lib.packs.get(st.pack);
    const srcNames = src ? (src.clips.keys ? [...src.clips.keys()] : src.clips.map((c) => c.name)) : [];
    if (srcNames.length && !srcNames.includes(st.packClip)) st.packClip = srcNames[0];
    select(cp, 'Animação', st, 'packClip', srcNames.map((n) => ({ value: n, label: n })));
    select(cp, 'Ligar ao papel', st, 'packSlot', [{ value: '', label: '(só copiar)' }, ...ANIM_SLOTS.map((x) => ({ value: x.id, label: x.label }))]);
    checkbox(cp, 'No lugar (tira o deslocamento para a frente)', st, 'inPlace', { title: 'Para andar/correr que avançam o corpo: o jogo é que move o personagem' });
    const run = async (clips) => {
      if (!clips.length) return;
      try {
        app.log(`Copiando ${clips.length} animação(ões) para ${d.name}…`);
        const added = await lib.copyClips(d.id, st.pack, clips, { slot: clips.length === 1 ? st.packSlot : null, inPlace: st.inPlace });
        toast(`${added.length} animação(ões) copiadas para ${d.name}.`, 'ok');
        if (added.length === 1) lab.play(added[0]);
        lab.setCharacter(d.id);
        app.city.refreshCharacters();
        app.refreshPanels();
      } catch (err) {
        toast(`Não deu para copiar: ${err.message}`, 'error', 6000);
      }
    };
    buttonRow(cp,
      button(null, 'Copiar', () => run([st.packClip].filter(Boolean)), { icon: 'copy', variant: 'primary' }),
      button(null, `Copiar todas (${srcNames.length})`, () => run(srcNames), { icon: 'layers' }),
    );

    // ---- uso
    const us = section(root, 'Usar no jogo', { icon: 'map' });
    const pl = { on: app.project.player.character === d.id };
    checkbox(us, 'Personagem do jogador (modo Play)', pl, 'on', { onChange: (v) => { app.project.player.character = v ? d.id : null; app.markDirty(); app.refreshLeft(); } });
    const tp = { type: 'Merchant' };
    select(us, 'Tipo de NPC', tp, 'type', NPC_TYPES.map((t) => ({ value: t.id, label: t.label })));
    buttonRow(us,
      button(null, 'Usar em todos desse tipo', () => {
        app.city.commit('Aparência dos NPCs', () => {
          for (const n of app.project.npcs) if (n.type === tp.type) n.character = d.id;
          app.city.refreshCharacters();
        });
        app.refreshLeft();
        toast(`${d.name} aplicado aos NPCs do tipo ${tp.type}.`, 'ok');
      }, { icon: 'user' }),
    );
    hint(us, 'Cada NPC também tem a opção "Aparência" no painel dele (aba NPC).');

    const ex = section(root, 'Arquivos', { icon: 'package' });
    buttonRow(ex,
      button(null, 'Baixar GLB', async () => {
        try {
          const buf = await app.characters.exportGameGlb(d.id);
          await downloadBlob(new Uint8Array(buf), `${d.name.replace(/[^\w-]+/g, '_')}.glb`, 'model/gltf-binary');
        } catch (err) { toast(`Erro ao gerar o GLB: ${err.message}`, 'error'); }
      }, { icon: 'download', title: 'Malha + esqueleto + todas as animações, em metros, de pé — para o seu jogo ou outra engine' }),
      button(null, 'Excluir', async () => {
        if (!(await confirmBox(`Excluir o personagem "${d.name}"? Os NPCs que usam ele voltam ao marcador.`, 'Excluir'))) return;
        app.characters.remove(d.id);
        st.char = app.project.characters[0]?.id || null;
        app.rigLab.setCharacter(st.char);
        app.city.refreshCharacters();
        app.refreshPanels();
      }, { icon: 'trash', variant: 'danger' }),
    );
  },

  // ---------------------------------------------------------------- rig automático (direita)
  _sessionProps(root, app) {
    const lab = app.rigLab;
    const s = lab.session;
    const head = section(root, `Rig automático: ${s.name}`, { icon: 'wand' });
    head.append(el('div', { class: 'kv' },
      el('span', {}, 'Triângulos'), el('b', {}, s.triangles.toLocaleString('pt-BR')),
      el('span', {}, 'Altura'), el('b', {}, `${s.height.toFixed(2)} unidades`),
      el('span', {}, 'Girado'), el('b', {}, `${s.rotated}°`)));
    const r = section(root, '1. Reduzir polígonos', { icon: 'sliders', open: s.triangles > st.reduceTo * 1.2 });
    number(r, 'Triângulos alvo', st, 'reduceTo', { min: 500, max: 60000, step: 500 });
    button(r, 'Reduzir', () => {
      const res = s.reduce(st.reduceTo);
      lab.startSession(s);
      app.log(`Malha reduzida: ${res.before} → ${res.after} triângulos.`, 'ok');
      app.refreshRight();
    }, { icon: 'sliders' });
    hint(r, 'Malhas de IA (Tripo etc.) vêm com dezenas de milhares de triângulos; 3.000 a 8.000 é o bastante.');

    const d = section(root, '2. Juntas', { icon: 'target' });
    checkbox(d, 'Malha sem cabeça', st, 'headless');
    button(d, s.markers ? 'Detectar de novo' : 'Detectar juntas', () => {
      const res = s.detect({ headless: st.headless });
      lab.refreshMarkers();
      for (const w of res.report.warnings) app.log(w, 'warn');
      for (const i of res.report.info) app.log(i);
      app.refreshRight();
    }, { icon: 'target', variant: s.markers ? '' : 'primary' });
    if (s.markers) {
      checkbox(d, 'Simetria (o outro lado acompanha)', lab, 'symmetry');
      const sel = { m: lab.selectedMarker || '' };
      select(d, 'Marcador', sel, 'm', [{ value: '', label: '(clique num marcador no 3D)' }, ...MARKERS.map((m) => ({ value: m.id, label: m.label }))], { onChange: (v) => lab.selectMarker(v || null) });
      hint(d, 'Verde = esquerda, azul = direita, laranja = centro. Arraste as setas para ajustar.');
    }
    const b = section(root, '3. Criar esqueleto', { icon: 'user' });
    checkbox(b, 'Anéis de vértices nas juntas', st, 'loops', { title: 'Corta a malha em cotovelos, joelhos, pulsos e tornozelos para a pele dobrar sem quebrar' });
    buttonRow(b,
      button(null, 'Criar personagem', () => this.finishAutoRig(app), { icon: 'check', variant: 'primary' }),
      button(null, 'Cancelar', () => { lab.endSession(); lab.setCharacter(st.char); lab.focus(); app.refreshPanels(); }, { icon: 'x' }),
    );
    hint(b, 'A malha precisa estar em pé, em pose T ou A, simétrica e com as pernas separadas. O personagem ganha o nosso esqueleto e as 8 animações padrão; depois copie outras à vontade.');
  },

  // ---------------------------------------------------------------- ações
  addDefault(app) {
    const n = app.project.characters.filter((c) => c.kind === 'padrao').length;
    const palette = [['#4a5a78', '#c9a98a'], ['#7a2e2e', '#b8916e'], ['#2f5a3a', '#d2b294'], ['#5a4a78', '#8f6a50']];
    const [cloth, skin] = palette[n % palette.length];
    const d = defaultCharacterDef({ name: n ? `Boneco ${n + 1}` : 'Boneco padrão', colors: { skin, cloth, leather: '#4a3322' } });
    app.project.characters.push(d);
    app.characters.ensure(d.id).then(() => { app.characters.version++; app.events.emit('characters-changed'); });
    app.markDirty();
    this.select(app, d.id);
  },

  async importCharacter(app) {
    const files = await pickFiles('.glb,.gltf,.fbx,.psk,.psa,.obj', true);
    if (!files.length) return;
    try {
      app.log(`Lendo ${files.map((f) => f.name).join(', ')}…`);
      const r = await app.characters.importFiles(await readFiles(files));
      if (r.needsRig) return this._openSession(app, r.object, r.name);
      const tpl = app.characters.get(r.def.id);
      // sem animações próprias: ganha as nossas (adaptadas ao esqueleto dele)
      if (!tpl.clips.size && tpl.info.score >= 8) await app.characters.copyClips(r.def.id, 'padrao', [...app.characters.packs.get('padrao').clips.map((c) => c.name)]);
      app.log(`Personagem "${r.def.name}": ${tpl.info.bones.length} ossos, ${tpl.clips.size} animações.`, 'ok');
      if (tpl.info.score < 8) toast('O esqueleto não parece humanoide: ele toca as animações dele, mas não dá para copiar animações de outros.', 'warn', 7000);
      this.select(app, r.def.id);
    } catch (err) {
      toast(`Não deu para importar: ${err.message}`, 'error', 7000);
    }
  },

  async startAutoRig(app) {
    const files = await pickFiles('.obj,.glb,.gltf,.fbx', false);
    if (!files.length) return;
    try {
      const [f] = await readFiles(files);
      const r = await app.characters.importFiles([f]);
      if (!r.needsRig) {
        toast('Esse modelo já tem esqueleto: foi importado como personagem pronto.', 'ok');
        return this.select(app, r.def.id);
      }
      this._openSession(app, r.object, r.name);
    } catch (err) {
      toast(`Não deu para abrir: ${err.message}`, 'error', 7000);
    }
  },

  _openSession(app, object, name) {
    const s = new AutoRigSession(object, name);
    if (s.triangles > st.reduceTo * 1.5) {
      const r = s.reduce(st.reduceTo);
      app.log(`Malha grande: reduzida de ${r.before} para ${r.after} triângulos (dá para mudar no passo 1).`);
    }
    const res = s.detect({ headless: st.headless });
    for (const w of res.report.warnings) app.log(w, 'warn');
    app.rigLab.setCharacter(null);
    app.rigLab.startSession(s);
    app.log(`Rig automático: confira os marcadores das juntas e clique em "Criar personagem".${s.rotated ? ` (malha girada ${s.rotated}° para ficar de frente)` : ''}`);
    app.refreshPanels();
  },

  async finishAutoRig(app) {
    const lab = app.rigLab;
    const s = lab.session;
    try {
      const { root, loops } = s.build({ loops: st.loops });
      const def = await app.characters.addRigged(s.name, root);
      await app.characters.copyClips(def.id, 'padrao', app.characters.packs.get('padrao').clips.map((c) => c.name));
      lab.endSession();
      app.log(`Personagem "${def.name}" criado com o nosso esqueleto${loops ? ` (${loops} anéis nas juntas)` : ''} e as animações padrão.`, 'ok');
      this.select(app, def.id);
    } catch (err) {
      toast(`Não deu para criar o esqueleto: ${err.message}`, 'error', 7000);
    }
  },

  async importPack(app) {
    const files = await pickFiles('.psa,.psk,.fbx,.glb,.gltf', true);
    if (!files.length) return;
    try {
      const p = await app.characters.importPack(await readFiles(files), { keep: st.keepPack });
      st.pack = p.def.id;
      app.markDirty();
      app.log(`Pacote "${p.def.name}": ${p.clips.length} animações (${p.info.score} ossos do corpo reconhecidos).`, 'ok');
      app.refreshPanels();
    } catch (err) {
      toast(`Não deu para importar: ${err.message}`, 'error', 7000);
    }
  },
};
