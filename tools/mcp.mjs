#!/usr/bin/env node
// Ponte MCP: deixa o Claude Code (ou o Claude Desktop) controlar o EditorJogo aberto no navegador.
//
//   claude mcp add editorjogo -- node "C:\caminho\Editorjogo\tools\mcp.mjs"
//
// Ela serve o editor em http://127.0.0.1:8777 (o arquivo dist/EditorJogo.html, ou outro com --html),
// e cada ferramenta que o Claude chama vira um pedido que a página executa e responde.
// Também lê arquivos do seu computador (import_files) para importar malhas, texturas e personagens.
// Sem dependências: só o Node 18+.
import http from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_DEFS } from '../src/ai/toolDefs.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const PORT = Number(opt('port', process.env.EDITORJOGO_PORT || 8777));
const HTML = path.resolve(opt('html', process.env.EDITORJOGO_HTML || path.join(here, '..', 'dist', 'EditorJogo.html')));
const URL_EDITOR = `http://127.0.0.1:${PORT}/`;
const log = (...a) => process.stderr.write(`[editorjogo] ${a.join(' ')}\n`);

// ---------------------------------------------------------------- fila de pedidos para a página
const queue = [];
const waiting = new Map(); // id -> {resolve, timer}
let pollers = [];
let lastSeen = 0;
let nextId = 1;

function pageConnected() {
  return pollers.length > 0 || Date.now() - lastSeen < 8000;
}

function dispatch() {
  while (queue.length && pollers.length) {
    const job = queue.shift();
    const res = pollers.shift();
    clearTimeout(res.timer);
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(job));
  }
}

function askPage(name, input, timeoutMs = 180000) {
  return new Promise((resolve) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      waiting.delete(id);
      resolve({ ok: false, text: 'O editor não respondeu a tempo. Ele está aberto no navegador em ' + URL_EDITOR + '?' });
    }, timeoutMs);
    waiting.set(id, { resolve, timer });
    queue.push({ id, name, input });
    dispatch();
  });
}

// ---------------------------------------------------------------- servidor HTTP (editor + ponte)
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, URL_EDITOR);
  // só aceita a própria página (evita que outros sites mandem comandos)
  const origin = req.headers.origin;
  const hosts = [`127.0.0.1:${PORT}`, `localhost:${PORT}`];
  if (!hosts.includes(req.headers.host) || (origin && !hosts.map((h) => `http://${h}`).includes(origin))) {
    res.writeHead(403).end();
    return;
  }
  try {
    if (url.pathname === '/' || url.pathname === '/EditorJogo.html') {
      const html = await readFile(HTML);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(html);
    } else if (url.pathname === '/ponte/hello') {
      lastSeen = Date.now();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ponte: true, versao: 1 }));
    } else if (url.pathname === '/ponte/next') {
      lastSeen = Date.now();
      res.timer = setTimeout(() => {
        pollers = pollers.filter((r) => r !== res);
        res.writeHead(204).end();
      }, 25000);
      req.on('close', () => { clearTimeout(res.timer); pollers = pollers.filter((r) => r !== res); });
      pollers.push(res);
      dispatch();
    } else if (url.pathname === '/ponte/result' && req.method === 'POST') {
      lastSeen = Date.now();
      let body = '';
      for await (const chunk of req) body += chunk;
      const msg = JSON.parse(body);
      const w = waiting.get(msg.id);
      if (w) { clearTimeout(w.timer); waiting.delete(msg.id); w.resolve(msg); }
      res.writeHead(204).end();
    } else {
      res.writeHead(404).end();
    }
  } catch (err) {
    log('erro http:', err.message);
    if (!res.headersSent) res.writeHead(500).end(String(err.message));
  }
});

server.on('error', (err) => log(err.code === 'EADDRINUSE' ? `a porta ${PORT} já está em uso (outro editor aberto?). Use --port.` : err.message));
server.listen(PORT, '127.0.0.1', () => log(`editor em ${URL_EDITOR} (arquivo ${HTML})`));

