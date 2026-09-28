// Ferramentas que o assistente Claude usa para mexer no editor. Só as descrições e os esquemas
// (sem three.js nem DOM): o chat do editor e a ponte MCP (tools/mcp.mjs, no Node) leem daqui.
// Unidades: metros, Y para cima; o terreno fica centrado na origem (x e z de -tamanho/2 a +tamanho/2).

const num = (description, extra = {}) => ({ type: 'number', description, ...extra });
const int = (description, extra = {}) => ({ type: 'integer', description, ...extra });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const bool = (description) => ({ type: 'boolean', description });
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

export const NPC_TYPE_IDS = ['Merchant', 'Teleporter', 'Warehouse', 'Buffer', 'Guard', 'Folk', 'Monster'];
export const ZONE_TYPE_IDS = ['PeaceZone', 'TownZone', 'ArenaZone', 'NoLandingZone', 'SwampZone'];
export const PREFAB_IDS = ['casa', 'taverna', 'templo', 'torre', 'muralha', 'portao', 'fonte', 'poste', 'barraca', 'estatua', 'bandeira', 'teleporte', 'poco', 'caixote', 'barril', 'ponte', 'arvore', 'pinheiro', 'arbusto', 'pedra'];
export const SCULPT_TOOLS = ['elevar', 'abaixar', 'suavizar', 'nivelar', 'ruido', 'erosao', 'caminho'];
export const LAYER_NAMES = ['Grama', 'Terra', 'Rocha', 'Neve', 'Areia', 'Lama', 'Pedra', 'Caminho'];

const point = { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: '[x, z] em metros' };

/**
 * Cada ferramenta: name, description, input_schema, e
 *   mutates: muda o projeto (o chat mostra e dá para desfazer com Ctrl+Z)
 *   core: entra mesmo quando o canal limita o número de ferramentas
 */
