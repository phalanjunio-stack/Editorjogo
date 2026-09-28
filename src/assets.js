// Texturas fotográficas embutidas no EditorJogo (reduzidas para 512 px, formato WebP).
// Terreno e construções: Poly Haven (CC0, domínio público). Casca e folhas das árvores: ez-tree
// (MIT), originalmente de Poly Haven e texturecan. Detalhes em assets/textures/CREDITOS.md.
import t_grass_diff from '../assets/textures/terrain/grass_diff.webp';
import t_grass_nor from '../assets/textures/terrain/grass_nor.webp';
import t_grass_arm from '../assets/textures/terrain/grass_arm.webp';
import t_dirt_diff from '../assets/textures/terrain/dirt_diff.webp';
import t_dirt_nor from '../assets/textures/terrain/dirt_nor.webp';
import t_dirt_arm from '../assets/textures/terrain/dirt_arm.webp';
import t_rock_diff from '../assets/textures/terrain/rock_diff.webp';
import t_rock_nor from '../assets/textures/terrain/rock_nor.webp';
import t_rock_arm from '../assets/textures/terrain/rock_arm.webp';
import t_snow_diff from '../assets/textures/terrain/snow_diff.webp';
import t_snow_nor from '../assets/textures/terrain/snow_nor.webp';
import t_snow_arm from '../assets/textures/terrain/snow_arm.webp';
import t_sand_diff from '../assets/textures/terrain/sand_diff.webp';
import t_sand_nor from '../assets/textures/terrain/sand_nor.webp';
import t_sand_arm from '../assets/textures/terrain/sand_arm.webp';
import t_mud_diff from '../assets/textures/terrain/mud_diff.webp';
import t_mud_nor from '../assets/textures/terrain/mud_nor.webp';
import t_mud_arm from '../assets/textures/terrain/mud_arm.webp';
import t_cobble_diff from '../assets/textures/terrain/cobble_diff.webp';
import t_cobble_nor from '../assets/textures/terrain/cobble_nor.webp';
import t_cobble_arm from '../assets/textures/terrain/cobble_arm.webp';
import t_path_diff from '../assets/textures/terrain/path_diff.webp';
import t_path_nor from '../assets/textures/terrain/path_nor.webp';
import t_path_arm from '../assets/textures/terrain/path_arm.webp';
import b_stone_diff from '../assets/textures/building/stone_diff.webp';
import b_stone_nor from '../assets/textures/building/stone_nor.webp';
import b_stone_arm from '../assets/textures/building/stone_arm.webp';
import b_plaster_diff from '../assets/textures/building/plaster_diff.webp';
import b_plaster_nor from '../assets/textures/building/plaster_nor.webp';
import b_plaster_arm from '../assets/textures/building/plaster_arm.webp';
import b_wood_diff from '../assets/textures/building/wood_diff.webp';
import b_wood_nor from '../assets/textures/building/wood_nor.webp';
import b_wood_arm from '../assets/textures/building/wood_arm.webp';
import b_roof_tiles_diff from '../assets/textures/building/roof_tiles_diff.webp';
import b_roof_tiles_nor from '../assets/textures/building/roof_tiles_nor.webp';
import b_roof_tiles_arm from '../assets/textures/building/roof_tiles_arm.webp';
import b_roof_slates_diff from '../assets/textures/building/roof_slates_diff.webp';
import b_roof_slates_nor from '../assets/textures/building/roof_slates_nor.webp';
import b_roof_slates_arm from '../assets/textures/building/roof_slates_arm.webp';
import m_tijolo_novo_diff from '../assets/textures/material/tijolo_novo_diff.webp';
import m_tijolo_novo_nor from '../assets/textures/material/tijolo_novo_nor.webp';
import m_tijolo_novo_arh from '../assets/textures/material/tijolo_novo_arh.webp';
import m_tijolo_velho_diff from '../assets/textures/material/tijolo_velho_diff.webp';
import m_tijolo_velho_nor from '../assets/textures/material/tijolo_velho_nor.webp';
import m_tijolo_velho_arh from '../assets/textures/material/tijolo_velho_arh.webp';
import m_tijolo_rebocado_diff from '../assets/textures/material/tijolo_rebocado_diff.webp';
import m_tijolo_rebocado_nor from '../assets/textures/material/tijolo_rebocado_nor.webp';
import m_tijolo_rebocado_arh from '../assets/textures/material/tijolo_rebocado_arh.webp';
import m_reboco_quebrado_diff from '../assets/textures/material/reboco_quebrado_diff.webp';
import m_reboco_quebrado_nor from '../assets/textures/material/reboco_quebrado_nor.webp';
import m_reboco_quebrado_arh from '../assets/textures/material/reboco_quebrado_arh.webp';
import m_reboco_musgo_diff from '../assets/textures/material/reboco_musgo_diff.webp';
import m_reboco_musgo_nor from '../assets/textures/material/reboco_musgo_nor.webp';
import m_reboco_musgo_arh from '../assets/textures/material/reboco_musgo_arh.webp';
import m_taipa_diff from '../assets/textures/material/taipa_diff.webp';
import m_taipa_nor from '../assets/textures/material/taipa_nor.webp';
import m_taipa_arh from '../assets/textures/material/taipa_arh.webp';
import m_madeira_escura_diff from '../assets/textures/material/madeira_escura_diff.webp';
import m_madeira_escura_nor from '../assets/textures/material/madeira_escura_nor.webp';
import m_madeira_escura_arh from '../assets/textures/material/madeira_escura_arh.webp';
import m_madeira_clara_diff from '../assets/textures/material/madeira_clara_diff.webp';
import m_madeira_clara_nor from '../assets/textures/material/madeira_clara_nor.webp';
import m_madeira_clara_arh from '../assets/textures/material/madeira_clara_arh.webp';
import m_madeira_velha_diff from '../assets/textures/material/madeira_velha_diff.webp';
import m_madeira_velha_nor from '../assets/textures/material/madeira_velha_nor.webp';
import m_madeira_velha_arh from '../assets/textures/material/madeira_velha_arh.webp';
import m_madeira_rachada_diff from '../assets/textures/material/madeira_rachada_diff.webp';
import m_madeira_rachada_nor from '../assets/textures/material/madeira_rachada_nor.webp';
import m_madeira_rachada_arh from '../assets/textures/material/madeira_rachada_arh.webp';
import m_madeira_umida_diff from '../assets/textures/material/madeira_umida_diff.webp';
import m_madeira_umida_nor from '../assets/textures/material/madeira_umida_nor.webp';
import m_madeira_umida_arh from '../assets/textures/material/madeira_umida_arh.webp';
import m_toras_diff from '../assets/textures/material/toras_diff.webp';
import m_toras_nor from '../assets/textures/material/toras_nor.webp';
import m_toras_arh from '../assets/textures/material/toras_arh.webp';
import m_pedra_bruta_diff from '../assets/textures/material/pedra_bruta_diff.webp';
import m_pedra_bruta_nor from '../assets/textures/material/pedra_bruta_nor.webp';
import m_pedra_bruta_arh from '../assets/textures/material/pedra_bruta_arh.webp';
import m_pedra_talhada_diff from '../assets/textures/material/pedra_talhada_diff.webp';
import m_pedra_talhada_nor from '../assets/textures/material/pedra_talhada_nor.webp';
import m_pedra_talhada_arh from '../assets/textures/material/pedra_talhada_arh.webp';
import m_alvenaria_pesada_diff from '../assets/textures/material/alvenaria_pesada_diff.webp';
import m_alvenaria_pesada_nor from '../assets/textures/material/alvenaria_pesada_nor.webp';
import m_alvenaria_pesada_arh from '../assets/textures/material/alvenaria_pesada_arh.webp';
import m_bloco_antigo_diff from '../assets/textures/material/bloco_antigo_diff.webp';
import m_bloco_antigo_nor from '../assets/textures/material/bloco_antigo_nor.webp';
import m_bloco_antigo_arh from '../assets/textures/material/bloco_antigo_arh.webp';
import m_pedra_musgo_diff from '../assets/textures/material/pedra_musgo_diff.webp';
import m_pedra_musgo_nor from '../assets/textures/material/pedra_musgo_nor.webp';
import m_pedra_musgo_arh from '../assets/textures/material/pedra_musgo_arh.webp';
import m_telha_velha_diff from '../assets/textures/material/telha_velha_diff.webp';
import m_telha_velha_nor from '../assets/textures/material/telha_velha_nor.webp';
import m_telha_velha_arh from '../assets/textures/material/telha_velha_arh.webp';
import m_shingle_madeira_diff from '../assets/textures/material/shingle_madeira_diff.webp';
import m_shingle_madeira_nor from '../assets/textures/material/shingle_madeira_nor.webp';
import m_shingle_madeira_arh from '../assets/textures/material/shingle_madeira_arh.webp';
import m_palha_diff from '../assets/textures/material/palha_diff.webp';
import m_palha_nor from '../assets/textures/material/palha_nor.webp';
import m_palha_arh from '../assets/textures/material/palha_arh.webp';
import m_porta_madeira_diff from '../assets/textures/material/porta_madeira_diff.webp';
import m_porta_madeira_nor from '../assets/textures/material/porta_madeira_nor.webp';
import m_porta_madeira_arh from '../assets/textures/material/porta_madeira_arh.webp';
import m_ferro_velho_diff from '../assets/textures/material/ferro_velho_diff.webp';
import m_ferro_velho_nor from '../assets/textures/material/ferro_velho_nor.webp';
import m_ferro_velho_arh from '../assets/textures/material/ferro_velho_arh.webp';
import m_tecido_corda_diff from '../assets/textures/material/tecido_corda_diff.webp';
import m_tecido_corda_nor from '../assets/textures/material/tecido_corda_nor.webp';
import m_tecido_corda_arh from '../assets/textures/material/tecido_corda_arh.webp';
import bark_oak_color from '../assets/textures/tree/bark_oak_color.webp';
import bark_oak_normal from '../assets/textures/tree/bark_oak_normal.webp';
import bark_pine_color from '../assets/textures/tree/bark_pine_color.webp';
import bark_pine_normal from '../assets/textures/tree/bark_pine_normal.webp';
import bark_birch_color from '../assets/textures/tree/bark_birch_color.webp';
import bark_birch_normal from '../assets/textures/tree/bark_birch_normal.webp';
import leaves_oak from '../assets/textures/tree/leaves_oak.webp';
import leaves_ash from '../assets/textures/tree/leaves_ash.webp';
import leaves_pine from '../assets/textures/tree/leaves_pine.webp';
import leaves_aspen from '../assets/textures/tree/leaves_aspen.webp';

