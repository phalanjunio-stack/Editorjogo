// Exportação para Unreal Engine 5: heightmap 16 bits, camadas de pintura, malhas GLB,
// cena.json com todos os objetos e o script Python que monta a fase.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { encodeGrayPNG } from '../core/png.js';
import { base64ToBytes, slug, editorToL2, degToHeading } from '../core/util.js';
import { buildPrefab, PREFAB_MAP } from '../city/prefabs.js';
import { ClothSim } from '../cloth/cloth.js';
import { defaultClothPreset } from '../core/state.js';
import { toUELocation, toUERotator, toUEScale, landscapeParams } from './coords.js';
import importScript from '../../ue5/importar_cena.py';

function cleanGeometry(geo, matrix) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(matrix);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.getAttribute('position'));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  out.setAttribute('normal', g.getAttribute('normal'));
  const uv = g.getAttribute('uv');
  out.setAttribute('uv', uv || new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  return out;
}

// Junta todas as partes de uma peça em uma única malha (um material por slot).
export function prefabMesh(id, color) {
  const g = buildPrefab(id, color, 1);
  g.updateMatrixWorld(true);
  const byMat = new Map();
  const push = (mat, geo) => {
    const key = mat.uuid;
    if (!byMat.has(key)) byMat.set(key, { mat, list: [] });
    byMat.get(key).list.push(geo);
  };
  g.traverse((o) => {
    if (o.isMesh) push(o.material, cleanGeometry(o.geometry, o.matrixWorld));
  });
  if (g.userData.cloth) {
    const info = g.userData.cloth;
    const anchor = g.getObjectByName('ancora_tecido');
    const sim = new ClothSim({ ...defaultClothPreset(), type: 'bandeira', width: info.width, length: info.length, cols: 14, rows: 10 });
    const rest = sim.restGeometry();
    rest.deleteAttribute('color');
    const flagMat = new THREE.MeshStandardMaterial({ color: info.color, side: THREE.DoubleSide, name: 'Bandeira' });
    push(flagMat, cleanGeometry(rest, anchor.matrixWorld));
    sim.dispose();
  }
  const geos = [], mats = [];
  for (const { mat, list } of byMat.values()) {
    geos.push(mergeGeometries(list, false));
    mats.push(mat);
  }
  const merged = mergeGeometries(geos, true);
  const mesh = new THREE.Mesh(merged, mats);
  mesh.name = `SM_${id}`;
  return mesh;
}

export async function exportGLB(object) {
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(object, { binary: true, onlyVisible: false });
  return new Uint8Array(result);
}

export async function heightmapFiles(terrain) {
  const res = terrain.res;
  const lp = landscapeParams(terrain.minH, terrain.maxH, terrain.size, res);
  const px = new Uint16Array(res * res);
  for (let i = 0; i < px.length; i++) px[i] = lp.toValue(terrain.heights[i]);
  const png = await encodeGrayPNG(res, res, px, 16);
  const raw = new Uint8Array(res * res * 2);
  for (let i = 0; i < px.length; i++) { raw[i * 2] = px[i] & 255; raw[i * 2 + 1] = px[i] >> 8; }
  return { png, raw, params: lp };
}

export async function weightmapFiles(terrain, layerNames) {
  const res = terrain.res;
  const out = [];
  for (let l = 0; l < layerNames.length; l++) {
    const px = new Uint8Array(res * res);
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const x = -terrain.half + i * terrain.cell, z = -terrain.half + j * terrain.cell;
        px[j * res + i] = Math.round(terrain.layerWeightAt(l, x, z) * 255);
      }
    }
    out.push({ name: layerNames[l], png: await encodeGrayPNG(res, res, px, 8) });
  }
  return out;
}

function sunInfo(sky) {
  const dayPhase = (sky.time - 6) / 12;
  const elev = Math.sin(dayPhase * Math.PI) * 68;
  const az = sky.sunAzimuth + (dayPhase - 0.5) * 150;
  return { elevacao: Math.round(elev * 10) / 10, azimute: Math.round(az * 10) / 10 };
}