export const TOOL_DEFS = [
  // ------------------------------------------------------------ leitura e análise
  {
    name: 'get_overview',
    core: true,
    description: 'Resumo do projeto aberto: nome, terreno (tamanho, alturas, água), céu, grama, quantidades de objetos/NPCs/zonas/lojas/páginas/personagens, aba atual e seleção. Use primeiro para se situar.',
    input_schema: obj({}),
  },
  {
    name: 'analyze_world',
    core: true,
    description: 'Analisa o mundo e devolve problemas e sugestões: papéis de NPC que faltam numa cidade (gatekeeper, armazém, mercador...), NPC sem página ou loja, loja vazia, monstros em zona de paz, cidade sem zona de paz, objetos fora do terreno ou debaixo da água, terreno sem pintura, NPCs sem personagem 3D e os avisos da exportação do servidor.',
    input_schema: obj({}),
  },
  {
    name: 'program_info',
    core: true,
    description: 'O que o editor já faz (abas e ferramentas) e o que ainda NÃO faz (limitações conhecidas). Use para responder o que falta no programa.',
    input_schema: obj({}),
  },
  {
    name: 'list_things',
    core: true,
    description: 'Lista os itens de uma coleção com uid, nome e posição. what: objects, npcs, zones, shops, pages, characters, prefabs, meshes, materials, structures. Filtro opcional por texto e limite.',
    input_schema: obj({
      what: str('Coleção', { enum: ['objects', 'npcs', 'zones', 'shops', 'pages', 'characters', 'prefabs', 'meshes', 'materials', 'structures'] }),
      filter: str('Texto para filtrar pelo nome/tipo (opcional)'),
      limit: int('Máximo de itens (padrão 60)'),
    }, ['what']),
  },
  {
    name: 'get_item',
    description: 'Todos os dados de um objeto, NPC, zona, loja (pelo uid ou listId), página (pelo caminho) ou personagem (pelo id).',
    input_schema: obj({ id: str('uid, listId da loja, caminho da página ou id do personagem') }, ['id']),
  },
  {
    name: 'terrain_info',
    description: 'Amostra o terreno numa grade: altura, inclinação (graus) e camada de pintura dominante em cada ponto. Use para achar lugares planos para construir ou ver onde há água.',
    input_schema: obj({
      center: point,
      size: num('Largura da área em metros (padrão: terreno inteiro)'),
      grid: int('Pontos por lado (3 a 12, padrão 7)'),
    }),
  },
  {
    name: 'screenshot',
    description: 'Tira uma foto da vista 3D atual (ou de uma câmera posicionada antes com set_camera) para você ver o mundo.',
    input_schema: obj({ width: int('Largura da imagem em pixels (padrão 900, máximo 1400)') }),
  },
  {
    name: 'set_camera',
    description: 'Posiciona a câmera do editor olhando para um ponto. distance em metros, pitch em graus (0 horizontal, 90 de cima), yaw em graus.',
    input_schema: obj({ target: point, distance: num('Distância'), pitch: num('Inclinação em graus'), yaw: num('Giro em graus') }, ['target']),
  },
  // ------------------------------------------------------------ mundo e terreno
  {
    name: 'set_sky',
    description: 'Muda céu e clima: time (0-24 h), sunAzimuth, cloudCoverage (0-1), cloudDensity (0-1), fog (0-3), windDir (graus), windStrength (0-2), exposure. Também waterEnabled e waterLevel (m).',
    input_schema: obj({
      time: num('Hora do dia 0-24'), sunAzimuth: num('Direção do sol'), cloudCoverage: num('0-1'), cloudDensity: num('0-1'),
      fog: num('0-3'), windDir: num('graus'), windStrength: num('0-2'), exposure: num('0.2-1.5'),
      waterEnabled: bool('Mostrar água'), waterLevel: num('Altura da água em metros'),
    }),
  },
  {
    name: 'terrain_generate',
    mutates: true,
    description: 'Gera o terreno inteiro de novo (apaga o relevo atual; dá para desfazer). kind: montanhas, vale, colinas, ilha, plano. plateau = raio em metros de uma área plana no meio para a cidade. Pinta automaticamente depois.',
    input_schema: obj({
      kind: str('Tipo', { enum: ['montanhas', 'vale', 'colinas', 'ilha', 'plano'] }),
      height: num('Altura máxima (padrão 80)'), scale: num('Escala das formas em metros (padrão 200)'),
      roughness: num('0-1 (padrão 0.5)'), plateau: num('Raio da área plana (0 = sem)'), plateauHeight: num('Altura da área plana'),
      seed: int('Semente (aleatória se omitida)'),
    }, ['kind']),
  },
  {
    name: 'terrain_sculpt',
    mutates: true,
    description: 'Passa um pincel de relevo numa lista de pontos (como arrastar o mouse). tool: elevar, abaixar, suavizar, nivelar (iguala à altura do primeiro ponto), ruido, erosao, caminho (aplaina e pinta trilha). strength 0-1, passes = quantas vezes repete.',
    input_schema: obj({
      tool: str('Pincel', { enum: SCULPT_TOOLS }),
      points: { type: 'array', items: point, minItems: 1, maxItems: 200, description: 'Pontos [x,z] do traço' },
      radius: num('Raio do pincel em metros (padrão 12)'), strength: num('0-1 (padrão 0.5)'), passes: int('Repetições (padrão 3)'),
    }, ['tool', 'points']),
  },
  {
    name: 'terrain_paint',
    mutates: true,
    description: 'Pinta uma camada do terreno ao longo de pontos. layer: 0 Grama, 1 Terra, 2 Rocha, 3 Neve, 4 Areia, 5 Lama, 6 Pedra, 7 Caminho.',
    input_schema: obj({
      layer: int('Camada 0-7'),
      points: { type: 'array', items: point, minItems: 1, maxItems: 200 },
      radius: num('Raio em metros (padrão 8)'), strength: num('0-1 (padrão 0.8)'),
    }, ['layer', 'points']),
  },
  {
    name: 'terrain_auto_paint',
    mutates: true,
    description: 'Pinta o terreno todo automaticamente: rocha nas encostas, neve no alto, areia na beira da água, lama nas baixadas e grama no resto.',
    input_schema: obj({ rockSlope: num('Inclinação da rocha em graus (padrão 36)'), snowHeight: num('Altura da neve em metros (padrão 85)') }),
  },
  {
    name: 'set_grass',
    description: 'Configura a grama: preset (curta, alta, flor, campo, floresta, seco, pasto, trigo, juncos, trevo, alpina, outono, lavanda, pantano, capim_dourado), enabled, count (densidade), radius (distância), height, flowers (0-0.5), heads (espigas 0-1), colorBase, colorTip, layers (camadas do terreno onde nasce, 0-7).',
    input_schema: obj({
      preset: str('Tipo de folhagem'), enabled: bool('Ligar/desligar'), count: int('Quantidade de folhas'), radius: num('Distância de render'),
      height: num('Altura'), flowers: num('Flores 0-0.5'), heads: num('Espigas 0-1'), colorBase: str('#rrggbb'), colorTip: str('#rrggbb'),
      layers: { type: 'array', items: { type: 'integer' }, description: 'Camadas onde a grama nasce (0 Grama, 1 Terra, 5 Lama...)' },
    }),
  },
  // ------------------------------------------------------------ objetos
  {
    name: 'place_objects',
    mutates: true,
    core: true,
    description: 'Coloca peças no mapa (no chão automaticamente). ref = id da peça (casa, taverna, templo, torre, muralha, portao, fonte, poste, barraca, estatua, bandeira, teleporte, poco, caixote, barril, ponte, arvore, pinheiro, arbusto, pedra), "mesh:<id>" para malha importada ou "struct:<id>" para construção do Construtor. yaw em graus.',
    input_schema: obj({
      items: {
        type: 'array', minItems: 1, maxItems: 80,
        items: obj({ ref: str('Peça'), x: num('x'), z: num('z'), yaw: num('Giro em graus'), scale: num('Escala (padrão 1)'), y: num('Altura fixa (opcional; padrão = chão)') }, ['ref', 'x', 'z']),
      },
    }, ['items']),
  },
  {
    name: 'edit_objects',
    mutates: true,
    description: 'Move, gira, escala, renomeia ou apaga objetos pelo uid. delete=true apaga.',
    input_schema: obj({
      items: {
        type: 'array', minItems: 1, maxItems: 80,
        items: obj({ uid: str('uid do objeto'), x: num('x'), z: num('z'), y: num('y'), yaw: num('graus'), scale: num('escala'), name: str('nome'), color: str('#rrggbb'), delete: bool('apagar') }, ['uid']),
      },
    }, ['items']),
  },
  {
    name: 'scatter_nature',
    mutates: true,
    description: 'Espalha natureza numa área circular evitando encostas fortes e água: refs (ex.: ["arvore","pinheiro","arbusto","pedra"]), count, spacing mínimo.',
    input_schema: obj({
      center: point, radius: num('Raio em metros'), count: int('Quantidade (máx 300)'),
      refs: { type: 'array', items: { type: 'string' }, description: 'Peças a espalhar' },
      spacing: num('Distância mínima entre peças (padrão 4)'), maxSlope: num('Inclinação máxima em graus (padrão 32)'),
      scaleMin: num('padrão 0.8'), scaleMax: num('padrão 1.3'),
    }, ['center', 'radius', 'count']),
  },
  {
    name: 'build_wall',
    mutates: true,
    description: 'Muralha automática ligando os pontos (peças de 8 m), com torres nos cantos se towers=true. closed fecha o contorno.',
    input_schema: obj({ points: { type: 'array', items: point, minItems: 2, maxItems: 40 }, closed: bool('Fechar o contorno'), towers: bool('Torres nos cantos') }, ['points']),
  },
  // ------------------------------------------------------------ Construtor
  {
    name: 'build_structure',
    mutates: true,
    core: true,
    description: 'Constrói pelo Construtor marcando pontos no chão (como o usuário faz clicando). type: casa (cantos; o 1º lado é a frente com a porta; 2 pontos = retângulo com params.width de fundo), castelo (cantos da muralha), muros (linha), torre (centro [e um ponto na borda para o raio]), portao (2 pontos), telhado (cantos, alpendre sobre pilares), ponte (2 margens). preset A (simples), B (rebocada), C (nobre). slots: material por parte (ids de list_things materials). Devolve o id da construção e o uid do objeto.',
    input_schema: obj({
      type: str('Tipo', { enum: ['casa', 'castelo', 'muros', 'torre', 'portao', 'telhado', 'ponte'] }),
      points: { type: 'array', items: point, minItems: 1, maxItems: 24, description: 'Pontos [x, z] no mundo' },
      preset: str('Acabamento', { enum: ['A', 'B', 'C'] }),
      name: str('Nome'),
      params: { type: 'object', description: 'floors, floorH, thick, width, height, roofType (duas|quatro|plano|ameias|cone), roofPitch, overhang, timber (nenhum|superior|todos), groundStone, postSpacing, windows, windowSpacing, door, shutters, chimney, crenels, towers, towerRadius, keep, closed, sides, arches, bridgeStyle (pedra|madeira), railing, collision, lod' },
      slots: { type: 'object', description: 'parede, madeira, base, telhado, porta, ferro -> {mat, blend, tint, uv} ou só o id do material' },
      weather: { type: 'object', description: 'colorVar, wear, moss, dirt, humidity, damage, grout, normal, parallax (0-1; normal e parallax até 2)' },
    }, ['type', 'points']),
  },
  {
    name: 'edit_structure',
    mutates: true,
    description: 'Muda uma construção existente (todas as cópias): id da construção (est_...) ou uid do objeto (obj_...). Aceita preset, name, params, slots e weather como em build_structure, e newSeed=true para outra variação.',
    input_schema: obj({
      id: str('id da construção ou uid do objeto'),
      preset: str('A, B ou C', { enum: ['A', 'B', 'C'] }),
      name: str('Nome'),
      params: { type: 'object' },
      slots: { type: 'object' },
      weather: { type: 'object' },
      newSeed: bool('Sortear outra variação'),
    }, ['id']),
  },
  // ------------------------------------------------------------ NPCs e zonas
  {
    name: 'add_npcs',
    mutates: true,
    core: true,
    description: 'Cria NPCs (spawns do servidor). type: Merchant, Teleporter, Warehouse, Buffer, Guard, Folk, Monster. heading em graus. Para monstros use count e radius (vários no mesmo spawn). html = caminho da página, multisell = listId da loja, character = id de personagem 3D.',
    input_schema: obj({
      items: {
        type: 'array', minItems: 1, maxItems: 60,
        items: obj({
          type: str('Tipo', { enum: NPC_TYPE_IDS }), name: str('Nome'), title: str('Título'), npcId: int('ID do NPC no servidor'),
          x: num('x'), z: num('z'), heading: num('graus'), level: int('Level'), count: int('Quantidade no spawn'), radius: num('Raio do spawn'),
          respawn: int('Respawn em segundos'), html: str('Página'), multisell: str('listId'), character: str('Personagem 3D'), aggressive: bool('Agressivo'),
        }, ['type', 'x', 'z']),
      },
    }, ['items']),
  },
  {
    name: 'edit_npcs',
    mutates: true,
    description: 'Altera NPCs pelo uid: qualquer campo (name, title, npcId, type, level, hp, mp, heading, count, radius, respawn, html, multisell, character, aggressive, x, z). delete=true apaga.',
    input_schema: obj({
      items: { type: 'array', minItems: 1, maxItems: 60, items: { type: 'object', properties: { uid: str('uid do NPC'), delete: bool('apagar') }, required: ['uid'] } },
    }, ['items']),
  },
  {
    name: 'add_zone',
    mutates: true,
    description: 'Cria uma zona pelo contorno (3+ pontos). type: PeaceZone, TownZone, ArenaZone, NoLandingZone, SwampZone.',
    input_schema: obj({ name: str('Nome'), type: str('Tipo', { enum: ZONE_TYPE_IDS }), points: { type: 'array', items: point, minItems: 3, maxItems: 64 } }, ['type', 'points']),
  },
  // ------------------------------------------------------------ lojas e diálogos
  {
    name: 'upsert_shop',
    mutates: true,
    description: 'Cria ou substitui uma loja (multisell). entries: cada uma com o item recebido (itemId, count) e o preço (priceId, price; 57 = adena). npcIds liga a loja a NPCs do servidor.',
    input_schema: obj({
      listId: int('ID da lista (novo se omitido)'), name: str('Nome da loja'),
      npcIds: { type: 'array', items: { type: 'integer' } },
      entries: { type: 'array', maxItems: 120, items: obj({ itemId: int('Item'), count: int('Quantidade'), priceId: int('Item do preço (57 adena)'), price: int('Preço') }, ['itemId', 'price']) },
    }, ['name', 'entries']),
  },
  {
    name: 'upsert_page',
    mutates: true,
    description: 'Cria ou substitui uma página HTML de diálogo (formato do L2: <html><body>... bypass -h npc_%objectId%_...). path ex.: merchant/30001.htm.',
    input_schema: obj({ path: str('Caminho da página'), content: str('HTML completo') }, ['path', 'content']),
  },
  // ------------------------------------------------------------ personagens
  {
    name: 'set_character',
    mutates: true,
    description: 'Personagem 3D do jogador (target="player") ou de NPCs (target = uid do NPC, ou "type:Guard" para todos de um tipo). character = id do personagem ou null para o marcador.',
    input_schema: obj({ target: str('player, uid do NPC ou type:<Tipo>'), character: str('id do personagem, ou "" para voltar ao marcador') }, ['target', 'character']),
  },
  // ------------------------------------------------------------ editor
  {
    name: 'editor_action',
    description: 'Ações do editor: undo, redo, save (baixa o .json), open_tab (arg = mundo, terreno, objetos, construtor, materiais, npc, personagens, roupa, loja, html, exportar), select (arg = uid), focus (arg = uid), validate.',
    input_schema: obj({ action: str('Ação', { enum: ['undo', 'redo', 'save', 'open_tab', 'select', 'focus', 'validate'] }), arg: str('Argumento') }, ['action']),
  },
  {
    name: 'import_files',
    bridgeOnly: true,
    mutates: true,
    description: 'Importa arquivos lidos do computador pela ponte (o tools/mcp.mjs lê os caminhos e manda o conteúdo).',
    input_schema: obj({
      files: { type: 'array', items: obj({ name: str('Caminho relativo'), data: str('base64') }, ['name', 'data']) },
      kind: str('Tipo', { enum: ['auto', 'mesh', 'material', 'character', 'animations'] }),
      name: str('Nome'),
      category: str('Categoria do material'),
    }, ['files']),
  },
  {
    name: 'run_script',
    mutates: true,
    description: 'Controle total: roda JavaScript dentro do editor com acesso a `app` (o editor inteiro: app.project, app.city, app.terrain, app.sky, app.characters, app.materials, app.structures) e `THREE`. Devolve o valor retornado. Só funciona se o usuário ligou "Permitir scripts" no painel. Prefira as outras ferramentas.',
    input_schema: obj({ code: str('Corpo de uma função async; use return para devolver algo') }, ['code']),
  },
];