const set = (color, normal, arm) => ({ color, normal, arm });

// Na mesma ordem das camadas padrão: Grama, Terra, Rocha, Neve, Areia, Lama, Pedra, Caminho.
export const TERRAIN_SETS = [
  set(t_grass_diff, t_grass_nor, t_grass_arm),
  set(t_dirt_diff, t_dirt_nor, t_dirt_arm),
  set(t_rock_diff, t_rock_nor, t_rock_arm),
  set(t_snow_diff, t_snow_nor, t_snow_arm),
  set(t_sand_diff, t_sand_nor, t_sand_arm),
  set(t_mud_diff, t_mud_nor, t_mud_arm),
  set(t_cobble_diff, t_cobble_nor, t_cobble_arm),
  set(t_path_diff, t_path_nor, t_path_arm),
];

export const BUILDING_SETS = {
  stone: set(b_stone_diff, b_stone_nor, b_stone_arm),
  plaster: set(b_plaster_diff, b_plaster_nor, b_plaster_arm),
  wood: set(b_wood_diff, b_wood_nor, b_wood_arm),
  roofTiles: set(b_roof_tiles_diff, b_roof_tiles_nor, b_roof_tiles_arm),
  roofSlates: set(b_roof_slates_diff, b_roof_slates_nor, b_roof_slates_arm),
};

