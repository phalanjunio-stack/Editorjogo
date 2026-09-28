# Créditos das texturas

Todas as imagens foram reduzidas para 512 px (256 px nas normais das cascas) e convertidas para WebP
para o EditorJogo continuar sendo um arquivo só e leve.

## Terreno e construções — Poly Haven (CC0, domínio público)

https://polyhaven.com — pode usar em jogo comercial, sem precisar dar crédito.

| Arquivo | Textura original |
| --- | --- |
| terrain/grass_* | forrest_ground_01 |
| terrain/dirt_* | dirt |
| terrain/rock_* | mossy_rock |
| terrain/snow_* | snow_02 |
| terrain/sand_* | coast_sand_01 |
| terrain/mud_* | brown_mud_02 |
| terrain/cobble_* | cobblestone_floor_01 |
| terrain/path_* | stony_dirt_path |
| building/stone_* | castle_wall_slates |
| building/plaster_* | medieval_wall_01 |
| building/wood_* | medieval_wood |
| building/roof_tiles_* | clay_roof_tiles_02 |
| building/roof_slates_* | roof_slates_02 |

| material/tijolo_novo_* | red_brick_03 |
| material/tijolo_velho_* | medieval_red_brick |
| material/tijolo_rebocado_* | red_brick_plaster_patch_02 |
| material/reboco_quebrado_* | damaged_plaster |
| material/reboco_musgo_* | worn_mossy_plasterwall |
| material/taipa_* | clay_plaster |
| material/madeira_escura_* | dark_planks |
| material/madeira_clara_* | rough_wood |
| material/madeira_velha_* | weathered_planks |
| material/madeira_rachada_* | wooden_planks |
| material/madeira_umida_* | moss_wood |
| material/toras_* | wood_trunk_wall |
| material/pedra_bruta_* | rustic_stone_wall |
| material/pedra_talhada_* | stone_block_wall |
| material/alvenaria_pesada_* | castle_brick_07 |
| material/bloco_antigo_* | medieval_blocks_02 |
| material/pedra_musgo_* | mossy_stone_wall |
| material/telha_velha_* | roof_tiles_14 |
| material/shingle_madeira_* | weathered_plank_siding |
| material/palha_* | thatch_roof_angled |
| material/porta_madeira_* | rough_pine_door |
| material/ferro_velho_* | rusty_metal_02 |
| material/tecido_corda_* | hessian_230 |

Sufixos: `diff` = cor, `nor` = normal (padrão OpenGL). `arm` do terreno = R oclusão, G rugosidade, B metal;
`arm` das construções e `arh` dos materiais = R oclusão, G rugosidade, **B altura** (para o relevo/parallax do Construtor).

## Árvores — ez-tree (MIT)

Cascas e folhas do pacote [@dgreenheck/ez-tree](https://github.com/dgreenheck/ez-tree)
(Copyright (c) 2024 Daniel Greenheck, licença MIT). Fontes originais das cascas:
Poly Haven (bark_brown_02) e texturecan.com.
