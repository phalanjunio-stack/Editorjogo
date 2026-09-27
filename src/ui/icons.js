// Ícones de linha (24x24, traço), no estilo das engines de jogo. Sem dependências externas.
const P = (d) => ['path', { d }];
const C = (cx, cy, r) => ['circle', { cx, cy, r }];
const R = (x, y, w, h, rx = 0) => ['rect', { x, y, width: w, height: h, rx }];

const ICONS = {
  globe: [C(12, 12, 9), P('M3 12h18'), P('M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18')],
  home: [P('M3 11l9-7 9 7'), P('M5 10v10h14V10'), P('M10 20v-6h4v6')],
  mountain: [P('M2 20 9 8l4 6 3-4 6 10z'), P('M7.5 10.5 9 12l1.5-1.5')],
  cube: [P('M12 2.5 20.5 7v10L12 21.5 3.5 17V7z'), P('M3.5 7 12 11.5 20.5 7'), P('M12 11.5v10')],
  user: [C(12, 8, 4), P('M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7')],
  shirt: [P('M8 3 3.5 6.5l2.5 4 2-1.2V21h8V9.3l2 1.2 2.5-4L16 3c-.8 1.7-2.2 2.7-4 2.7S8.8 4.7 8 3z')],
  coins: [P('M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z'), P('M4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7'), P('M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5')],
  code: [P('M14 3H6v18h12V7z'), P('M14 3v4h4'), P('M10 11.5 8 13.5l2 2'), P('M14 11.5l2 2-2 2')],
  package: [P('M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z'), P('M3 7.5 12 12l9-4.5'), P('M12 12v9'), P('M7.5 5.2l9 4.6')],
  play: [P('M7 4.5v15l12.5-7.5z')],
  hand: [P('M8 13V6a1.5 1.5 0 0 1 3 0v5'), P('M11 11V4.5a1.5 1.5 0 0 1 3 0V11'), P('M14 11V6.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5.2-3l-2-3.6a1.5 1.5 0 0 1 2.6-1.5L8 15')],
  raise: [P('M3 20h18L12 8z'), P('M12 6V2'), P('M10 4l2-2 2 2')],
  lower: [P('M3 20h18L12 11z'), P('M12 2v6'), P('M10 6l2 2 2-2')],
  smooth: [P('M3 15c3-5.5 6-5.5 9 0s6 5.5 9 0'), P('M3 9c3-2 6-2 9 0s6 2 9 0')],
  flatten: [P('M3 19h18'), P('M5 19l3-7h8l3 7'), P('M8 8h8')],
  noise: [P('M3 15l3-5 3 7 3-10 3 9 3-6 3 4')],
  erosion: [P('M3 20h18'), P('M4 20l5-9 3 4 2-3 6 8'), P('M9 4v2M13 3v2M16 6v2')],
  brush: [P('M14.5 4.5l5 5L10 19H5v-5z'), P('M12.5 6.5l5 5')],
  road: [P('M6 21 10 3'), P('M18 21 14 3'), P('M12 6v2M12 11v2M12 16v3')],
  cursor: [P('M5 3l14 7-6.2 2.2L10.5 18.5z')],
  plus: [P('M12 5v14'), P('M5 12h14')],
  minus: [P('M5 12h14')],
  trees: [P('M7 3 3 12h8z'), P('M7 12v6'), P('M17 7l-4 8h8z'), P('M17 15v5')],
  castle: [P('M4 21V8h3v3h3V8h4v3h3V8h3v13z'), P('M10 21v-5h4v5')],
  hexagon: [P('M12 2.5 20.3 7.3v9.4L12 21.5l-8.3-4.8V7.3z')],
  folder: [P('M3 6h6l2 2h10v11H3z')],
  folderOpen: [P('M3 19V6h6l2 2h8v3'), P('M3 19l3-8h16l-3 8z')],
  eye: [P('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z'), C(12, 12, 3)],
  search: [C(11, 11, 7), P('M21 21l-5-5')],
  x: [P('M6 6l12 12'), P('M18 6 6 18')],
  chevronDown: [P('M6 9l6 6 6-6')],
  chevronRight: [P('M9 6l6 6-6 6')],
  grid: [R(3, 3, 18, 18, 2), P('M3 9h18M3 15h18M9 3v18M15 3v18')],
  magnet: [P('M6 3h4v8a2 2 0 0 0 4 0V3h4v8a6 6 0 0 1-12 0z'), P('M6 7h4M14 7h4')],
  move: [P('M12 2v20M2 12h20'), P('M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3')],
  rotate: [P('M20 12a8 8 0 1 1-2.4-5.7'), P('M20 4v5h-5')],
  scale: [P('M4 14v6h6'), P('M4 20l7-7'), P('M14 4h6v6'), P('M20 4l-7 7')],
  sun: [C(12, 12, 4), P('M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4')],
  moon: [P('M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z')],
  cloud: [P('M7 19h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.1 10 4.5 4.5 0 0 0 7 19z')],
  wind: [P('M3 8h11a3 3 0 1 0-3-3'), P('M3 12h16a3 3 0 1 1-3 3'), P('M3 16h7')],
  droplet: [P('M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z')],
  layers: [P('M12 3l9 5-9 5-9-5z'), P('M3 13l9 5 9-5')],
  undo: [P('M9 14 4 9l5-5'), P('M4 9h11a5 5 0 0 1 0 10h-3')],
  redo: [P('M15 14l5-5-5-5'), P('M20 9H9a5 5 0 0 0 0 10h3')],
  save: [P('M5 3h11l3 3v15H5z'), P('M8 3v5h7V3'), P('M8 21v-7h8v7')],
  fileNew: [P('M14 3H6v18h12V7z'), P('M14 3v4h4'), P('M12 11v6M9 14h6')],
  sliders: [P('M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1'), C(15, 6, 2), C(9, 12, 2), C(17, 18, 2)],
  map: [P('M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z'), P('M9 3v15M15 6v15')],
  terminal: [R(3, 4, 18, 16, 2), P('M7 9l3 3-3 3'), P('M12 15h5')],
  bulb: [P('M9 18h6M10 21h4'), P('M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z')],
  sparkles: [P('M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z'), P('M19 15l.8 1.7 1.7.8-1.7.8L19 20l-.8-1.7-1.7-.8 1.7-.8z')],
  building: [P('M4 21V9l8-5 8 5v12'), P('M9 21v-6h6v6'), P('M3 21h18')],
  leaf: [P('M5 20c0-9 6-15 15-16-1 9-7 15-15 16z'), P('M5 20l8-8')],
  trash: [P('M4 7h16'), P('M9 7V4h6v3'), P('M6 7l1 14h10l1-14')],
  copy: [R(8, 8, 12, 12, 2), P('M4 16V4h12')],
  download: [P('M12 3v12'), P('M7 10l5 5 5-5'), P('M4 21h16')],
  upload: [P('M12 21V9'), P('M7 14l5-5 5 5'), P('M4 3h16')],
  server: [R(3, 4, 18, 7, 2), R(3, 13, 18, 7, 2), P('M7 7.5h.01M7 16.5h.01')],
  camera: [P('M3 7h4l2-3h6l2 3h4v12H3z'), C(12, 13, 4)],
  flag: [P('M5 21V4'), P('M5 4h12l-2.5 4L17 12H5')],
  sword: [P('M14.5 17.5 3 6V3h3l11.5 11.5'), P('M13 19l6-6'), P('M16 16l4 4'), P('M19 21l2-2')],
  chat: [P('M4 5h16v11H9l-5 4z')],
  check: [P('M5 12l5 5 9-10')],
  target: [C(12, 12, 8), C(12, 12, 2), P('M12 2v3M12 19v3M2 12h3M19 12h3')],
  help: [C(12, 12, 9), P('M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7'), P('M12 17h.01')],
  image: [R(3, 4, 18, 16, 2), C(8.5, 9.5, 1.5), P('M21 16l-5-5-9 9')],
  dice: [R(4, 4, 16, 16, 3), P('M9 9h.01M15 15h.01M15 9h.01M9 15h.01M12 12h.01')],
  wand: [P('M4 20 16 8'), P('M15 3v2M19 7h2M18 4l1.5-1.5M20 11h1M13 2h1')],
  wall: [R(3, 5, 18, 14), P('M3 12h18M9 5v7M15 12v7')],
  stone: [P('M4 17l2-8 6-4 6 3 2 8-5 3H8z')],
  shield: [P('M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z')],
  maximize: [P('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5')],
  info: [C(12, 12, 9), P('M12 11v6M12 7.5h.01')],
  pin: [P('M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z'), C(12, 10, 2.5)],
  item: [P('M6 3h12l3 5-9 13L3 8z'), P('M3 8h18M9 3l3 5 3-5M12 8v13')],
};

const NS = 'http://www.w3.org/2000/svg';

export function icon(name, size = 16, cls = '') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', name === 'play' ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon ${cls}`);
  for (const [tag, attrs] of ICONS[name] || ICONS.cube) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    svg.append(e);
  }
  return svg;
}

export const hasIcon = (name) => !!ICONS[name];
