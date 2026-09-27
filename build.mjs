// Gera dist/EditorJogo.html: um único arquivo com tudo dentro (abre com duplo clique, sem internet).
//   node build.mjs          -> build
//   node build.mjs --serve  -> build + recompila ao salvar + servidor em http://localhost:8080
import * as esbuild from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const serve = process.argv.includes('--serve');
const OUT = 'dist/EditorJogo.html';

const inlineHtml = {
  name: 'inline-html',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length) return;
      const files = result.outputFiles || [];
      const js = files.find((f) => f.path.endsWith('.js'))?.text || '';
      const css = files.find((f) => f.path.endsWith('.css'))?.text || '';
      const tpl = await readFile('src/index.html', 'utf8');
      const html = tpl
        .split('/*__CSS__*/').join(css.replace(/<\/style/gi, '<\\/style'))
        .split('/*__JS__*/').join(js.replace(/<\/script/gi, '<\\/script'));
      await mkdir('dist', { recursive: true });
      await writeFile(OUT, html);
      console.log(`✔ ${OUT} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
    });
  },
};

// Gerador de árvores (ez-tree): usa o código-fonte do pacote, mas sem as texturas originais
// (quase 3 MB); as árvores usam as versões menores de assets/textures/tree.
const ezTree = {
  name: 'ez-tree',
  setup(build) {
    build.onResolve({ filter: /^ez-tree$/ }, () => ({ path: path.resolve('node_modules/@dgreenheck/ez-tree/src/lib/index.js') }));
    build.onResolve({ filter: /^\.\/textures(\.js)?$/ }, (a) => (a.importer.includes(`${path.sep}ez-tree${path.sep}`) ? { path: path.resolve('src/nature/ezTreeTextures.js') } : undefined));
  },
};

const options = {
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: ['es2022'],
  minify: !serve,
  sourcemap: false,
  write: false,
  outdir: 'dist/tmp',
  loader: { '.py': 'text', '.webp': 'dataurl' },
  external: ['node:zlib'],
  legalComments: 'none',
  logLevel: 'warning',
  plugins: [ezTree, inlineHtml],
};

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'dist', port: 8080 });
  console.log(`Abrindo em http://localhost:${port}/EditorJogo.html (Ctrl+C para parar)`);
} else {
  await esbuild.build(options);
}
