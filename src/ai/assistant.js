// Painel do assistente Claude: conversa em português e mexe no editor pelas ferramentas.
// Três canais:
//   claude — dentro do claude.ai (artifact): usa a conta do próprio usuário, sem chave;
//   api    — chave da API da Anthropic guardada só neste navegador;
//   ponte  — Claude Code no computador do usuário (tools/mcp.mjs): o Claude Code manda e o editor executa.
import { el, clear, toast } from '../ui/ui.js';
import { icon } from '../ui/icons.js';
import { AssistantTools } from './tools.js';
import { TOOL_DEFS, TOOL_MAP, ASSISTANT_RULES } from './toolDefs.js';

const KEY_API = 'editorjogo:anthropic-key';
const KEY_MODEL = 'editorjogo:anthropic-model';
const KEY_CHANNEL = 'editorjogo:ia-canal';
const DEFAULT_MODEL = 'claude-opus-5';
const MAX_ROUNDS = 30;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v === null || v === '') localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
};

const LABELS = {
  get_overview: 'Olhando o projeto',
  analyze_world: 'Analisando o mundo',
  program_info: 'Vendo o que o editor faz',
  list_things: 'Listando',
  get_item: 'Lendo detalhes',
  terrain_info: 'Medindo o terreno',
  screenshot: 'Tirando foto da tela',
  set_camera: 'Movendo a câmera',
  set_sky: 'Ajustando céu e clima',
  terrain_generate: 'Gerando terreno',
  terrain_sculpt: 'Esculpindo terreno',
  terrain_paint: 'Pintando terreno',
  terrain_auto_paint: 'Auto-pintando terreno',
  set_grass: 'Ajustando a grama',
  place_objects: 'Colocando peças',
  edit_objects: 'Editando objetos',
  scatter_nature: 'Espalhando natureza',
  build_wall: 'Levantando muralha',
  add_npcs: 'Criando NPCs',
  edit_npcs: 'Editando NPCs',
  add_zone: 'Criando zona',
  upsert_shop: 'Montando loja',
  upsert_page: 'Escrevendo diálogo',
  set_character: 'Trocando personagem',
  editor_action: 'Comando do editor',
  run_script: 'Rodando script',
  build_structure: 'Construindo',
  edit_structure: 'Ajustando construção',
  list_materials: 'Vendo materiais',
  import_files: 'Importando arquivos',
};

const QUICK = [
  ['O que falta no mundo?', 'Analise o mundo atual e me diga, em ordem de prioridade, o que falta para ele parecer uma região de Lineage 2 pronta para jogar.'],
  ['O que falta no programa?', 'Com base no que o editor já faz, o que ainda falta no programa para eu montar o meu MMORPG? Liste o que é mais importante primeiro.'],
  ['Monte uma vila', 'Monte uma vila pequena na área plana mais próxima do centro: casas, taverna, templo, praça com fonte, NPCs de serviço com loja e diálogo, guardas no portão, zona de paz, muralha e natureza em volta.'],
  ['Área de caça', 'Crie uma área de caça com monstros fora da cidade, com levels crescendo com a distância, e um caminho ligando à cidade.'],
];

// Markdown simples: parágrafos, listas, **negrito**, `código`, blocos ```.
function renderMarkdown(text) {
  const root = el('div', { class: 'ai-md' });
  const inline = (s, parent) => {
    const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    for (const p of parts) {
      if (!p) continue;
      if (p.startsWith('**') && p.endsWith('**') && p.length > 4) parent.append(el('b', {}, p.slice(2, -2)));
      else if (p.startsWith('`') && p.endsWith('`') && p.length > 2) parent.append(el('code', {}, p.slice(1, -1)));
      else parent.append(p);
    }
  };
  const lines = text.split('\n');
  let list = null, code = null;
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (code) { root.append(code); code = null; } else { code = el('pre', {}); list = null; }
      continue;
    }
    if (code) { code.append(`${line}\n`); continue; }
    const m = line.match(/^\s*([-*•]|\d+[.)])\s+(.*)$/);
    if (m) {
      const ordered = /\d/.test(m[1]);
      if (!list || list.tagName !== (ordered ? 'OL' : 'UL')) { list = el(ordered ? 'ol' : 'ul'); root.append(list); }
      const li = el('li');
      inline(m[2], li);
      list.append(li);
      continue;
    }
    list = null;
    if (!line.trim()) continue;
    const h = line.match(/^#{1,4}\s+(.*)$/);
    const p = el(h ? 'h4' : 'p');
    inline(h ? h[1] : line, p);
    root.append(p);
  }
  if (code) root.append(code);
  return root;
}