export const TOOL_MAP = new Map(TOOL_DEFS.map((t) => [t.name, t]));

/** Validação simples do JSON Schema acima (tipos, enum, obrigatórios). Devolve a mensagem de erro ou null. */
export function validateInput(schema, value, path = 'input') {
  if (!schema) return null;
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : null;
  if (types) {
    const ok = types.some((t) => {
      if (t === 'null') return value === null;
      if (t === 'array') return Array.isArray(value);
      if (t === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
      if (t === 'integer') return Number.isInteger(value);
      if (t === 'number') return typeof value === 'number' && Number.isFinite(value);
      return typeof value === t;
    });
    if (!ok) return `${path} deveria ser ${types.join(' ou ')}`;
  }
  if (schema.enum && !schema.enum.includes(value)) return `${path} deve ser um de: ${schema.enum.join(', ')}`;
  if (Array.isArray(value)) {
    if (schema.minItems && value.length < schema.minItems) return `${path} precisa de pelo menos ${schema.minItems} itens`;
    if (schema.maxItems && value.length > schema.maxItems) return `${path} aceita no máximo ${schema.maxItems} itens`;
    for (let i = 0; i < value.length; i++) {
      const e = validateInput(schema.items, value[i], `${path}[${i}]`);
      if (e) return e;
    }
  } else if (value && typeof value === 'object') {
    for (const k of schema.required || []) if (value[k] === undefined) return `${path}.${k} é obrigatório`;
    for (const [k, v] of Object.entries(value)) {
      const e = schema.properties?.[k] ? validateInput(schema.properties[k], v, `${path}.${k}`) : null;
      if (e) return e;
    }
  }
  return null;
}

/** Instruções fixas do assistente (vão como system no canal da API e como 1ª mensagem nos outros). */
export const ASSISTANT_RULES = `Você é o assistente do EditorJogo, o editor de mundo de um MMORPG no estilo Lineage 2 (servidor L2J/L2Mobius). O usuário é brasileiro: responda em português, direto e prático.
Você tem controle do editor pelas ferramentas. Antes de mudar algo grande, olhe o estado (get_overview, list_things, terrain_info, screenshot). Tudo que você muda vai para o histórico e o usuário pode desfazer com Ctrl+Z.
Coordenadas: metros, Y para cima, terreno centrado na origem (x e z vão de -tamanho/2 a +tamanho/2). heading/yaw em graus.
Ao montar cidades: ache uma área plana (terrain_info), nivele se preciso, coloque construções com espaço para ruas (caminho pintado), NPCs de serviço (Teleporter, Warehouse, Merchant com loja e página, Buffer, Guardas no portão), uma zona de paz cobrindo a cidade, muralha se fizer sentido, e natureza em volta. Monstros ficam fora das zonas de paz, em grupos com count/radius e level coerente com a distância da cidade.
Casas, castelos, muros, torres, portões, telhados e pontes: use build_structure (é o Construtor, sem Blender) com preset A/B/C e materiais da biblioteca; para mudar depois, edit_structure. Casas de vila medieval: 2 andares, enxaimel, 6-10 m de frente.
Quando pedirem para analisar o que falta, use analyze_world e program_info e responda em lista curta com prioridades. Seja honesto sobre o que o editor ainda não faz.`;
