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

export const BARK = {
  oak: { color: bark_oak_color, normal: bark_oak_normal },
  pine: { color: bark_pine_color, normal: bark_pine_normal },
  birch: { color: bark_birch_color, normal: bark_birch_normal },
};

export const LEAVES = { oak: leaves_oak, ash: leaves_ash, pine: leaves_pine, aspen: leaves_aspen };