export function readmeUE5(project, lp, res, layerNames, minH, maxH) {
  const t = project.terrain;
  const sun = sunInfo(project.sky);
  return `EXPORTAÇÃO PARA UNREAL ENGINE 5 — ${project.name}
Gerado pelo EditorJogo.

1) TERRENO (Landscape)
   - Abra o modo Landscape (Shift+2) > Manage > New > "Import from File".
   - Heightmap File: landscape/heightmap_${res}.png  (16 bits; também tem .r16)
   - Scale X = ${lp.xyScale}   Scale Y = ${lp.xyScale}   Scale Z = ${lp.zScale}
   - Location = 0, 0, 0
   - Section Size: 63x63 Quads | Sections Per Component: 1x1 | Number of Components: ${lp.components ? `${lp.components} x ${lp.components}` : '(o UE sugere automaticamente)'}
     (Resolução ${res} x ${res}. O UE preenche sozinho ao escolher o arquivo; só confira.)
   - Tamanho real: ${t.size} m x ${t.size} m. Altura mínima ${minH.toFixed(1)} m, máxima ${maxH.toFixed(1)} m.

2) CAMADAS DE TEXTURA (pintura)
   - Crie um Landscape Material com um "Landscape Layer Blend" com as camadas:
     ${layerNames.join(', ')}
   - Na importação (ou em Paint > Layers > Import), use para cada camada:
${layerNames.map((n) => `       ${n}: landscape/camada_${slug(n)}.png`).join('\n')}

3) OBJETOS, NPCs E ZONAS
   - Ative o plugin "Python Editor Script Plugin" (Edit > Plugins) e reinicie.
   - Tools > Execute Python Script... > importar_cena.py
   - As peças vão para /Game/EditorJogo/Meshes e os atores para a pasta "EditorJogo" do Outliner.
   - Se as peças aparecerem giradas 90°, edite ROT_YAW_EXTRA no começo do script.

4) CÉU, NUVENS E NÉVOA (equivalentes no UE5)
   - Directional Light (Atmosphere Sun Light ligado): Pitch = -${sun.elevacao}°, Yaw = ${sun.azimute}°
   - Sky Atmosphere + Volumetric Cloud (cobertura no editor: ${Math.round(project.sky.cloudCoverage * 100)}%)
   - Exponential Height Fog (densidade no editor: ${project.sky.fog})
   - Sky Light com "Real Time Capture" ligado.

5) GRAMA QUE MEXE COM O VENTO
   - Crie um "Landscape Grass Type" com uma malha de tufo de grama e ligue à camada "${layerNames[0]}"
     no material do Landscape (nó "Landscape Grass Output").
   - No material da grama use o nó "SimpleGrassWind" em World Position Offset
     (força do vento no editor: ${project.sky.windStrength}, direção ${project.sky.windDir}°).

6) CAPAS E ROUPAS (Chaos Cloth)
   - A pasta capas/ tem a malha da capa (GLB) em pose de repouso. A cor de vértice VERMELHA marca
     os vértices presos (ombros/cintura).
   - No UE5: junte a capa à Skeletal Mesh do personagem (ou importe já skinada pelo Blender),
     abra a Skeletal Mesh > Clothing > "Create Clothing Data from Section", pinte "Max Distance"
     = 0 nos vértices presos e deixe o resto livre. Use os valores de capa_*.json como ponto de partida:
     stiffness -> Edge/Bending Stiffness, damping -> Damping Coefficient, mass -> Density,
     vento -> Drag/Lift + Wind Directional Source na fase.

7) SERVIDOR
   - As posições de NPC em cena.json também trazem as coordenadas L2 (campo "l2"), iguais às do
     pacote do servidor. Assim o cliente UE5 e o servidor usam o mesmo mapa.
`;
}

/**
 * Monta todos os arquivos para o UE5.
 * @returns {Promise<Array<{path:string, data:Uint8Array|string}>>}
 */