function describeError(code) {
  return {
    not_granted: 'O claude.ai não liberou o assistente nesta página (permissão recusada).',
    sampling_disabled: 'O Claude não está disponível nesta conta/organização.',
    rate_limited: 'Muitas mensagens seguidas ou limite de uso atingido. Espere um pouco e tente de novo.',
    session_expired: 'Sua sessão do claude.ai expirou: entre de novo.',
    prompt_too_large: 'A conversa ficou grande demais. Clique em "Nova conversa".',
    refused: 'O Claude recusou este pedido. Tente escrever de outro jeito.',
    empty_completion: 'O Claude não respondeu nada. Tente pedir menos de uma vez.',
    tools_unavailable: 'Este lugar não permite que o Claude use as ferramentas do editor.',
    upstream_error: 'Falha de conexão com o Claude. Tente de novo.',
  }[code] || `Erro: ${code}`;
}

export class Assistant {
  constructor(app) {
    this.app = app;
    this.tools = new AssistantTools(app);
    this.channels = { claude: null, api: true, ponte: null };
    this.channel = store.get(KEY_CHANNEL) || 'auto';
    this.turns = []; // canal claude: [{role, content}]
    this.apiMessages = []; // canal api: mensagens completas (com tool_use / tool_result)
    this.busy = false;
    this.ctl = null;
    this.attachShot = false;
    this.bridge = new BridgeClient(this);
    this._build();
    this.detect();
  }

  // ------------------------------------------------------------ canais
  async detect() {
    // dentro do claude.ai
    if (window.claude?.use) {
      try {
        const sample = await window.claude.use('sample');
        if (sample) {
          this.sample = sample;
          this.limits = await sample.limits().catch(() => null);
          this.channels.claude = true;
        }
      } catch { /* sem sample */ }
    }
    // servido pela ponte do Claude Code
    if (await this.bridge.start()) this.channels.ponte = true;
    this._renderHead();
    this._renderStatus();
  }

  get activeChannel() {
    const c = this.channel;
    if (c !== 'auto' && (c === 'api' || this.channels[c])) return c;
    if (this.channels.ponte) return 'ponte';
    if (this.channels.claude) return 'claude';
    return 'api';
  }

