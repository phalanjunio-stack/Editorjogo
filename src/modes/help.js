// Janela de ajuda: fluxo de trabalho e atalhos.
import { el, modal } from '../ui/ui.js';

const KEYS = [
  ['F5', 'Play: andar pelo mapa (WASD, Shift correr, Espaço pular, E falar com NPC, Esc sair)'],
  ['Botão direito + arrastar', 'Girar a câmera'],
  ['Botão direito + W A S D', 'Voar (Q desce, E sobe, Shift rápido)'],
  ['Botão do meio + arrastar', 'Arrastar a câmera'],
  ['Roda do mouse', 'Zoom (na direção do cursor)'],
  ['Ctrl+Z / Ctrl+Y', 'Desfazer / refazer'],
  ['Ctrl+S / Ctrl+O', 'Salvar / abrir projeto'],
  ['Terreno: [ e ]', 'Tamanho do pincel'],
  ['Terreno: 1 a 8', 'Pintar camada (Grama, Terra, Rocha, Neve, Areia, Lama, Pedra, Caminho)'],
  ['Terreno: Shift + Levantar', 'Abaixar'],
  ['Objetos/NPC: Q / W / E / R', 'Selecionar / mover / girar / escalar'],
  ['Objetos/NPC: Delete, Ctrl+D, End, F', 'Apagar, duplicar, grudar no chão, focar'],
  ['Objetos: [ e ]', 'Girar peça 15°'],
  ['Muralha/Zona: Enter, Esc, Backspace', 'Terminar, cancelar, desfazer ponto'],
  ['Construir: clique nos cantos, Enter', 'Termina a construção (duplo clique também); Backspace desfaz o ponto'],
];

export function showHelp() {
  modal({
    title: 'Guia e atalhos',
    wide: true,
    body: el('div', { class: 'help' },
      el('h3', {}, 'O caminho completo'),
      el('ol', {},
        el('li', {}, el('b', {}, 'Terreno: '), 'gere montanhas (ou importe um heightmap), esculpa, use Erosão e Caminho, pinte as 8 camadas e escolha o tipo de folhagem (grama com flores que balança no vento).'),
        el('li', {}, el('b', {}, 'Mundo: '), 'hora do dia, sol, nuvens, névoa, vento e água.'),
        el('li', {}, el('b', {}, 'Objetos: '), 'escolha a peça no Navegador de Conteúdo (embaixo) e clique no chão, como no UnrealEd do L2. Muralha automática, espalhar árvores e importar suas malhas GLB/FBX/OBJ.'),
        el('li', {}, el('b', {}, 'Construir: '), 'casas, castelo, muros, torre, portão, telhado e ponte clicando nos cantos no chão; material por parte, presets A/B/C e envelhecimento (musgo, sujeira, umidade, reboco caindo).'),
        el('li', {}, el('b', {}, 'Materiais: '), 'biblioteca PBR com esferas; importe pastas ou .zip de texturas (cor, normal, rugosidade, AO, altura, metal).'),
        el('li', {}, el('b', {}, 'NPC: '), 'coloque NPCs (viram spawns do servidor), edite Level/HP/MP, IA, drops, HTML e loja; desenhe zonas de paz, cidade e PvP.'),
        el('li', {}, el('b', {}, 'Roupa: '), 'capas, mantos e bandeiras com física de tecido num boneco andando (ou no seu personagem GLB/FBX).'),
        el('li', {}, el('b', {}, 'Loja e HTML: '), 'multisells e diálogos com prévia no estilo do jogo.'),
        el('li', {}, el('b', {}, 'Play (F5): '), 'ande pelo mapa com a capa e converse com os NPCs para testar tudo.'),
        el('li', {}, el('b', {}, 'Exportar: '), 'pacote com os arquivos do servidor (L2J/L2Mobius) e validação do projeto.'),
        el('li', {}, el('b', {}, 'Claude: '), 'o botão no alto abre o assistente: peça em português e ele monta no editor e diz o que falta no mundo e no programa.'),
      ),
      el('h3', {}, 'Atalhos'),
      el('table', { class: 'keys' }, ...KEYS.map(([k, v]) => el('tr', {}, el('td', {}, el('kbd', {}, k)), el('td', {}, v)))),
      el('p', { class: 'hint' }, 'Tudo fica salvo no arquivo .json do projeto (Salvar). O editor também guarda um salvamento automático no navegador a cada minuto.'),
    ),
  });
}

export function showAbout(name) {
  modal({
    title: `Sobre o ${name}`,
    body: el('div', { class: 'help' },
      el('p', {}, 'Editor de mundo para servidores estilo Lineage 2: terreno com 8 camadas, céu com nuvens, grama com vento e flores, cidades com peças prontas ou suas malhas, NPCs com IA e drops, zonas, multisell, HTML de diálogo, capas com física de tecido e modo Play.'),
      el('p', {}, 'Gera os arquivos prontos para o servidor L2J/L2Mobius (XML, HTML, SQL). O projeto inteiro fica num arquivo .json seu.'),
      el('p', { class: 'hint' }, 'Feito com three.js. Tudo roda no navegador; seus arquivos não saem do seu computador.'),
    ),
  });
}