export async function buildUE5Files(app) {
  const project = app.project;
  const terrain = app.terrain;
  const files = [];
  const res = terrain.res;
  const layerNames = project.terrain.layers.map((l, i) => l.name || `Camada${i + 1}`);

  const hm = await heightmapFiles(terrain);
  files.push({ path: `landscape/heightmap_${res}.png`, data: hm.png });
  files.push({ path: `landscape/heightmap_${res}.r16`, data: hm.raw });
  for (const w of await weightmapFiles(terrain, layerNames)) files.push({ path: `landscape/camada_${slug(w.name)}.png`, data: w.png });

  // malhas usadas
  const malhas = {};
  const prefabKeys = new Map();
  const meshKeyOf = new Map(); // uid do objeto -> nome da malha exportada
  for (const o of project.objects) {
    if (o.kind === 'prefab') {
      const def = PREFAB_MAP.get(o.ref);
      const colorKey = (o.color || def?.color || 'padrao').replace('#', '');
      const key = def?.color ? `${o.ref}_${colorKey}` : o.ref;
      if (!prefabKeys.has(key)) prefabKeys.set(key, { ref: o.ref, color: o.color });
      meshKeyOf.set(o.uid, key);
    } else {
      const m = project.customMeshes.find((c) => c.id === o.ref);
      if (m) meshKeyOf.set(o.uid, `custom_${slug(m.name)}`);
    }
  }
  const usedKeys = new Set(meshKeyOf.values());
  for (const [key, info] of prefabKeys) {
    const mesh = prefabMesh(info.ref, info.color);
    mesh.name = `SM_${key}`;
    files.push({ path: `meshes/${key}.glb`, data: await exportGLB(mesh) });
    mesh.geometry.dispose();
    malhas[key] = `meshes/${key}.glb`;
  }
  for (const m of project.customMeshes) {
    const key = `custom_${slug(m.name)}`;
    if (!usedKeys.has(key)) continue;
    if (m.format === 'glb') {
      files.push({ path: `meshes/${key}.glb`, data: base64ToBytes(m.data) });
      malhas[key] = `meshes/${key}.glb`;
    } else {
      // converte FBX/OBJ para GLB com a escala já aplicada
      const tpl = app.city.meshTemplates.get(m.id);
      if (tpl) {
        files.push({ path: `meshes/${key}.glb`, data: await exportGLB(tpl) });
        malhas[key] = `meshes/${key}.glb`;
      }
    }
  }

  const s = project.server;
  const cena = {
    formato: 'editorjogo-ue5',
    versao: 1,
    projeto: project.name,
    unidade: 'cm',
    eixos: 'X do UE = leste, Y do UE = sul, Z do UE = cima',
    landscape: {
      heightmap: `landscape/heightmap_${res}.png`,
      resolucao: res,
      escalaXY: hm.params.xyScale,
      escalaZ: hm.params.zScale,
      tamanhoMetros: terrain.size,
      camadas: layerNames.map((n) => ({ nome: n, arquivo: `landscape/camada_${slug(n)}.png` })),
    },
    malhas,
    objetos: project.objects
      .filter((o) => malhas[meshKeyOf.get(o.uid)])
      .map((o) => ({ nome: o.name, malha: meshKeyOf.get(o.uid), local: toUELocation(o.pos), rot: toUERotator(o.rot), escala: toUEScale(o.scale) })),
    npcs: project.npcs.map((n) => ({
      nome: n.name,
      titulo: n.title,
      npcId: n.npcId,
      tipo: n.type,
      local: toUELocation(n.pos),
      yaw: Math.round(n.heading * 100) / 100,
      l2: { ...editorToL2({ x: n.pos[0], y: n.pos[1], z: n.pos[2] }, s), heading: degToHeading(n.heading) },
      html: n.html,
      multisell: n.multisell,
    })),
    zonas: project.zones.map((z) => ({
      nome: z.name,
      tipo: z.type,
      pontos: z.points.map((p) => toUELocation([p[0], terrain.heightAt(p[0], p[1]), p[1]])),
    })),
  };
  files.push({ path: 'cena.json', data: JSON.stringify(cena, null, 2) });
  files.push({ path: 'importar_cena.py', data: importScript });

  // capa atual do laboratório
  if (app.capeLab) {
    const cape = await app.capeLab.exportFiles();
    for (const f of cape) files.push({ path: `capas/${f.path}`, data: f.data });
  }

  files.push({ path: 'LEIA-ME_UE5.txt', data: readmeUE5(project, hm.params, res, layerNames, terrain.minH, terrain.maxH) });
  return files;
}