function openBrowser() {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', URL_EDITOR]] : process.platform === 'darwin' ? ['open', [URL_EDITOR]] : ['xdg-open', [URL_EDITOR]];
  try {
    spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- arquivos do computador
const IMPORTABLE = /\.(glb|gltf|fbx|obj|mtl|bin|psk|psa|png|jpe?g|webp|tga|bmp|zip)$/i;

async function collectFiles(paths, max = 400 * 1024 * 1024) {
  const out = [];
  let total = 0;
  const visit = async (p, rel) => {
    const st = await stat(p);
    if (st.isDirectory()) {
      for (const name of await readdir(p)) await visit(path.join(p, name), rel ? `${rel}/${name}` : name);
      return;
    }
    if (!IMPORTABLE.test(p)) return;
    total += st.size;
    if (total > max) throw new Error('Arquivos grandes demais (mais de 400 MB de uma vez).');
    out.push({ name: rel || path.basename(p), data: (await readFile(p)).toString('base64') });
  };
  for (const p of paths) {
    const abs = path.resolve(p);
    const st = await stat(abs);
    await visit(abs, st.isDirectory() ? path.basename(abs) : '');
  }
  return out;
}

const EXTRA_TOOLS = [
  {
    name: 'open_editor',
    description: 'Abre o EditorJogo no navegador padrão (http://127.0.0.1:' + PORT + ') e espera ele conectar. Chame antes das outras ferramentas se o editor não estiver aberto.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'import_files',
    description: 'Importa arquivos ou pastas do computador para o editor. kind: auto (decide pela extensão), mesh (malha de cenário com suas texturas: GLB/GLTF/FBX/OBJ+MTL e imagens da mesma pasta), material (texturas PBR: cada pasta ou grupo de nomes vira um material), character (personagem GLB/FBX/PSK, com animações PSA), animations (pacote de animações). Caminhos absolutos.',
    inputSchema: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' }, description: 'Arquivos ou pastas' },
        kind: { type: 'string', enum: ['auto', 'mesh', 'material', 'character', 'animations'] },
        name: { type: 'string', description: 'Nome (opcional)' },
        category: { type: 'string', description: 'Categoria do material: tijolo, madeira, pedra, telhado, reboco, metal, decalque, chao, outro' },
      },
      required: ['paths'],
    },
  },
];

const TOOLS = [
  ...EXTRA_TOOLS,
  ...TOOL_DEFS.filter((d) => !d.bridgeOnly).map((d) => ({ name: d.name, description: d.description, inputSchema: d.input_schema })),
];

async function callTool(name, input) {
  if (name === 'open_editor') {
    if (!pageConnected()) openBrowser();
    for (let i = 0; i < 60 && !pageConnected(); i++) await new Promise((r) => setTimeout(r, 500));
    return pageConnected()
      ? { content: [{ type: 'text', text: `Editor conectado em ${URL_EDITOR}.` }] }
      : { content: [{ type: 'text', text: `Não consegui abrir sozinho. Peça ao usuário para abrir ${URL_EDITOR} no Chrome ou Edge.` }], isError: true };
  }
  if (!pageConnected()) {
    return { content: [{ type: 'text', text: `O editor não está aberto. Chame open_editor ou peça ao usuário para abrir ${URL_EDITOR}.` }], isError: true };
  }
  let pageInput = input;
  if (name === 'import_files') {
    try {
      pageInput = { files: await collectFiles(input.paths || []), kind: input.kind || 'auto', name: input.name, category: input.category };
    } catch (err) {
      return { content: [{ type: 'text', text: `Não consegui ler os arquivos: ${err.message}` }], isError: true };
    }
    if (!pageInput.files.length) return { content: [{ type: 'text', text: 'Nenhum arquivo importável nesses caminhos.' }], isError: true };
  }
  const r = await askPage(name, pageInput);
  const content = [{ type: 'text', text: r.text || (r.ok ? 'ok' : 'erro') }];
  if (r.image) content.push({ type: 'image', data: r.image.data, mimeType: r.image.mediaType });
  return { content, isError: !r.ok };
}

// ---------------------------------------------------------------- MCP (JSON-RPC por stdin/stdout)
const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return; // notificação
  try {
    let result;
    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: params?.protocolVersion || '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'editorjogo', version: '1.0.0' },
          instructions: `Controla o EditorJogo (editor de mundo de MMORPG estilo Lineage 2) aberto em ${URL_EDITOR}. Comece com open_editor e get_overview. Tudo que muda pode ser desfeito com Ctrl+Z no editor. Responda o usuário em português.`,
        };
        break;
      case 'ping':
        result = {};
        break;
      case 'tools/list':
        result = { tools: TOOLS };
        break;
      case 'tools/call':
        result = await callTool(params.name, params.arguments || {});
        break;
      default:
        send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Método desconhecido: ${method}` } });
        return;
    }
    send({ jsonrpc: '2.0', id, result });
  } catch (err) {
    send({ jsonrpc: '2.0', id, error: { code: -32603, message: err.message } });
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try {
      handle(JSON.parse(line));
    } catch (err) {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } });
    }
  }
});
process.stdin.on('end', () => process.exit(0));
