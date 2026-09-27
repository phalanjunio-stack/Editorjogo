// Modo Play (F5): anda pelo mapa em terceira pessoa com a capa simulada e conversa com os NPCs
// (abre o HTML ligado a eles e as multisells), como um teste rápido do servidor.
import * as THREE from 'three';
import { Mannequin } from '../cloth/mannequin.js';
import { ClothSim, makeClothMeshes, disposeClothMeshes } from '../cloth/cloth.js';
import { renderL2Html, l2Window, renderMultisellWindow } from '../l2/htmlPreview.js';
import { interpretBypass } from '../l2/htmlCore.js';
import { el, toast } from '../ui/ui.js';
import { editorToL2 } from '../core/util.js';

export class PlayMode {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0.35;
    this.dist = 6;
    this.facing = 0;
    this.velY = 0;
    this.dragging = false;
    this.dialog = null;
  }

  start() {
    const app = this.app;
    if (this.active) return;
    this.active = true;
    app.playing = true;
    this.saved = { cam: app.camera.position.clone(), target: app.controls.target.clone() };
    app.controls.enabled = false;
    app.city.gizmo.detach();
    app.city.setGhost(null);
    app.terrain.setBrush(false);
    app.city.helpers.visible = false;
    app.city.gizmoHelper.visible = false;

    const t = app.controls.target;
    const char = (this.char = new Mannequin('#d8c3a5'));
    char.root.position.set(t.x, app.terrain.heightAt(t.x, t.z), t.z);
    app.scene.add(char.root);
    const dir = new THREE.Vector3().subVectors(t, app.camera.position);
    this.yaw = Math.atan2(dir.x, dir.z);
    this.facing = Math.atan2(dir.z, dir.x);
    char.root.rotation.y = this.yaw;
    char.root.updateMatrixWorld(true);
    char.animate(0, 'parado');

    const preset = app.project.cloth.current;
    if (preset.type !== 'bandeira') {
      this.cloth = new ClothSim(preset);
      this.clothMeshes = makeClothMeshes(this.cloth, preset, app.capeLab.emblemImage);
      app.scene.add(this.clothMeshes);
    }

    this.hud = el('div', { class: 'play-hud' },
      el('b', {}, '▶ Modo Play'),
      el('span', {}, 'WASD andar • Shift correr • Espaço pular • arraste o mouse para girar • roda: zoom • E falar com NPC • Esc sair'));
    this.prompt = el('div', { class: 'play-prompt', hidden: true });
    this.coords = el('div', { class: 'play-coords' });
    app.vpOverlayRoot.append(this.hud, this.prompt, this.coords);
    app.viewport.classList.add('playing');

    this._kd = (e) => this._onKey(e, true);
    this._ku = (e) => this._onKey(e, false);
    this._pd = (e) => { if (e.target === app.canvas) { this.dragging = true; app.canvas.setPointerCapture?.(e.pointerId); } };
    this._pu = () => { this.dragging = false; };
    this._pm = (e) => {
      if (!this.dragging) return;
      this.yaw -= e.movementX * 0.005;
      this.pitch = Math.max(-0.2, Math.min(1.3, this.pitch + e.movementY * 0.004));
    };
    this._wh = (e) => { if (e.target === app.canvas) { e.preventDefault(); this.dist = Math.max(2.5, Math.min(25, this.dist * (e.deltaY > 0 ? 1.1 : 0.9))); } };
    window.addEventListener('keydown', this._kd, true);
    window.addEventListener('keyup', this._ku, true);
    app.canvas.addEventListener('pointerdown', this._pd);
    window.addEventListener('pointerup', this._pu);
    window.addEventListener('pointermove', this._pm);
    app.canvas.addEventListener('wheel', this._wh, { passive: false });
    app.log('Modo Play iniciado.');
    app.events.emit('play-changed', true);
  }

  stop() {
    const app = this.app;
    if (!this.active) return;
    this.active = false;
    app.playing = false;
    this.closeDialog();
    window.removeEventListener('keydown', this._kd, true);
    window.removeEventListener('keyup', this._ku, true);
    app.canvas.removeEventListener('pointerdown', this._pd);
    window.removeEventListener('pointerup', this._pu);
    window.removeEventListener('pointermove', this._pm);
    app.canvas.removeEventListener('wheel', this._wh);
    this.char.root.removeFromParent();
    this.char.dispose();
    if (this.clothMeshes) {
      this.clothMeshes.removeFromParent();
      disposeClothMeshes(this.clothMeshes);
      this.cloth.dispose();
      this.clothMeshes = null;
      this.cloth = null;
    }
    this.hud.remove();
    this.prompt.remove();
    this.coords.remove();
    app.viewport.classList.remove('playing');
    app.camera.position.copy(this.saved.cam);
    app.controls.target.copy(this.saved.target);
    app.controls.enabled = app.mode?.view === '3d';
    app.city.helpers.visible = true;
    app.city.gizmoHelper.visible = true;
    this.keys.clear();
    app.log('Modo Play encerrado.');
    app.events.emit('play-changed', false);
  }

  _onKey(e, down) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    const k = e.key.toLowerCase();
    if (down && (k === 'escape' || e.key === 'F5')) {
      e.preventDefault();
      e.stopPropagation();
      if (this.dialog && k === 'escape') this.closeDialog();
      else this.stop();
      return;
    }
    if (down && k === 'e' && this.near) {
      e.preventDefault();
      e.stopPropagation();
      this.talk(this.near);
      return;
    }
    if (['w', 'a', 's', 'd', 'shift', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      e.preventDefault();
      e.stopPropagation();
      if (down) this.keys.add(k); else this.keys.delete(k);
    }
  }

  update(dt) {
    const app = this.app;
    const T = app.terrain;
    const root = this.char.root;
    const k = this.keys;
    const fwd = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const side = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const run = k.has('shift');
    const speed = (fwd || side) && !this.dialog ? (run ? 8 : 4) : 0;
    // direção relativa à câmera
    const cf = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const cr = new THREE.Vector3(-cf.z, 0, cf.x);
    const move = cf.multiplyScalar(fwd).add(cr.multiplyScalar(side));
    const onGround = root.position.y <= T.heightAt(root.position.x, root.position.z) + 0.02;
    if (speed > 0 && move.lengthSq() > 0) {
      move.normalize();
      const nx = root.position.x + move.x * speed * dt, nz = root.position.z + move.z * speed * dt;
      const water = app.project.terrain.waterEnabled ? app.project.terrain.waterLevel : -1e9;
      // não sobe paredes muito íngremes nem entra em água funda
      const slopeOk = T.slopeAt(nx, nz) < 48 || T.heightAt(nx, nz) < T.heightAt(root.position.x, root.position.z);
      if (T.inside(nx, nz) && slopeOk && T.heightAt(nx, nz) > water - 1.2) {
        root.position.x = nx;
        root.position.z = nz;
      }
      const target = Math.atan2(move.x, move.z);
      let d = target - root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      root.rotation.y += d * Math.min(1, dt * 12);
    }
    this.facing = Math.atan2(Math.cos(root.rotation.y), Math.sin(root.rotation.y));
    // gravidade e pulo
    const ground = T.heightAt(root.position.x, root.position.z);
    if (k.has(' ') && onGround && !this.dialog) this.velY = 5.5;
    this.velY -= 18 * dt;
    root.position.y += this.velY * dt;
    if (root.position.y < ground) { root.position.y = ground; this.velY = 0; }
    this.char.pose(dt, speed, root.position.y > ground + 0.05);

    // capa
    if (this.cloth) {
      const P = app.project.cloth.current;
      this.cloth.preset.windStrength = P.windStrength;
      const anchor = P.type === 'saia' ? this.char.waistAnchor : this.char.capeAnchor;
      const sky = app.sky;
      const wind = new THREE.Vector3(sky.windDir2.x, 0, sky.windDir2.y).multiplyScalar(1 + sky.windStrength * 4);
      this.cloth.step(dt, anchor.matrixWorld, this.char.colliders, wind, app.time, ground);
    }

    // câmera em terceira pessoa
    const focus = root.position.clone().add(new THREE.Vector3(0, 1.6, 0));
    const off = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(this.dist);
    const cam = focus.clone().add(off);
    const minY = T.heightAt(cam.x, cam.z) + 0.5;
    if (cam.y < minY) cam.y = minY;
    app.camera.position.lerp(cam, Math.min(1, dt * 10));
    app.camera.lookAt(focus);
    app.controls.target.copy(focus);

    // NPC mais próximo
    let best = null, bd = 4;
    for (const n of app.project.npcs) {
      const d = Math.hypot(n.pos[0] - root.position.x, n.pos[2] - root.position.z);
      if (d < bd && n.type !== 'Monster') { bd = d; best = n; }
    }
    this.near = best;
    this.prompt.hidden = !best || !!this.dialog;
    if (best) this.prompt.textContent = `E — falar com ${best.name}${best.title ? ` (${best.title})` : ''}`;
    const l2 = editorToL2(root.position, app.project.server);
    this.coords.textContent = `L2: ${l2.x}, ${l2.y}, ${l2.z}`;
  }

  // ---------------------------------------------------------------- diálogo do NPC
  talk(npc) {
    if (!npc.html) {
      toast(`${npc.name} não tem página HTML ligada.`, 'warn');
      return;
    }
    this.dialogNpc = npc;
    this.showPage(npc.html);
  }

  showPage(path) {
    const app = this.app;
    const page = app.project.htmls.find((h) => h.path.toLowerCase() === path.toLowerCase());
    let win;
    if (!page) {
      win = l2Window('Erro', el('div', { class: 'l2-body' }, `Página ${path} não existe.`));
    } else {
      const { title, body } = renderL2Html(page.content, { onAction: (a) => this._action(a, page.path) });
      win = l2Window(title || this.dialogNpc.name, body);
    }
    this._openWin(win);
  }

  _action(action, from) {
    const app = this.app;
    const r = interpretBypass(action, from);
    if (r.type === 'page') this.showPage(r.path);
    else if (r.type === 'multisell') {
      const ms = app.project.multisells.find((m) => Number(m.listId) === r.id);
      if (!ms) return toast(`Multisell ${r.id} não existe no projeto.`, 'warn');
      this._openWin(renderMultisellWindow(ms, (id) => app.itemDB.name(id)));
    } else if (r.type === 'teleport') toast(`Teleporte "${r.arg}" (no servidor leva ao destino configurado).`);
    else toast(`Comando do servidor: ${r.cmd} ${r.arg || ''}`);
  }

  _openWin(win) {
    this.closeDialog();
    win.classList.add('play-dialog');
    win.querySelector('.l2-x')?.addEventListener('click', () => this.closeDialog());
    this.app.vpOverlayRoot.append(win);
    this.dialog = win;
  }

  closeDialog() {
    this.dialog?.remove();
    this.dialog = null;
  }
}
