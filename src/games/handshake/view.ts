/** Handshake view. All buttons are built once; the ladder diagram (not interactive) is redrawn after each packet. */
import { el, esc, onPress, setText } from '../../lib/dom';
import { mulberry32 } from '../../lib/rng';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

type Phase = 'pre' | 'tutorial' | 'play' | 'between' | 'done';

const INFO = [
  { h: 'Tutorial: your first connection', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'Both sides of the handshake', p: 'Open <b>4 connections</b>. In some you are the client, in some the server. Read the ladder: what did the other side just send, and what is your reply?' },
  { h: 'A packet went missing', p: 'The sender sent 6 segments; one was lost on the way. The receiver’s ACKs say which byte it still needs. Click that segment to resend it. <b>3 rounds.</b>' },
  { h: 'Out of order', p: 'Five segments arrived, shuffled. The app must get the bytes in order. Click them in sequence order. <b>2 rounds.</b>' },
  { h: 'The RTT tax', p: `A page needs <b>20 requests</b>. Each round trip takes ${sim.RTT} ms, and every new connection costs 2 round trips of handshakes. Change the settings and load the page under <b>800 ms</b>, then under <b>400 ms</b>.` },
];

const PKT_COLOR: Record<sim.Pkt, string> = { SYN: 'var(--vote)', 'SYN-ACK': 'var(--ok)', ACK: 'var(--append)', DATA: 'var(--ink)', FIN: 'var(--muted)' };
const TUTORIAL_STEP: Partial<Record<sim.Pkt, string>> = { SYN: 'syn', ACK: 'ack', DATA: 'data' };
const SVG_NS = 'http://www.w3.org/2000/svg';

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    const rng = mulberry32(api.seed);
    let task = 0;
    let phase: Phase = 'pre';
    let hs = sim.createHandshake(0, rng);
    let loss = sim.makeLoss(rng);
    let lossRound = 0;
    let order = sim.makeOrder(rng);
    let orderRound = 0;
    const opts: sim.LoadOpts = { keepAlive: false, parallel: 1, http2: false };
    let goal = 0;
    let betweenT = 0;

    // ---------- build once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span id="hs-s1"></span><span id="hs-s2"></span>`);
    // A: ladder + packet buttons
    const panelA = el('div', { class: 'hs-panel' });
    const ladderHead = el('div', { class: 'hs-head' }, `<span>Client</span><span id="hs-role" class="hs-role"></span><span>Server</span>`);
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'hs-ladder');
    svg.setAttribute('viewBox', '0 0 400 260');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Ladder diagram of packets between client and server');
    const note = el('p', { class: 'hs-note', id: 'hs-note', 'aria-live': 'polite' });
    const pktRow = el('div', { class: 'hs-pkts', role: 'group', 'aria-label': 'Packet to send' });
    const pktBtns = sim.PKTS.map((p) => {
      const b = el('button', { class: 'hs-pkt', type: 'button', 'data-pkt': p, style: `--c:${PKT_COLOR[p]}` }, p);
      onPress(b, () => sendPkt(p));
      pktRow.appendChild(b);
      return b;
    });
    panelA.append(ladderHead, svg, note, pktRow);
    // B: lost segment
    const panelB = el('div', { class: 'hs-panel', hidden: true });
    panelB.innerHTML = `<p class="eyebrow">Sender buffer (click to resend)</p>`;
    const segRow = el('div', { class: 'hs-segs' });
    const segBtns = Array.from({ length: 6 }, (_, i) => {
      const b = el('button', { class: 'hs-seg', type: 'button', 'data-seg': i }, `<b>${sim.seqOf(i)}</b><span class="st"></span>`);
      onPress(b, () => clickSeg(i));
      segRow.appendChild(b);
      return b;
    });
    const ackRow = el('div', { class: 'hs-acks', id: 'hs-acks' });
    panelB.append(segRow, el('p', { class: 'eyebrow', style: 'margin-top:12px' }, 'ACKs coming back from the receiver'), ackRow);
    // C: out of order
    const panelC = el('div', { class: 'hs-panel', hidden: true });
    panelC.innerHTML = `<p class="eyebrow">Arrived at the receiver (click in byte order)</p>`;
    const arrRow = el('div', { class: 'hs-segs' });
    const arrBtns = Array.from({ length: 5 }, (_, k) => {
      const b = el('button', { class: 'hs-seg', type: 'button', 'data-arr': k }, `<b></b><span class="st"></span>`);
      onPress(b, () => clickArrived(k));
      arrRow.appendChild(b);
      return b;
    });
    const appRow = el('div', { class: 'hs-app', id: 'hs-app' });
    panelC.append(arrRow, el('p', { class: 'eyebrow', style: 'margin-top:12px' }, 'Delivered to the app'), appRow);
    // D: RTT tax
    const panelD = el('div', { class: 'hs-panel', hidden: true });
    const ctl = el('div', { class: 'row' });
    const ka = el('button', { class: 'chip', type: 'button', id: 'hs-ka', 'aria-pressed': 'false' }, 'Keep-alive');
    const h2 = el('button', { class: 'chip', type: 'button', id: 'hs-h2', 'aria-pressed': 'false' }, 'HTTP/2');
    const parBtns = ([1, 2, 6] as const).map((n) => el('button', { class: 'chip', type: 'button', 'data-par': n, 'aria-pressed': String(n === 1) }, `${n} conn${n > 1 ? 's' : ''}`));
    const load = el('button', { class: 'btn go', type: 'button', id: 'hs-load' }, 'Load page');
    ctl.append(ka, ...parBtns, h2, load);
    const res = el('div', { class: 'hs-res', id: 'hs-res' });
    panelD.append(el('p', { class: 'eyebrow' }, 'Browser settings'), ctl, res);
    ka.addEventListener('click', () => toggleOpt('keepAlive'));
    h2.addEventListener('click', () => toggleOpt('http2'));
    parBtns.forEach((b) => b.addEventListener('click', () => setPar(Number(b.dataset.par) as 1 | 2 | 6)));
    load.addEventListener('click', loadPage);
    stage.append(status, panelA, panelB, panelC, panelD);

    // ---------- drawing ----------
    function drawLadder() {
      const rows = hs.ladder.slice(-7);
      svg.innerHTML = `<defs><marker id="hsa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="context-stroke"/></marker></defs>
        <line x1="50" y1="0" x2="50" y2="260" stroke="var(--line)" stroke-width="2"/><line x1="350" y1="0" x2="350" y2="260" stroke="var(--line)" stroke-width="2"/>`;
      rows.forEach((p, i) => {
        const y = 14 + i * 35;
        if (p.sep) {
          svg.insertAdjacentHTML('beforeend', `<line x1="40" y1="${y + 12}" x2="360" y2="${y + 12}" stroke="var(--muted)" stroke-dasharray="4 5"/><text x="200" y="${y + 8}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" fill="var(--muted)">${esc(p.note)}</text>`);
          return;
        }
        const ltr = p.from === 'client';
        const [x1, x2] = ltr ? [52, 348] : [348, 52];
        const col = p.bad ? 'var(--bad)' : PKT_COLOR[p.pkt];
        const last = i === rows.length - 1;
        svg.insertAdjacentHTML(
          'beforeend',
          `<g class="${last ? 'hs-new' : ''}"><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y + 22}" stroke="${col}" stroke-width="${last ? 3 : 2}" marker-end="url(#hsa)"${p.bad ? ' stroke-dasharray="5 4"' : ''}/>
           <text x="200" y="${y + 6}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="12" font-weight="600" fill="${col}">${p.pkt}${p.bad ? ' ✕ RST' : ''}</text></g>`,
        );
      });
      const lastReal = [...hs.ladder].reverse().find((p) => !p.sep);
      note.textContent = lastReal ? lastReal.note : 'Nothing sent yet.';
    }

    function render() {
      panelA.hidden = task > 1;
      panelB.hidden = task !== 2;
      panelC.hidden = task !== 3;
      panelD.hidden = task !== 4;
      const s1 = stage.querySelector('#hs-s1')!, s2 = stage.querySelector('#hs-s2')!;
      if (task <= 1) {
        const r = sim.role(hs);
        setText(stage.querySelector('#hs-role')!, r ? `you are the ${r}` : 'all open');
        s1.innerHTML = `connection <b>${Math.min(hs.ci + 1, hs.roles.length)}/${hs.roles.length}</b>`;
        s2.innerHTML = `open <b>${hs.opened}</b>`;
        drawLadder();
      } else if (task === 2) {
        s1.innerHTML = `round <b>${Math.min(lossRound + 1, 3)}/3</b>`;
        s2.innerHTML = `RTT <b>${sim.RTT} ms</b>`;
        segBtns.forEach((b, i) => {
          b.classList.toggle('lost', i === loss.dropped);
          b.querySelector('.st')!.textContent = i === loss.dropped ? '✕ lost' : '✓ arrived';
          b.setAttribute('aria-label', `Resend segment starting at byte ${sim.seqOf(i)}`);
        });
        ackRow.innerHTML = loss.acks.map((a, i) => `<span class="ack${i > 0 && a === loss.acks[i - 1] ? ' dup' : ''}">ACK ${a}</span>`).join('');
      } else if (task === 3) {
        s1.innerHTML = `round <b>${Math.min(orderRound + 1, 2)}/2</b>`;
        s2.innerHTML = `delivered <b>${order.delivered}/5</b>`;
        arrBtns.forEach((b, k) => {
          const seg = order.arrived[k];
          b.querySelector('b')!.textContent = `seq ${sim.seqOf(seg)}`;
          b.classList.toggle('used', seg < order.delivered);
          b.querySelector('.st')!.textContent = seg < order.delivered ? 'delivered' : 'waiting';
          b.setAttribute('aria-label', `Deliver the segment starting at byte ${sim.seqOf(seg)}`);
        });
        appRow.innerHTML = Array.from({ length: order.delivered }, (_, i) => `<span class="ack">${sim.seqOf(i)}–${sim.seqOf(i + 1) - 1}</span>`).join('') || '<span class="small">nothing yet</span>';
      } else {
        s1.innerHTML = `goal <b>under ${sim.GOALS[Math.min(goal, 1)]} ms</b>`;
        s2.innerHTML = `RTT <b>${sim.RTT} ms</b> · ${sim.REQUESTS} requests`;
        ka.setAttribute('aria-pressed', String(opts.keepAlive));
        h2.setAttribute('aria-pressed', String(opts.http2));
        parBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.par) === opts.parallel)));
      }
      const prog = api.side.querySelector('#hs-prog');
      if (prog) prog.textContent = task <= 1 ? `Connections open: ${hs.opened} / ${hs.roles.length}` : task === 2 ? `Recovered: ${lossRound} / 3` : task === 3 ? `Messages reassembled: ${orderRound} / 2` : `Goals met: ${goal} / 2`;
      if (phase === 'play') api.coach.say(...coachLine());
      if (phase === 'between') api.coach.say('Task clear! Read the lesson; press Next above.', 'watch');
    }

    function coachLine(): [string, 'act' | 'watch'] {
      if (task === 1) {
        const r = sim.role(hs);
        const last = [...hs.ladder].reverse().find((p) => !p.sep && !p.bad);
        if (!r) return ['', 'watch'];
        if (r === 'client' && hs.step === 0) return ['You are the <b>client</b>. Start the connection.', 'act'];
        return [`You are the <b>${r}</b>. The ${r === 'client' ? 'server' : 'client'} just sent <b>${last?.pkt}</b>. What do you send back?`, 'act'];
      }
      if (task === 2) return ['The receiver keeps sending the same ACK number. Which segment is it still waiting for? Click it to resend.', 'act'];
      if (task === 3) return [`Deliver bytes in order. Next, the app needs the segment starting at byte <b>${sim.seqOf(order.delivered)}</b>.`, 'act'];
      if (task === 4) return [`Get the page under <b>${sim.GOALS[goal]} ms</b>: change the settings, then press <b>Load page</b>.`, 'act'];
      return ['', 'watch'];
    }

    function renderSide() {
      const t = INFO[task];
      api.side.innerHTML = `<p class="eyebrow">${task === 0 ? 'Tutorial' : `Task ${task + 1} of ${meta.tasks.length}`}</p><h2>${t.h}</h2><p style="margin:0">${t.p}</p><div class="progress" id="hs-prog"></div>`;
    }

    // ---------- flow ----------
    function startTask(t: number) {
      task = t;
      phase = t === 0 ? 'tutorial' : 'play';
      if (t <= 1) hs = sim.createHandshake(t, rng);
      if (t === 2) { loss = sim.makeLoss(rng); lossRound = 0; }
      if (t === 3) { order = sim.makeOrder(rng); orderRound = 0; }
      if (t === 4) { goal = 0; res.innerHTML = ''; }
      renderSide();
      render();
    }
    function taskDone() {
      api.task(task);
      if (task >= meta.tasks.length - 1) { phase = 'done'; render(); return; }
      phase = 'between';
      render();
      { const next = task + 1; api.ready(next, () => startTask(next)); }
    }
    function guard(): boolean {
      if (phase === 'pre') { api.toast('Press Start first. It is in the brief, and above the game.'); return true; }
      if (phase === 'done') { api.toast('All tasks done. Press Play again to start a new run.'); return true; }
      if (phase === 'between') { api.toast('Task done. Press Next above to go on.'); return true; }
      return false;
    }

    function sendPkt(p: sim.Pkt) {
      if (guard()) return;
      if (task > 1) return api.toast('This task does not use the packet buttons.');
      const want = sim.expectedPkt(hs, task);
      if (phase === 'tutorial' && p !== want) return api.toast(`Tutorial: click ${want} (highlighted).`);
      const b = pktBtns[sim.PKTS.indexOf(p)];
      api.move();
      const r = sim.send(hs, task, p);
      if (!r.ok) {
        api.mistake('RST', b);
        api.toast(r.msg);
      } else {
        api.hit(r.opened ? 'connected' : undefined, b);
        if (phase === 'tutorial') api.coach.did(TUTORIAL_STEP[p]!);
      }
      render();
      if (task === 1 && sim.hsDone(hs)) taskDone();
    }

    function clickSeg(i: number) {
      if (guard()) return;
      if (task !== 2) return api.toast('The sender buffer is used in the lost-packet task.');
      api.move();
      const r = sim.resend(loss, i);
      if (!r.ok) {
        api.mistake('wrong segment', segBtns[i]);
        api.toast(r.msg);
        return;
      }
      api.hit('recovered', segBtns[i]);
      api.toast(r.msg);
      lossRound++;
      if (lossRound >= 3) return taskDone();
      loss = sim.makeLoss(rng);
      render();
    }

    function clickArrived(k: number) {
      if (guard()) return;
      if (task !== 3) return api.toast('These segments are used in the out-of-order task.');
      const seg = order.arrived[k];
      api.move();
      const r = sim.deliver(order, seg);
      if (!r.ok) {
        api.mistake('out of order', arrBtns[k]);
        api.toast(r.msg);
        return;
      }
      api.hit(undefined, arrBtns[k]);
      if (sim.orderDone(order)) {
        orderRound++;
        if (orderRound >= 2) { render(); return taskDone(); }
        api.toast('Message reassembled. Here comes another one.');
        order = sim.makeOrder(rng);
      }
      render();
    }

    function optGuard(): boolean {
      if (guard()) return true;
      if (task !== 4) { api.toast('Browser settings are used in the last task.'); return true; }
      return false;
    }
    function toggleOpt(k: 'keepAlive' | 'http2') {
      if (optGuard()) return;
      opts[k] = !opts[k];
      if (k === 'http2' && opts.http2) opts.keepAlive = true;
      render();
    }
    function setPar(n: 1 | 2 | 6) {
      if (optGuard()) return;
      opts.parallel = n;
      render();
    }
    function loadPage() {
      if (optGuard()) return;
      api.move();
      const r = sim.loadPage(opts);
      const total = Math.max(r.ms, 400);
      res.innerHTML = `<div class="hs-ms"><b id="hs-ms">${r.ms} ms</b> <span class="small">${esc(r.explain)}</span></div>` +
        `<div class="hs-lanes">${r.lanes
          .map((l) => `<div class="hs-lane">${l.blocks.map((b) => `<span class="blk ${b.kind}" style="left:${(100 * b.start) / total}%;width:${(100 * b.len) / total}%" title="${b.kind === 'hs' ? 'handshakes' : b.n + ' request' + (b.n > 1 ? 's' : '')}"></span>`).join('')}</div>`)
          .join('')}</div><div class="small"><span class="blk-key hs"></span> handshakes <span class="blk-key req"></span> requests</div>`;
      if (r.ms < sim.GOALS[goal]) {
        api.hit(`${r.ms} ms`, load);
        goal++;
        if (goal >= sim.GOALS.length) return taskDone();
        api.toast(`Under 800 ms! Now get it under 400 ms.`);
      } else {
        api.mistake('too slow', load);
        api.toast(`${r.ms} ms: still over ${sim.GOALS[goal]} ms. Look at the bars: where does the time go?`);
      }
      render();
    }

    api.onBegin(() => {
      startTask(0);
      api.coach.tutorial(meta.walkthrough, () => {
        api.task(0);
        phase = 'between';
        render();
        api.ready(1, () => startTask(1));
      });
    });

    render();
    return () => clearTimeout(betweenT);
  },
};
