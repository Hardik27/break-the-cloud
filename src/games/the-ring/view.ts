/** The Ring view. Buttons are built once; the ring picture (not interactive) is redrawn after each action. */
import { el, esc, onPress } from '../../lib/dom';
import { makeFlow } from '../flow';
import { predictAndReveal, replayBusy } from '../replay';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

const INFO = [
  { h: 'Tutorial: hash mod N', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'Add a server', p: 'Eight keys live on 3 servers by <b>hash mod 3</b>. Business is booming: click <b>Add server S3</b>. Then every key has to be placed again with <b>hash mod 4</b>. Click the right server for each key and see how many move.' },
  { h: 'The hash ring', p: 'Now servers sit on a ring of positions 0–99 (A at 10, B at 45, C at 80). A key belongs to the <b>next server clockwise</b> from its hash (wrapping from 99 to 0). Place each key. Then server D joins at 62: click every key that has to move to D.' },
  { h: 'Virtual nodes', p: `With one point per server, the ring is lopsided: one server owns far more of it. Give each server more <b>virtual nodes</b> (points on the ring) and press <b>Run</b>. Goal: no server owns more than ${sim.BALANCE_GOAL}× its fair share.` },
];
const COLORS: Record<string, string> = { A: 'var(--append)', B: 'var(--ok)', C: 'var(--vote)', D: 'var(--accent)' };

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    let mod = sim.createModulo(0);
    let ring = sim.createRing();
    let vn = 1;
    let vnSolved = false;

    // ---------- build once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span id="rg-s1"></span><span id="rg-s2"></span>`);
    const keyCard = el('div', { class: 'rg-key', id: 'rg-key', 'aria-live': 'polite' });
    // tasks 0–1
    const p1 = el('div', { class: 'rg-panel' });
    const add = el('button', { class: 'btn go', type: 'button', id: 'rg-add' }, 'Add server S3');
    onPress(add, () => doAdd());
    const cols = el('div', { class: 'rg-cols' });
    const srvBtns = [0, 1, 2, 3].map((i) => {
      const b = el('button', { class: 'rg-srv', type: 'button', 'data-srv': i }, `<b>S${i}</b><span class="keys"></span>`);
      onPress(b, () => clickModulo(i));
      cols.appendChild(b);
      return b;
    });
    p1.append(add, cols);
    // task 2
    const p2 = el('div', { class: 'rg-panel', hidden: true });
    const ringSvg = el('div', { class: 'rg-ring', id: 'rg-ring', 'aria-hidden': 'true' });
    const rsRow = el('div', { class: 'row', role: 'group', 'aria-label': 'Ring servers' });
    const rsBtns = ['A', 'B', 'C', 'D'].map((id) => {
      const b = el('button', { class: 'rg-rsrv', type: 'button', 'data-rsrv': id, style: `--c:${COLORS[id]}` }, `<b>${id}</b><span></span>`);
      onPress(b, () => clickRingServer(id));
      rsRow.appendChild(b);
      return b;
    });
    const moverRow = el('div', { class: 'rg-movers', role: 'group', 'aria-label': 'Keys: click the ones that move to D' });
    const keyBtns = sim.KEYS.map((k) => {
      const b = el('button', { class: 'chip', type: 'button', 'data-key': k }, `${esc(k)} · ${sim.hash100(k)}`);
      onPress(b, () => clickMover(k));
      moverRow.appendChild(b);
      return b;
    });
    p2.append(ringSvg, rsRow, moverRow);
    // task 3
    const p3 = el('div', { class: 'rg-panel', hidden: true });
    const vnRow = el('div', { class: 'row', role: 'group', 'aria-label': 'Virtual nodes per server' }, '<span class="small">Virtual nodes per server</span>');
    const vnBtns = sim.VNODES.map((v) => {
      const b = el('button', { class: 'chip', type: 'button', 'data-vn': v }, String(v));
      b.addEventListener('click', () => setVn(v));
      vnRow.appendChild(b);
      return b;
    });
    const run = el('button', { class: 'btn go', type: 'button', id: 'rg-run' }, 'Run');
    run.addEventListener('click', runVn);
    vnRow.appendChild(run);
    const vnOut = el('div', { class: 'rg-vnout', id: 'rg-vnout' });
    p3.append(vnRow, vnOut);
    stage.append(status, keyCard, p1, p2, p3);

    const flow = makeFlow(api, meta, INFO, (t) => {
      if (t <= 1) mod = sim.createModulo(t);
      if (t === 2) ring = sim.createRing();
      if (t === 3) { vn = 1; vnSolved = false; vnOut.innerHTML = ''; }
    }, render);

    // ---------- drawing ----------
    function ringPicture(servers: { id: string; pos: number }[], keys: { k: string; pos: number; hl: boolean }[], scale: number, arcs = false): string {
      const C = 110, R = 84;
      const pt = (pos: number, r = R) => {
        const a = (pos / scale) * 2 * Math.PI - Math.PI / 2;
        return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
      };
      let s = `<svg viewBox="0 0 220 220"><circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="var(--line)" stroke-width="3"/>`;
      if (arcs) {
        const sorted = [...servers].sort((a, b) => a.pos - b.pos);
        sorted.forEach((p, i) => {
          const prev = i === 0 ? sorted[sorted.length - 1].pos - scale : sorted[i - 1].pos;
          const a0 = pt(prev), a1 = pt(p.pos);
          const large = p.pos - prev > scale / 2 ? 1 : 0;
          s += `<path d="M${a0.x},${a0.y} A${R},${R} 0 ${large} 1 ${a1.x},${a1.y}" fill="none" stroke="${COLORS[p.id]}" stroke-width="10"/>`;
        });
      }
      for (let t = 0; t < scale; t += scale / 4) {
        const p = pt(t, R + 16);
        s += `<text x="${p.x}" y="${p.y + 4}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="9" fill="var(--muted)">${t}</text>`;
      }
      for (const k of keys) {
        const p = pt(k.pos, R - 13);
        s += `<circle cx="${pt(k.pos).x}" cy="${pt(k.pos).y}" r="4" fill="${k.hl ? 'var(--accent)' : 'var(--append)'}"/><text x="${p.x}" y="${p.y + 3}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="8" fill="var(--ink)">${k.k.split(':')[1]}</text>`;
      }
      if (!arcs) for (const sv of servers) {
        const p = pt(sv.pos);
        s += `<circle cx="${p.x}" cy="${p.y}" r="10" fill="${COLORS[sv.id]}"/><text x="${p.x}" y="${p.y + 4}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" font-weight="600" fill="#fff">${sv.id}</text>`;
      }
      return s + '</svg>';
    }

    function render() {
      const t = flow.task;
      p1.hidden = t > 1;
      p2.hidden = t !== 2;
      p3.hidden = t !== 3;
      keyCard.hidden = t === 3;
      const s1 = stage.querySelector('#rg-s1')!, s2 = stage.querySelector('#rg-s2')!;
      if (t <= 1) {
        add.hidden = t === 0 || mod.added;
        const n = mod.n;
        srvBtns.forEach((b, i) => {
          b.hidden = i >= n;
          const ks = sim.KEYS.filter((k) => mod.home[k] === i && !mod.queue.includes(k));
          b.querySelector('.keys')!.innerHTML = ks.map((k) => `<span class="${mod.added && mod.before[k] !== i ? 'moved' : ''}">${esc(k)}</span>`).join('');
          b.setAttribute('aria-label', `Server S${i}${ks.length ? ', holds ' + ks.join(', ') : ''}. Activate to place the current key here.`);
        });
        const k = mod.queue[0];
        keyCard.innerHTML = k ? `Place <b>${esc(k)}</b>: hash = <b>${sim.hash100(k)}</b>, ${sim.hash100(k)} mod ${n} = ?` : t === 1 && !mod.added ? 'All keys placed with hash mod 3. Now add a server.' : '';
        s1.innerHTML = `servers <b>${n}</b> · rule <b>hash mod ${n}</b>`;
        s2.innerHTML = mod.added ? `keys moved <b>${mod.moved}/${sim.KEYS.length}</b>` : '';
        flow.progress(t === 1 ? (mod.added ? `Re-placed: ${sim.KEYS.length - mod.queue.length} / ${sim.KEYS.length} · moved: ${mod.moved}` : 'Add the new server.') : '');
      } else if (t === 2) {
        const placed = sim.KEYS.filter((k) => ring.home[k]).map((k) => ({ k, pos: sim.hash100(k), hl: ring.found.has(k) }));
        ringSvg.innerHTML = ringPicture(ring.servers, placed, sim.RING);
        rsBtns.forEach((b) => {
          const sv = ring.servers.find((x) => x.id === b.dataset.rsrv);
          b.hidden = !sv;
          if (sv) b.querySelector('span')!.textContent = `at ${sv.pos}`;
        });
        rsRow.hidden = ring.added;
        moverRow.hidden = !ring.added;
        keyBtns.forEach((b) => b.setAttribute('aria-pressed', String(ring.found.has(b.dataset.key!))));
        const k = ring.queue[0];
        keyCard.innerHTML = k ? `Place <b>${esc(k)}</b>: hash = <b>${sim.hash100(k)}</b>. Which server is next clockwise?` : `Server <b>D</b> joined at <b>${sim.NEW_SERVER.pos}</b>. Click every key that now belongs to D.`;
        s1.innerHTML = `servers <b>${ring.servers.map((s) => s.id).join(', ')}</b>`;
        s2.innerHTML = ring.added ? `keys moved <b>${ring.found.size}</b> of ${sim.KEYS.length}` : '';
        flow.progress(ring.added ? `Movers found: ${ring.found.size} / ${ring.movers.size}` : `Placed: ${sim.KEYS.length - ring.queue.length} / ${sim.KEYS.length}`);
      } else {
        vnBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.vn) === vn)));
        s1.innerHTML = `virtual nodes <b>${vn}</b> per server`;
        s2.innerHTML = `goal <b>≤ ${sim.BALANCE_GOAL}× fair share</b>`;
        flow.progress('Run when ready.');
      }
      if (!flow.coachBetween() && flow.phase === 'play') api.coach.say(...coachLine());
    }

    function coachLine(): [string, 'act' | 'watch'] {
      const t = flow.task;
      if (t === 1) {
        if (!mod.added) return ['Click <b>Add server S3</b>.', 'act'];
        const k = mod.queue[0];
        if (!k) return ['All keys placed.', 'watch'];
        return [`<b>${k}</b> has hash ${sim.hash100(k)}. Click server S(${sim.hash100(k)} mod 4).`, 'act'];
      }
      if (t === 2) {
        const k = ring.queue[0];
        return k ? [`<b>${k}</b> is at ${sim.hash100(k)} on the ring. Click the next server clockwise.`, 'act'] : ['Click each key that moves to D (only keys between the previous server and 62).', 'act'];
      }
      if (t === 3) return ['Pick how many virtual nodes each server gets, then press <b>Run</b>.', 'act'];
      return ['', 'watch'];
    }

    // ---------- actions ----------
    function clickModulo(i: number) {
      if (flow.guard()) return;
      if (flow.task > 1) return;
      if (flow.phase === 'tutorial') {
        const want = api.coach.step === 'k0' ? 0 : 1;
        if (i !== want) return api.toast('Tutorial: click the highlighted server.');
      }
      if (flow.task === 1 && !mod.added) return api.toast('First click Add server S3.');
      api.move();
      const r = sim.placeModulo(mod, i);
      if (!r) return;
      if (!r.ok) {
        api.mistake('wrong server', srvBtns[i]);
        api.toast(`${r.key}: ${sim.hash100(r.key)} mod ${mod.n} = ${r.want}, so it lives on S${r.want}.`);
        return;
      }
      api.hit(r.moved ? 'moved!' : 'stays', srvBtns[i]);
      if (flow.phase === 'tutorial') api.coach.did(api.coach.step!);
      render();
      if (flow.task === 1 && sim.moduloDone(mod)) {
        api.toast(`${mod.moved} of ${sim.KEYS.length} keys had to move to a different server.`);
        flow.done();
      }
    }

    function doAdd() {
      if (flow.guard()) return;
      if (flow.task !== 1 || mod.added) return;
      api.move();
      sim.addServer(mod);
      api.toast('S3 is up. N is now 4, so every key’s home is hash mod 4.');
      render();
    }

    function clickRingServer(id: string) {
      if (flow.guard()) return;
      if (flow.task !== 2) return;
      api.move();
      const b = rsBtns.find((x) => x.dataset.rsrv === id)!;
      const r = sim.placeRing(ring, id);
      if (!r) return;
      if (!r.ok) {
        api.mistake('not clockwise', b);
        api.toast(`${r.key} is at ${sim.hash100(r.key)}. Going clockwise from there, the first server you meet is ${r.want}.`);
        return;
      }
      api.hit(undefined, b);
      if (ring.added) api.toast(`All placed. Server D joins the ring at ${sim.NEW_SERVER.pos}.`);
      render();
    }

    function clickMover(k: string) {
      if (flow.guard()) return;
      if (flow.task !== 2 || !ring.added) return;
      api.move();
      const b = keyBtns[sim.KEYS.indexOf(k)];
      const r = sim.pickMover(ring, k);
      if (r === 'again') return api.toast('Already moved.');
      if (r === 'stays') {
        api.mistake('stays put', b);
        api.toast(`${k} (at ${sim.hash100(k)}) still has the same next-clockwise server. Only keys just before 62 change hands.`);
        return;
      }
      api.hit('moves to D', b);
      render();
      if (sim.ringDone(ring)) {
        api.toast(`Only ${ring.movers.size} of ${sim.KEYS.length} keys moved. With hash mod N it was 6.`);
        flow.done();
      }
    }

    function setVn(v: number) {
      if (flow.guard()) return;
      if (flow.task !== 3) return;
      vn = v;
      render();
    }

    async function runVn() {
      if (flow.guard()) return;
      if (flow.task !== 3 || vnSolved) return;
      if (replayBusy()) return api.toast('Watch first.');
      api.move();
      const sh = sim.shares(vn);
      const imb = sim.imbalance(vn);
      vnOut.innerHTML = '';
      await predictAndReveal(api, vnOut, {
        title: 'Placing the points',
        simMs: 1000,
        realMs: 1500,
        predict: { q: `Each server gets ${vn} point${vn > 1 ? 's' : ''} on the ring. Will the biggest server own close to a fair third?`, options: ['Yes, close to a third each', 'No, one server owns far more'], answer: sim.balanced(vn) ? 0 : 1, why: sim.balanced(vn) ? 'Many random points per server average out the gaps between them.' : 'With few points, the gaps between them are random, and one server ends up with a huge gap.' },
      });
      vnOut.innerHTML = `<div class="rg-vnring">${ringPicture(sim.vnodePositions(vn), [], sim.VN_RING, true)}</div>
        <div class="rg-shares">${sim.VN_SERVERS.map((s) => `<div class="mrow"><span><b style="color:${COLORS[s]}">${s}</b> owns</span><span class="rg-bar"><i style="width:${(sh[s] * 100).toFixed(1)}%;background:${COLORS[s]}"></i></span><span>${(sh[s] * 100).toFixed(0)}%</span></div>`).join('')}
        <div class="mrow"><span>Biggest share vs fair (33%)</span><span class="${imb <= sim.BALANCE_GOAL ? 'ok-pill' : 'bad-pill'}" id="rg-imb">${imb.toFixed(2)}×</span></div></div>`;
      if (sim.balanced(vn)) {
        vnSolved = true;
        api.hit('balanced', run);
        return flow.done();
      }
      api.mistake('lopsided', run);
      api.toast(`${imb.toFixed(2)}×: one server still owns far more than a third. More points per server average the gaps out.`);
      render();
    }

    render();
    return () => flow.dispose();
  },
};
