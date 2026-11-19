/** Saga view. Turn-based: service rows and buttons are built once; render updates text and classes. */
import { el, onPress, setText } from '../../lib/dom';
import { makeFlow } from '../flow';
import { predictAndReveal, replayBusy } from '../replay';
import type { Game, GameApi } from '../types';
import { meta } from './meta';
import * as sim from './sim';

const INFO = [
  { h: 'Tutorial: two steps', p: 'Follow the highlighted steps. The clock starts after the tutorial.' },
  { h: 'Book the trips', p: `Run each step in order: flight, hotel, car, payment. If a service fails, read why. A slow service may only have <b>timed out</b>. <b>${sim.BOOK_TRIPS.length} trips.</b>` },
  { h: 'When a step fails for good', p: 'These trips will fail partway. The services that already succeeded have committed, so there is no rollback. Run the <b>Undo</b> (compensating action) for every step that succeeded, in the right order.' },
  { h: 'The confirmation email', p: `After a trip is booked, the booking service publishes a <b>TripBooked</b> event; the email service sends the confirmation. Services crash now and then. Pick a design and press <b>Run ${sim.BOOKINGS} bookings</b>. Goal: no lost emails, no emails for trips that don’t exist, no duplicates.` },
];

export const game: Game = {
  mount(stage: HTMLElement, api: GameApi) {
    let s = sim.createSaga(sim.TUTORIAL_TRIP);
    let trips: sim.Trip[] = [sim.TUTORIAL_TRIP];
    let ti = 0;
    let design: sim.Design = 'commit-publish';
    let dedupe = false;
    const log: string[] = [];

    // ---------- build once ----------
    stage.innerHTML = '';
    const status = el('div', { class: 'statusbar' }, `<span id="sg-s1"></span><span id="sg-s2"></span>`);
    const p1 = el('div', { class: 'sg-panel' });
    const trip = el('div', { class: 'sg-trip', id: 'sg-trip', 'aria-live': 'polite' });
    const rows = sim.STEPS.map((st, i) => {
      const r = el('div', { class: 'sg-row', 'data-step': st.id }, `<span class="sg-n">${i + 1}</span><div class="sg-svc"><b>${st.svc}</b><span class="small sg-st"></span></div>`);
      const d = el('button', { class: 'btn ghost as-btn sg-do', type: 'button', 'data-do': i }, st.do);
      const u = el('button', { class: 'btn ghost as-btn sg-undo', type: 'button', 'data-undo': i }, st.undo);
      onPress(d, () => doIt(i));
      onPress(u, () => undoIt(i));
      const g = el('div', { class: 'row sg-acts' });
      g.append(d, u);
      r.appendChild(g);
      return { r, d, u };
    });
    const feed = el('div', { class: 'feed' });
    const feedLines = Array.from({ length: 4 }, () => feed.appendChild(el('div')));
    p1.append(trip, ...rows.map((x) => x.r), feed);

    const p2 = el('div', { class: 'sg-panel', hidden: true });
    const dRow = el('div', { class: 'sg-designs', role: 'group', 'aria-label': 'Design' });
    const dBtns = sim.DESIGNS.map((d) => {
      const b = el('button', { class: 'sg-design', type: 'button', 'data-design': d.id, 'aria-pressed': 'false' }, `<b>${d.label}</b><span class="small">${d.detail}</span>`);
      b.addEventListener('click', () => setOpt(() => (design = d.id)));
      dRow.appendChild(b);
      return b;
    });
    const dd = el('button', { class: 'chip', type: 'button', id: 'sg-dedupe', 'aria-pressed': 'false' }, 'Email service skips event ids it has already handled');
    dd.addEventListener('click', () => setOpt(() => (dedupe = !dedupe)));
    const run = el('button', { class: 'btn go', type: 'button', id: 'sg-run' }, `Run ${sim.BOOKINGS} bookings`);
    run.addEventListener('click', runIt);
    const res = el('div', { class: 'as-res', id: 'sg-res' });
    p2.append(dRow, dd, run, res);
    stage.append(status, p1, p2);

    const flow = makeFlow(api, meta, INFO, (t) => {
      log.length = 0;
      ti = 0;
      if (t === 0) trips = [sim.TUTORIAL_TRIP];
      if (t === 1) trips = sim.BOOK_TRIPS;
      if (t === 2) trips = sim.FAIL_TRIPS;
      if (t <= 2) s = sim.createSaga(trips[0]);
      if (t === 3) { design = 'commit-publish'; dedupe = false; res.innerHTML = ''; }
    }, render);

    // ---------- render ----------
    function render() {
      const t = flow.task;
      p1.hidden = t > 2;
      p2.hidden = t !== 3;
      const s1 = stage.querySelector('#sg-s1')!, s2 = stage.querySelector('#sg-s2')!;
      if (t <= 2) {
        trip.innerHTML = `<p class="eyebrow">${t === 0 ? 'Tutorial trip' : `Trip ${Math.min(ti + 1, trips.length)} of ${trips.length}`}</p><p><b>${s.trip.who}</b> → ${s.trip.where}</p>`;
        rows.forEach((x, i) => {
          const st = s.status[i];
          x.r.className = `sg-row ${st}`;
          const f = s.trip.fail;
          setText(x.r.querySelector('.sg-st')!, st === 'done' ? 'committed ✓' : st === 'failed' ? `failed: ${f?.reason ?? ''}` : st === 'undone' ? 'compensated (undone)' : s.attempts[i] ? '' : 'not started');
        });
        s1.innerHTML = `trip <b>${Math.min(ti + 1, trips.length)}/${trips.length}</b>`;
        s2.innerHTML = `done <b>${s.status.filter((x) => x === 'done').length}</b> · undone <b>${s.status.filter((x) => x === 'undone').length}</b>`;
        feedLines.forEach((d, i) => setText(d, log[i] ?? ''));
        flow.progress(t ? `Trips: ${ti} / ${trips.length}` : '');
      } else {
        dBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.design === design)));
        dd.setAttribute('aria-pressed', String(dedupe));
        s1.innerHTML = `design <b>${sim.DESIGNS.find((d) => d.id === design)!.label}</b>`;
        s2.innerHTML = `dedupe <b>${dedupe ? 'on' : 'off'}</b>`;
        flow.progress('Run when ready.');
      }
      if (!flow.coachBetween() && flow.phase === 'play') api.coach.say(...coachLine());
    }

    function coachLine(): [string, 'act' | 'watch'] {
      const t = flow.task;
      if (t <= 2) {
        if (s.status.includes('failed') && !sim.permanentlyFailed(s)) return ['A service <b>timed out</b>. Retry it or undo everything?', 'act'];
        if (sim.permanentlyFailed(s)) return ['That step failed for good. <b>Undo</b> the steps that succeeded, in the right order.', 'act'];
        const n = s.status.findIndex((x) => x !== 'done');
        return [`Run the next step: <b>${sim.STEPS[Math.max(0, n)].do}</b>.`, 'act'];
      }
      if (t === 3) return ['Pick a design (and whether the email service deduplicates), then press <b>Run</b>.', 'act'];
      return ['', 'watch'];
    }

    // ---------- actions ----------
    function doIt(i: number) {
      if (flow.guard()) return;
      if (flow.task > 2) return api.toast('The trips are done. Pick an email design below.');
      if (flow.phase === 'tutorial') {
        const want = api.coach.step === 'flight' ? 0 : 1;
        if (i !== want) return api.toast(`Tutorial: click ${sim.STEPS[want].do} (highlighted).`);
        sim.doStep(s, i);
        api.hit('committed', rows[i].d);
        api.coach.did(want === 0 ? 'flight' : 'hotel');
        render();
        return;
      }
      api.move();
      const r = sim.doStep(s, i);
      if (!r.ok) {
        api.mistake(sim.permanentlyFailed(s) ? 'can’t continue' : 'out of order', rows[i].d);
        api.toast(r.why);
        return;
      }
      if (r.event === 'failed') {
        log.unshift(`✕ ${sim.STEPS[i].do}: ${r.why}`);
        api.toast(`${sim.STEPS[i].svc}: ${r.why}.`);
      } else {
        log.unshift(`✓ ${sim.STEPS[i].do}${s.attempts[i] > 1 ? ' (retry)' : ''}`);
        api.hit(s.attempts[i] > 1 ? 'retried!' : 'committed', rows[i].d);
      }
      if (r.event === 'booked') return finishTrip(`${s.trip.who}’s trip is booked.`);
      render();
    }

    function undoIt(i: number) {
      if (flow.guard()) return;
      if (flow.task > 2) return api.toast('The trips are done. Pick an email design below.');
      if (flow.phase === 'tutorial') return api.toast(`Tutorial: nothing to undo. Click ${api.coach.step === 'flight' ? 'Reserve flight' : 'Reserve hotel'} (highlighted).`);
      api.move();
      const r = sim.undoStep(s, i);
      if (!r.ok) {
        api.mistake('wrong undo', rows[i].u);
        api.toast(r.why);
        return;
      }
      log.unshift(`↩ ${sim.STEPS[i].undo}`);
      api.hit('compensated', rows[i].u);
      if (r.event === 'rolled back') return finishTrip(`${s.trip.who}’s trip is cleanly undone: no seat, no room, no charge.`);
      render();
    }

    function finishTrip(msg: string) {
      api.toast(msg);
      ti++;
      if (ti >= trips.length || flow.task === 0) {
        render();
        if (flow.task > 0) flow.done();
        return;
      }
      s = sim.createSaga(trips[ti]);
      log.unshift(`— next: ${s.trip.who} → ${s.trip.where}`);
      render();
    }

    function setOpt(f: () => void) {
      if (flow.guard()) return;
      if (flow.task < 3) return api.toast('Email designs unlock in the last task.');
      f();
      render();
    }

    async function runIt() {
      if (flow.guard()) return;
      if (flow.task < 3) return api.toast('Email designs unlock in the last task.');
      if (replayBusy()) return api.toast('Wait for this run.');
      api.move();
      const r = sim.runOutbox(design, dedupe);
      res.innerHTML = '';
      await predictAndReveal(api, res, {
        title: `${sim.BOOKINGS} bookings with crashes`,
        simMs: 1000,
        realMs: 1200,
        predict: { q: 'Services crash now and then. With this design, what goes wrong?', options: ['Some customers never get an email', 'Some get an email for a trip that was never saved', 'Some get the email twice', 'Nothing: exactly one email each'], answer: r.lost ? 0 : r.ghost ? 1 : r.dup ? 2 : 3, why: r.lost ? 'Save then publish: a crash in between saves the trip but never sends the event.' : r.ghost ? 'Publish then save: a crash in between announces a trip that never got saved.' : r.dup ? 'The outbox never loses or invents events, but after a crash the relay sends one again. The consumer must skip ids it has seen.' : 'Outbox (never lost) plus deduplication (never twice) = exactly once.' },
      });
      const pill = (n: number) => (n ? 'bad-pill' : 'ok-pill');
      res.innerHTML = `<div class="mrow"><span>Booked, but no email (lost event)</span><span class="${pill(r.lost)}" id="sg-lost">${r.lost}</span></div>
        <div class="mrow"><span>Email for a trip that was never saved</span><span class="${pill(r.ghost)}" id="sg-ghost">${r.ghost}</span></div>
        <div class="mrow"><span>Duplicate emails</span><span class="${pill(r.dup)}" id="sg-dup">${r.dup}</span></div>`;
      if (sim.outboxOk(r)) {
        api.hit('exactly once', run);
        return flow.done();
      }
      api.mistake('not yet', run);
      api.toast(r.lost ? `${r.lost} customers never got an email: the service crashed after saving but before publishing.`
        : r.ghost ? `${r.ghost} emails confirmed trips that were never saved: the service crashed after publishing but before saving.`
        : `${r.dup} customers got the email twice: the event was delivered again after a crash. Make the email service skip ids it has seen.`);
      render();
    }

    render();
    return () => flow.dispose();
  },
};
