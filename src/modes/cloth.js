// Aba "Capa/Roupa": física de tecido para capas, mantos/saias e bandeiras.
import { section, slider, select, checkbox, color, button, buttonRow, hint, el, text, pickFiles, readFileAs, toast, downloadBlob } from '../ui/ui.js';
import { CLOTH_PRESETS } from '../cloth/capeLab.js';
import { defaultClothPreset } from '../core/state.js';

export const clothMode = {
  id: 'roupa',
  label: 'Roupa',
  icon: 'shirt',
  title: 'Física de roupa: capas, mantos, saias e bandeiras',
  view: 'cloth',
  hint: 'Arraste para girar a câmera • Roda: zoom • O boneco anda em círculo para você ver o tecido reagir',

  enter(app) {
    this.app = app;
    app.capeLab.focus();
  },

  applyPreset(p) {
    const app = this.app;
    const cur = app.project.cloth.current;
    app.project.cloth.current = { ...defaultClothPreset(), ...p, emblem: p.emblem ?? cur.emblem };
    app.capeLab.rebuild();
    app.capeLab.focus();
    app.markDirty();
    app.refreshPanels();
    app.log(`Roupa: ${p.name}`);
  },

  buildLeft(root, app) {
    const lab = app.capeLab;
    const P = app.project.cloth.current;
    const rebuild = () => { lab.rebuild(); app.markDirty(); };
    const params = () => { lab.updateParams(); app.markDirty(); };

    const t = section(root, 'Tipo de tecido', { icon: 'shirt' });
    select(t, 'Tipo', P, 'type', [
      { value: 'capa', label: 'Capa (presa nos ombros)' },
      { value: 'saia', label: 'Manto / saia (presa na cintura)' },
      { value: 'bandeira', label: 'Bandeira (presa no mastro)' },
    ], { onChange: () => { rebuild(); lab.focus(); app.refreshPanels(); } });
    select(t, 'Formato da ponta', P, 'shape', [
      { value: 'reta', label: 'Reta' },
      { value: 'v', label: 'Em V' },
      { value: 'redonda', label: 'Arredondada' },
      { value: 'pontas', label: 'Em pontas' },
      { value: 'rasgada', label: 'Rasgada' },
    ], { onChange: rebuild });
    slider(t, 'Largura (m)', P, 'width', { min: 0.3, max: 4, step: 0.01, onCommit: rebuild });
    slider(t, 'Comprimento (m)', P, 'length', { min: 0.2, max: 3, step: 0.01, onCommit: rebuild });
    slider(t, 'Abertura embaixo', P, 'flare', { min: 0, max: 1.5, step: 0.01, onCommit: rebuild });
    slider(t, 'Colunas', P, 'cols', { min: 4, max: 40, step: 1, onCommit: rebuild });
    slider(t, 'Linhas', P, 'rows', { min: 4, max: 40, step: 1, onCommit: rebuild });
    hint(t, 'Mais colunas/linhas = tecido mais macio (e mais pesado para o PC).');

    const f = section(root, 'Física', { icon: 'sliders' });
    slider(f, 'Gravidade', P, 'gravity', { min: 0, max: 25, step: 0.1, onChange: params });
    slider(f, 'Rigidez', P, 'stiffness', { min: 0.1, max: 1, step: 0.01, onChange: params, title: 'Quanto o tecido resiste a esticar' });
    slider(f, 'Dobra', P, 'bend', { min: 0, max: 1, step: 0.01, onChange: params, title: 'Baixo = seda, alto = couro' });
    slider(f, 'Amortecimento', P, 'damping', { min: 0, max: 0.3, step: 0.005, onChange: params, title: 'Resistência do ar' });
    slider(f, 'Iterações', P, 'iterations', { min: 3, max: 30, step: 1, onChange: params, title: 'Precisão da simulação' });
    slider(f, 'Peso', P, 'mass', { min: 0.1, max: 5, step: 0.05, onChange: params });
    checkbox(f, 'Colidir com o corpo', P, 'collision', { onChange: params });
    slider(f, 'Raio do corpo (m)', P, 'bodyRadius', { min: 0.08, max: 0.5, step: 0.005, onChange: params });

    const w = section(root, 'Vento', { icon: 'wind' });
    checkbox(w, 'Vento ligado', lab, 'windOn');
    slider(w, 'Força', P, 'windStrength', { min: 0, max: 20, step: 0.1, onChange: params });
    slider(w, 'Turbulência', P, 'windTurbulence', { min: 0, max: 2, step: 0.01, onChange: params });
    slider(w, 'Direção (°)', lab, 'windDir', { min: 0, max: 360, step: 1 });

    buttonRow(root,
      button(null, 'Reiniciar tecido', () => lab.resetSim(), { icon: 'rotate' }),
      button(null, 'Centralizar câmera', () => lab.focus(), { icon: 'target' }),
    );
  },

  buildProps(root, app) {
    const lab = app.capeLab;
    const P = app.project.cloth.current;

    const a = section(root, 'Aparência', { icon: 'image' });
    color(a, 'Cor de fora', P, 'colorOuter', { onChange: () => { lab.refreshMaterial(); app.markDirty(); } });
    color(a, 'Cor de dentro / faixa', P, 'colorInner', { onChange: () => { lab.refreshMaterial(); app.markDirty(); } });
    slider(a, 'Brilho do tecido', P, 'shininess', { min: 0, max: 1, step: 0.01, onCommit: () => lab.refreshMaterial() });
    buttonRow(a,
      button(null, 'Emblema…', async () => {
        const [file] = await pickFiles('image/*');
        if (!file) return;
        await lab.setEmblem(await readFileAs(file, 'dataurl'));
        app.markDirty();
      }, { icon: 'shield', title: 'Imagem (PNG com transparência fica melhor) no centro da capa' }),
      button(null, 'Tirar emblema', async () => { await lab.setEmblem(null); app.markDirty(); }),
    );

    if (P.type !== 'bandeira') {
      const c = section(root, 'Personagem', { icon: 'user' });
      if (!lab.character) {
        select(c, 'Animação', lab, 'anim', [
          { value: 'parado', label: 'Parado' },
          { value: 'andando', label: 'Andando' },
          { value: 'correndo', label: 'Correndo' },
          { value: 'girando', label: 'Girando' },
          { value: 'pulando', label: 'Pulando' },
        ]);
      }
      slider(c, 'Velocidade', lab, 'animSpeed', { min: 0, max: 3, step: 0.05 });
      checkbox(c, 'Câmera segue', lab, 'followCam');
      if (lab.character) {
        const ch = lab.character;
        c.append(el('p', { class: 'hint' }, `Personagem: ${ch.name} (${ch.bones.length} ossos, ${ch.clips.length} animações)`));
        if (ch.clips.length) {
          select(c, 'Animação', lab.charOpts, 'clip', ch.clips.map((cl, i) => ({ value: i, label: cl.name || `Animação ${i + 1}` })), { onChange: (v) => lab.playClip(Number(v)) });
        }
        if (ch.bones.length) {
          select(c, 'Osso de apoio', lab.charOpts, 'bone', ch.bones.map((b) => ({ value: b.name, label: b.name })), { onChange: () => lab.resetSim() });
        }
        checkbox(c, 'Seguir rotação do osso', lab.charOpts, 'followBone', { onChange: () => lab.resetSim() });
        slider(c, 'Ajuste X', lab.charOpts, 'offsetX', { min: -0.5, max: 0.5, step: 0.005 });
        slider(c, 'Ajuste Y', lab.charOpts, 'offsetY', { min: -0.5, max: 0.5, step: 0.005 });
        slider(c, 'Ajuste Z', lab.charOpts, 'offsetZ', { min: -0.5, max: 0.5, step: 0.005 });
        slider(c, 'Girar X (°)', lab.charOpts, 'rotX', { min: -180, max: 180, step: 1 });
        slider(c, 'Girar Y (°)', lab.charOpts, 'rotY', { min: -180, max: 180, step: 1 });
        slider(c, 'Girar Z (°)', lab.charOpts, 'rotZ', { min: -180, max: 180, step: 1 });
        slider(c, 'Altura do tronco (colisão)', lab.charOpts, 'bodyHeight', { min: 0.2, max: 1, step: 0.01 });
        button(c, 'Voltar ao manequim', () => { lab.removeCharacter(); app.refreshRight(); });
      }
      button(c, 'Importar personagem (GLB/FBX)…', async () => {
        const [file] = await pickFiles('.glb,.fbx');
        if (!file) return;
        try {
          await lab.importCharacter(file);
          toast('Personagem importado. Escolha o osso do peito para a capa (ou do quadril para saia).', 'ok', 6000);
          app.refreshRight();
        } catch (err) {
          toast(`Erro: ${err.message}`, 'error');
        }
      }, { icon: 'upload', title: 'Ex.: personagem do Mixamo em .fbx ou .glb com animação' });
    }

    const pr = section(root, 'Modelos prontos', { icon: 'sparkles' });
    const list = el('div', { class: 'preset-list' });
    const all = [...CLOTH_PRESETS.map((p) => ({ p, builtin: true })), ...app.project.cloth.presets.map((p) => ({ p, builtin: false }))];
    all.forEach(({ p, builtin }, i) => {
      const b = el('button', { class: 'preset', type: 'button' }, el('span', { class: 'chip', style: { background: p.colorOuter } }), p.name, builtin ? '' : ' ★');
      b.addEventListener('click', () => this.applyPreset(p));
      if (!builtin) {
        b.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          app.project.cloth.presets.splice(i - CLOTH_PRESETS.length, 1);
          app.markDirty();
          app.refreshRight();
        });
      }
      list.append(b);
    });
    pr.append(list);
    const nameObj = { name: P.name };
    text(pr, 'Nome', nameObj, 'name', { onChange: (v) => { P.name = v; } });
    button(pr, 'Salvar como modelo', () => {
      app.project.cloth.presets.push(JSON.parse(JSON.stringify({ ...P, name: nameObj.name || 'Minha capa' })));
      app.markDirty();
      app.refreshRight();
      toast('Modelo salvo no projeto.', 'ok');
    }, { icon: 'save' });
    hint(pr, 'Botão direito num modelo ★ seu para apagar.');

    const ex = section(root, 'Exportar para o UE5', { icon: 'package' });
    button(ex, 'Baixar malha + ajustes', async () => {
      const files = await lab.exportFiles();
      for (const f of files) await downloadBlob(f.data, f.path, f.path.endsWith('.json') ? 'application/json' : 'model/gltf-binary');
    }, { icon: 'download' });
    hint(ex, 'A malha sai em pose de repouso com os vértices presos marcados em vermelho (cor de vértice). No UE5 use Clothing > Create Clothing Data e pinte Max Distance = 0 nesses vértices. O pacote UE5 (aba Exportar) já inclui a capa atual.');
  },
};
