import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';
import { hints, learn, pager } from './learn';

const mono = 'font-family="IBM Plex Mono, monospace" font-size="11"';
const gen = (x: number, y: number, label: string, col: string) =>
  `<circle cx="${x}" cy="${y}" r="22" style="fill:var(--panel);stroke:${col};stroke-width:2"/><text x="${x}" y="${y + 4}" text-anchor="middle" ${mono} style="fill:var(--ink)">${label}</text>`;
const msg = (x1: number, y1: number, x2: number, y2: number, label: string, col: string) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="stroke:${col};stroke-width:1.5" marker-end="url(#bzm-a)"/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 4}" text-anchor="middle" ${mono} style="fill:${col}">${label}</text>`;
const diagram = `<svg viewBox="0 0 520 200" role="img" aria-label="Four generals. The commander orders attack. Lieutenant L3 is a traitor and tells L1 the order was retreat. L1 hears attack, attack, retreat and takes the majority: attack.">
  <defs><marker id="bzm-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" style="fill:var(--muted)"/></marker></defs>
  ${gen(260, 34, 'C', 'var(--ok)')}${gen(100, 160, 'L1', 'var(--accent)')}${gen(260, 160, 'L2', 'var(--ok)')}${gen(420, 160, 'L3', 'var(--bad)')}
  ${msg(242, 50, 118, 142, 'attack', 'var(--ok)')}${msg(238, 160, 124, 160, 'C said attack', 'var(--ok)')}
  <path d="M398 172 Q260 215 124 172" style="fill:none;stroke:var(--bad);stroke-width:1.5" marker-end="url(#bzm-a)"/><text x="260" y="198" text-anchor="middle" ${mono} style="fill:var(--bad)">C said retreat (lie)</text>
  <text x="100" y="118" text-anchor="middle" ${mono} style="fill:var(--accent)">majority: attack</text>
</svg>`;

export const meta: GameMeta = {
  id: 'byzantine-generals',
  level: 8,
  title: 'Byzantine Generals',
  concept: 'Agreement with traitors: N ≥ 3f + 1',
  intro:
    'Generals surround a city and must all attack or all retreat; a half-hearted attack is a disaster. They talk only by messenger, and some of them are <b>traitors</b> who lie, and lie differently to different people. Computers fail like this too: a bug or an attacker can make a node send wrong, inconsistent messages. That is a <b>Byzantine fault</b>. How many traitors can loyal generals survive?',
  legend: [
    { color: 'var(--ok)', shape: 'square', label: 'Loyal general' },
    { color: 'var(--bad)', shape: 'square', label: 'Traitor' },
    { color: 'var(--accent)', shape: 'square', label: 'You' },
  ],
  howTo: [
    'A short tutorial shows you how to hear the other generals and decide. The clock starts after it.',
    'First you play the traitor among 3 generals and break them. Then you are loyal among 4. Then find the limit for 7.',
    'Breaking the 3, deciding correctly and finding the limit build a combo. Wrong calls cost points.',
  ],
  tasks: [
    'Tutorial: hear the relays, decide',
    'Be the traitor: break 3 generals, 3 times',
    'Be loyal among 4 generals: decide 4 times',
    'Seven generals: find the limit',
  ],
  lessons: [
    'Each lieutenant hears the commander’s order directly, plus what every other lieutenant says the commander told them. A loyal lieutenant passes on exactly what it heard.',
    'With 3 generals, 1 traitor always wins. A lieutenant who hears “attack” from the commander and “the commander said retreat” from the other lieutenant can’t tell which one is lying, so every rule it could use fails in one of the two cases. This is Lamport, Shostak and Pease’s impossibility result.',
    'With 4 generals, a lieutenant hears 3 reports and takes the <b>majority</b>. One traitor can spoil only one report, so the loyal lieutenants always end up with the same majority, and they follow a loyal commander. That is the Oral Messages algorithm, OM(1).',
    'Agreement survives f traitors only if <b>N ≥ 3f + 1</b>: 7 generals tolerate 2, and 3 traitors need 10. Byzantine-fault-tolerant protocols such as PBFT, Tendermint and HotStuff use quorums of 2f + 1 out of 3f + 1 so any two quorums share an honest node. Blockchains like Cosmos are built on them.',
  ],
  walkthrough: [
    { id: 'relay', target: '#bz-relay', text: 'You are lieutenant L1. The commander ordered you: attack. Click Hear the others to learn what L2 and L3 say the commander told them.' },
    { id: 'decide', target: '[data-decide="A"]', text: 'All three reports say attack. Take the majority: click Attack.' },
  ],
  minTimeMs: RULES['byzantine-generals'].minTimeMs,
  parMs: RULES['byzantine-generals'].parMs,
  pager,
  learn,
  hints,
  learnMore: {
    paragraphs: [
      'Lamport, Shostak and Pease (1982) proved that with spoken (unsigned) messages, no algorithm reaches agreement if a third or more of the generals are traitors: N must be at least 3f + 1. Their Oral Messages algorithm OM(f) achieves it with f + 1 rounds of relaying. With <b>signed</b> messages, which a traitor can’t forge, any number of traitors can be tolerated.',
      'Crash faults (a node just stops) need only N ≥ 2f + 1, which is why Raft and Paxos run on 3 or 5 servers. Byzantine faults need the extra third because a lying node can tell different nodes different things, and you can’t always tell who is lying.',
      'Practical Byzantine Fault Tolerance (Castro and Liskov, 1999) made this fast enough for real systems. Its descendants (Tendermint, HotStuff, which inspired Diem) run many blockchains. Inside one company’s data center, crash-fault protocols are usually enough.',
    ],
    diagram,
    caption: 'With 4 generals, one lie is outvoted: L1 takes the majority of 3 reports.',
    links: [
      { label: 'Lamport, Shostak and Pease: The Byzantine Generals Problem (TOPLAS 1982)', url: 'https://lamport.azurewebsites.net/pubs/byz.pdf' },
      { label: 'Castro and Liskov: Practical Byzantine Fault Tolerance (OSDI 1999)', url: 'https://pmg.csail.mit.edu/papers/osdi99.pdf' },
      { label: 'Yin et al.: HotStuff, BFT Consensus in the Lens of Blockchain (PODC 2019)', url: 'https://arxiv.org/abs/1803.05069' },
    ],
  },
};