  // ------------------------------------------------------------ interface
  _build() {
    this.btn = el('button', { class: 'top-btn ai-btn', type: 'button', title: 'Assistente Claude: peça em português e ele monta no editor' }, icon('sparkles', 15), el('span', {}, 'Claude'));
    this.btn.addEventListener('click', () => this.toggle());
    this.chanSel = el('select', { class: 'ai-chan', title: 'Como falar com o Claude' });
    this.chanSel.addEventListener('change', () => { this.channel = this.chanSel.value; store.set(KEY_CHANNEL, this.channel); this._renderStatus(); });
    const newBtn = el('button', { class: 'ibtn tiny', type: 'button', title: 'Nova conversa' }, icon('fileNew', 14));
    newBtn.addEventListener('click', () => this.reset());
    const closeBtn = el('button', { class: 'ibtn tiny', type: 'button', title: 'Fechar' }, icon('x', 14));
    closeBtn.addEventListener('click', () => this.toggle(false));
    this.head = el('div', { class: 'ai-head' }, icon('sparkles', 15), el('b', {}, 'Assistente Claude'), el('span', { class: 'spacer' }), this.chanSel, newBtn, closeBtn);
    this.statusEl = el('div', { class: 'ai-status' });
    this.log = el('div', { class: 'ai-log' });
    this.quick = el('div', { class: 'ai-quick' }, ...QUICK.map(([label, prompt]) => {
      const b = el('button', { type: 'button', class: 'ai-chip' }, label);
      b.addEventListener('click', () => this.send(prompt));
      return b;
    }));
    this.input = el('textarea', { class: 'ai-input', rows: 3, placeholder: 'Ex.: "faça uma vila de pescadores na beira do lago com 6 casas e um mercador de peixe"' });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(this.input.value); }
      e.stopPropagation();
    });
    this.sendBtn = el('button', { type: 'button', class: 'btn primary ai-send' }, 'Enviar');
    this.sendBtn.addEventListener('click', () => (this.busy ? this.stop() : this.send(this.input.value)));
    const shot = el('input', { type: 'checkbox' });
    shot.addEventListener('change', () => { this.attachShot = shot.checked; });
    const scripts = el('input', { type: 'checkbox' });
    scripts.addEventListener('change', () => { this.tools.allowScripts = scripts.checked; });
    this.shotLabel = el('label', { class: 'ai-opt', title: 'Manda uma foto da vista 3D junto com a mensagem' }, shot, 'Foto da tela');
    const scriptLabel = el('label', { class: 'ai-opt', title: 'Deixa o Claude rodar código dentro do editor (controle total). Ctrl+Z desfaz o que mudar no projeto.' }, scripts, 'Permitir scripts');
    this.foot = el('div', { class: 'ai-foot' }, this.input, el('div', { class: 'ai-row' }, this.shotLabel, scriptLabel, el('span', { class: 'spacer' }), this.sendBtn));
    this.settings = el('div', { class: 'ai-settings' });
    this.panel = el('aside', { class: 'ai-panel', hidden: true }, this.head, this.statusEl, this.settings, this.log, this.quick, this.foot);
    this._renderHead();
    this._renderStatus();
    this._hello();
  }

  _hello() {
    this._bubble('assistant', 'Oi! Sou o Claude. Posso montar cidades, esculpir e pintar o terreno, criar NPCs com loja e diálogo, espalhar natureza, construir casas no Construtor e analisar o que falta no mundo e no programa. Tudo que eu fizer entra no histórico: **Ctrl+Z** desfaz.');
  }

  toggle(force) {
    const open = force ?? this.panel.hidden;
    this.panel.hidden = !open;
    this.btn.classList.toggle('active', open);
    if (open) setTimeout(() => this.input.focus(), 0);
  }

  reset() {
    this.stop();
    this.turns = [];
    this.apiMessages = [];
    clear(this.log);
    this._hello();
  }

  _renderHead() {
    clear(this.chanSel);
    const opts = [['auto', 'Automático']];
    if (this.channels.claude) opts.push(['claude', 'claude.ai']);
    opts.push(['api', 'Chave da API']);
    if (this.channels.ponte) opts.push(['ponte', 'Claude Code (ponte)']);
    for (const [v, l] of opts) this.chanSel.append(el('option', { value: v }, l));
    this.chanSel.value = opts.some(([v]) => v === this.channel) ? this.channel : 'auto';
  }

  _renderStatus() {
    const ch = this.activeChannel;
    clear(this.statusEl);
    clear(this.settings);
    this.settings.hidden = true;
    this.foot.hidden = false;
    this.quick.hidden = false;
    this.shotLabel.hidden = ch === 'claude' && !this.limits?.images;
    if (ch === 'claude') {
      const tools = this.limits?.tools;
      this.statusEl.append(el('span', { class: 'dot ok' }), el('span', { class: 'txt' }, tools ? 'Usando sua conta do claude.ai.' : 'Usando sua conta do claude.ai (sem ferramentas aqui: só conversa).'));
    } else if (ch === 'ponte') {
      this.statusEl.append(el('span', { class: 'dot ok' }), el('span', { class: 'txt' }, 'Ligado ao Claude Code. Escreva no Claude Code; as ações aparecem aqui.'));
      this.foot.hidden = true;
      this.quick.hidden = true;
    } else {
      const key = store.get(KEY_API);
      const cfg = el('button', { type: 'button', class: 'link' }, key ? 'configurar' : 'colocar chave');
      cfg.addEventListener('click', () => { this.settings.hidden = !this.settings.hidden; });
      this.statusEl.append(el('span', { class: `dot ${key ? 'ok' : 'warn'}` }), el('span', { class: 'txt' }, key ? `API da Anthropic (${store.get(KEY_MODEL) || DEFAULT_MODEL}). ` : 'Coloque sua chave da API da Anthropic para usar aqui. ', cfg));
      this._apiSettings(!key);
    }
  }

  _apiSettings(open) {
    const s = this.settings;
    const key = el('input', { type: 'password', class: 'inp', placeholder: 'sk-ant-...', value: store.get(KEY_API) || '', autocomplete: 'off' });
    const model = el('input', { type: 'text', class: 'inp', value: store.get(KEY_MODEL) || DEFAULT_MODEL });
    const save = el('button', { type: 'button', class: 'btn primary' }, 'Salvar');
    save.addEventListener('click', () => {
      store.set(KEY_API, key.value.trim());
      store.set(KEY_MODEL, model.value.trim() === DEFAULT_MODEL ? '' : model.value.trim());
      this._renderStatus();
      toast('Configuração do assistente salva neste navegador.', 'ok');
    });
    s.append(
      el('label', {}, 'Chave da API', key),
      el('label', {}, 'Modelo', model),
      el('p', { class: 'hint' }, 'A chave fica só neste navegador e vai direto para a api.anthropic.com. Crie em console.anthropic.com › API Keys. No claude.ai ou pela ponte do Claude Code não precisa de chave.'),
      save,
    );
    s.hidden = !open;
  }

  _bubble(role, text) {
    const b = el('div', { class: `ai-msg ${role}` });
    if (text) b.append(role === 'assistant' ? renderMarkdown(text) : el('p', {}, text));
    this.log.append(b);
    this._scroll();
    return b;
  }

  _setBubble(b, text) {
    clear(b);
    if (b !== this.log.lastChild) this.log.append(b); // a resposta fica abaixo das ações
    b.append(renderMarkdown(text));
    this._scroll();
  }

  _scroll() {
    this.log.scrollTop = this.log.scrollHeight;
  }

  /** Linha de atividade de uma ferramenta; devolve a função que marca o fim. */
  activity(name, input) {
    const label = LABELS[name] || name;
    const detail = input?.items?.length ? ` (${input.items.length})` : input?.kind ? ` (${input.kind})` : input?.what ? ` (${input.what})` : '';
    const row = el('div', { class: 'ai-tool run' }, el('span', { class: 'ai-spin' }), el('span', {}, `${label}${detail}`));
    this.log.append(row);
    this._scroll();
    return (ok, note) => {
      row.classList.remove('run');
      row.classList.add(ok ? 'ok' : 'err');
      row.firstChild.replaceWith(icon(ok ? 'check' : 'x', 12));
      if (note) row.append(el('small', {}, note));
    };
  }

  async runTool(name, input) {
    const done = this.activity(name, input);
    try {
      const r = await this.tools.run(name, input);
      done(true);
      return r;
    } catch (err) {
      done(false, String(err?.message || err).slice(0, 160));
      throw err;
    }
  }

  // ------------------------------------------------------------ enviar
  stop() {
    this.ctl?.abort();
  }

  _setBusy(on) {
    this.busy = on;
    this.sendBtn.textContent = on ? 'Parar' : 'Enviar';
    this.sendBtn.classList.toggle('danger', on);
    this.input.disabled = on;
  }

  async send(raw) {
    const text = String(raw || '').trim();
    if (!text || this.busy) return;
    const ch = this.activeChannel;
    if (ch === 'ponte') return;
    if (ch === 'api' && !store.get(KEY_API)) {
      this.settings.hidden = false;
      toast('Coloque a chave da API primeiro (ou abra o editor no claude.ai).', 'warn');
      return;
    }
    this.toggle(true);
    this.input.value = '';
    this._bubble('user', text);
    const bubble = this._bubble('assistant', '');
    bubble.append(el('p', { class: 'ai-thinking' }, 'Pensando…'));
    this._setBusy(true);
    this.ctl = new AbortController();
    try {
      let shot = null;
      if (this.attachShot) shot = (await this.tools.run('screenshot', { width: 1000 })).image;
      if (ch === 'claude') await this._sendSample(text, bubble, shot);
      else await this._sendApi(text, bubble, shot);
    } catch (err) {
      console.error(err);
      if (bubble.querySelector('.ai-thinking')) clear(bubble);
      const cancelled = this.ctl?.signal.aborted || err?.code === 'cancelled';
      const msg = cancelled ? null : err?.code ? describeError(err.code) : String(err?.message || err);
      if (msg) bubble.append(el('p', { class: 'ai-err' }, msg));
      if (err?.code === 'not_granted' || err?.code === 'sampling_disabled') {
        this.channels.claude = null;
        this._renderHead();
        this._renderStatus();
      }
    } finally {
      this._setBusy(false);
      this.ctl = null;
      if (!bubble.childNodes.length) bubble.remove();
    }
  }

  // ------------------------------------------------------------ canal claude.ai (sample)
  _sampleTools() {
    const max = this.limits?.tools?.maxCount;
    if (!max) return undefined;
    const pick = TOOL_DEFS.filter((d) => d.name !== 'screenshot' && !d.bridgeOnly);
    pick.sort((a, b) => (b.core ? 1 : 0) - (a.core ? 1 : 0));
    const used = [];
    const tools = pick.slice(0, max).map((d) => ({
      name: d.name,
      description: d.description,
      inputSchema: d.input_schema,
      execute: async (input, ctx) => {
        if (ctx?.signal?.aborted) throw new Error('cancelado');
        used.push(d.name);
        const r = await this.runTool(d.name, input);
        return r.text;
      },
    }));
    return { tools, used };
  }

  async _sendSample(text, bubble, shot) {
    const overview = JSON.stringify(this.tools._get_overview()).slice(0, 6000);
    const intro = `${ASSISTANT_RULES}\n\nEstado atual do projeto (JSON):\n${overview}`;
    this.turns.push({ role: 'user', content: shot ? `${text}\n\n(Anexei uma foto da vista 3D atual do editor.)` : text });
    // limite de 64 KiB: tira as mensagens mais antigas
    const size = () => new TextEncoder().encode(intro + this.turns.map((t) => t.content).join('')).length;
    while (this.turns.length > 1 && size() > 56000) this.turns.splice(0, 2);
    if (this.turns[0]?.role !== 'user') this.turns.shift();
    const t = this._sampleTools();
    const opts = {
      signal: this.ctl.signal,
      cache: false,
      onText: ({ text: whole }) => this._setBubble(bubble, whole),
    };
    if (t) { opts.tools = t.tools; delete opts.cache; }
    if (shot && this.limits?.images) opts.images = [await shot.blob()];
    try {
      const r = await this.sample([{ role: 'user', content: intro }, ...this.turns], opts);
      const note = t?.used.length ? `\n\n[ações feitas no editor: ${[...new Set(t.used)].join(', ')}]` : '';
      this.turns.push({ role: 'assistant', content: r.text + note });
      if (r.truncated) bubble.append(el('p', { class: 'hint' }, 'A resposta foi cortada: peça menos de uma vez.'));
    } catch (e) {
      if (e?.text) this._setBubble(bubble, e.text);
      else if (e?.code === 'refused') clear(bubble);
      if (e?.text) this.turns.push({ role: 'assistant', content: e.text });
      if (e?.code === 'cancelled') return;
      throw e;
    }
  }

  // ------------------------------------------------------------ canal API da Anthropic
  async _sendApi(text, bubble, shot) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: store.get(KEY_API), dangerouslyAllowBrowser: true });
    const model = store.get(KEY_MODEL) || DEFAULT_MODEL;
    const tools = TOOL_DEFS.filter((d) => !d.bridgeOnly).map((d) => ({ name: d.name, description: d.description, input_schema: d.input_schema, eager_input_streaming: true }));
    const checkpoint = this.apiMessages.length;
    const content = [{ type: 'text', text }];
    if (shot) content.unshift({ type: 'image', source: { type: 'base64', media_type: shot.mediaType, data: shot.data } });
    this.apiMessages.push({ role: 'user', content });
    let shown = '';
    let jsonRetries = 0;
    const show = () => this._setBubble(bubble, shown || '…');
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const stream = client.beta.messages.stream({
          model,
          max_tokens: 32000,
          thinking: { type: 'adaptive' },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: ASSISTANT_RULES,
          tools,
          messages: this.apiMessages,
        }, { signal: this.ctl.signal });
        const base = shown ? `${shown}\n\n` : '';
        let roundText = '';
        stream.on('text', (delta) => { roundText += delta; shown = base + roundText; show(); });
        let msg;
        try {
          msg = await stream.finalMessage();
          jsonRetries = 0;
        } catch (err) {
          // só a entrada de ferramenta em JSON quebrado é repetida; erros da API sobem
          if (err instanceof Anthropic.APIError || this.ctl.signal.aborted || jsonRetries++ >= 2) throw err;
          shown = base.trimEnd();
          continue;
        }
        if (msg.stop_reason === 'refusal') {
          this.apiMessages.length = checkpoint;
          shown = '';
          this._setBubble(bubble, 'O Claude recusou este pedido. Tente escrever de outro jeito.');
          return;
        }
        const uses = msg.content.filter((b) => b.type === 'tool_use');
        if (msg.stop_reason === 'max_tokens' && uses.length) throw new Error('A resposta passou do limite de tamanho no meio de uma ação. Peça menos de uma vez.');
        this.apiMessages.push({ role: 'assistant', content: msg.content });
        if (msg.stop_reason !== 'tool_use' || !uses.length) {
          if (msg.stop_reason === 'max_tokens') bubble.append(el('p', { class: 'hint' }, 'A resposta foi cortada no limite de tamanho.'));
          return;
        }
        const results = [];
        for (const u of uses) {
          if (this.ctl.signal.aborted) break;
          try {
            const r = await this.runTool(u.name, u.input);
            results.push({
              type: 'tool_result',
              tool_use_id: u.id,
              content: r.image ? [{ type: 'text', text: r.text || 'foto' }, { type: 'image', source: { type: 'base64', media_type: r.image.mediaType, data: r.image.data } }] : r.text,
            });
          } catch (err) {
            const bad = /^Entrada inválida/.test(err?.message || '');
            results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: bad ? JSON.stringify({ INVALID_JSON: JSON.stringify(u.input), erro: err.message }) : String(err?.message || err) });
          }
        }
        if (this.ctl.signal.aborted) throw Object.assign(new Error('cancelado'), { name: 'AbortError' });
        this.apiMessages.push({ role: 'user', content: results });
      }
      bubble.append(el('p', { class: 'hint' }, 'Parei depois de muitas etapas seguidas. Diga "continue" se quiser que eu siga.'));
    } catch (err) {
      // a conversa volta para antes desta mensagem (o que já mudou no editor continua; Ctrl+Z desfaz)
      this.apiMessages.length = checkpoint;
      if (err instanceof Anthropic.APIError && !(err instanceof Anthropic.APIUserAbortError)) {
        const status = err.status;
        const msg = status === 401 ? 'Chave da API inválida.' : status === 429 ? 'Limite de uso da API atingido; espere um pouco.' : status === 529 || status === 503 ? 'A API está sobrecarregada; tente de novo em instantes.' : `Erro da API (${status ?? 'rede'}): ${err.message}`;
        throw new Error(msg);
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------- ponte com o Claude Code
// Quando o editor é aberto pelo tools/mcp.mjs (http://127.0.0.1:8777), a página busca os pedidos
// do Claude Code, executa aqui e devolve o resultado.
class BridgeClient {
  constructor(assistant) {
    this.a = assistant;
    this.on = false;
  }

  async start() {
    const local = ['127.0.0.1', 'localhost'].includes(location.hostname) && location.protocol.startsWith('http');
    if (!local) return false;
    try {
      const r = await fetch('/ponte/hello', { cache: 'no-store' });
      if (!r.ok) return false;
      this.info = await r.json();
      if (!this.info?.ponte) return false;
    } catch {
      return false;
    }
    this.on = true;
    this._loop();
    return true;
  }

  async _loop() {
    let fails = 0;
    while (this.on) {
      let job;
      try {
        const r = await fetch('/ponte/next', { cache: 'no-store' });
        if (r.status === 204) { fails = 0; continue; }
        if (!r.ok) throw new Error(String(r.status));
        job = await r.json();
        fails = 0;
      } catch {
        fails++;
        await new Promise((res) => setTimeout(res, Math.min(10000, 1000 * fails)));
        continue;
      }
      const reply = { id: job.id, ok: true };
      try {
        const r = TOOL_MAP.has(job.name) ? await this.a.runTool(job.name, job.input) : { text: JSON.stringify({ erro: 'ferramenta desconhecida' }) };
        reply.text = r.text;
        if (r.image) reply.image = { mediaType: r.image.mediaType, data: r.image.data };
      } catch (err) {
        reply.ok = false;
        reply.text = String(err?.message || err);
      }
      try {
        await fetch('/ponte/result', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(reply) });
      } catch { /* a ponte caiu: o Claude Code recebe tempo esgotado */ }
    }
  }
}