// Biblioteca de materiais (Construtor): cor, normal e ARH (R oclusão, G rugosidade, B altura).
// Os conjuntos das construções acima também guardam a altura no azul do ARM.
export const MATERIAL_SETS = {
  tijolo_novo: { color: m_tijolo_novo_diff, normal: m_tijolo_novo_nor, arh: m_tijolo_novo_arh },
  tijolo_velho: { color: m_tijolo_velho_diff, normal: m_tijolo_velho_nor, arh: m_tijolo_velho_arh },
  tijolo_rebocado: { color: m_tijolo_rebocado_diff, normal: m_tijolo_rebocado_nor, arh: m_tijolo_rebocado_arh },
  reboco_quebrado: { color: m_reboco_quebrado_diff, normal: m_reboco_quebrado_nor, arh: m_reboco_quebrado_arh },
  reboco_musgo: { color: m_reboco_musgo_diff, normal: m_reboco_musgo_nor, arh: m_reboco_musgo_arh },
  taipa: { color: m_taipa_diff, normal: m_taipa_nor, arh: m_taipa_arh },
  madeira_escura: { color: m_madeira_escura_diff, normal: m_madeira_escura_nor, arh: m_madeira_escura_arh },
  madeira_clara: { color: m_madeira_clara_diff, normal: m_madeira_clara_nor, arh: m_madeira_clara_arh },
  madeira_velha: { color: m_madeira_velha_diff, normal: m_madeira_velha_nor, arh: m_madeira_velha_arh },
  madeira_rachada: { color: m_madeira_rachada_diff, normal: m_madeira_rachada_nor, arh: m_madeira_rachada_arh },
  madeira_umida: { color: m_madeira_umida_diff, normal: m_madeira_umida_nor, arh: m_madeira_umida_arh },
  toras: { color: m_toras_diff, normal: m_toras_nor, arh: m_toras_arh },
  pedra_bruta: { color: m_pedra_bruta_diff, normal: m_pedra_bruta_nor, arh: m_pedra_bruta_arh },
  pedra_talhada: { color: m_pedra_talhada_diff, normal: m_pedra_talhada_nor, arh: m_pedra_talhada_arh },
  alvenaria_pesada: { color: m_alvenaria_pesada_diff, normal: m_alvenaria_pesada_nor, arh: m_alvenaria_pesada_arh },
  bloco_antigo: { color: m_bloco_antigo_diff, normal: m_bloco_antigo_nor, arh: m_bloco_antigo_arh },
  pedra_musgo: { color: m_pedra_musgo_diff, normal: m_pedra_musgo_nor, arh: m_pedra_musgo_arh },
  telha_velha: { color: m_telha_velha_diff, normal: m_telha_velha_nor, arh: m_telha_velha_arh },
  shingle_madeira: { color: m_shingle_madeira_diff, normal: m_shingle_madeira_nor, arh: m_shingle_madeira_arh },
  palha: { color: m_palha_diff, normal: m_palha_nor, arh: m_palha_arh },
  porta_madeira: { color: m_porta_madeira_diff, normal: m_porta_madeira_nor, arh: m_porta_madeira_arh },
  ferro_velho: { color: m_ferro_velho_diff, normal: m_ferro_velho_nor, arh: m_ferro_velho_arh },
  tecido_corda: { color: m_tecido_corda_diff, normal: m_tecido_corda_nor, arh: m_tecido_corda_arh },
};

export const BARK = {
  oak: { color: bark_oak_color, normal: bark_oak_normal },
  pine: { color: bark_pine_color, normal: bark_pine_normal },
  birch: { color: bark_birch_color, normal: bark_birch_normal },
};

export const LEAVES = { oak: leaves_oak, ash: leaves_ash, pine: leaves_pine, aspen: leaves_aspen };
