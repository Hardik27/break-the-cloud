/**
 * Byzantine Generals: agreement when some participants lie. Pure data and rules, no DOM.
 *
 * Tasks:
 *   0 tutorial   as a loyal lieutenant, hear the relays and decide
 *   1 break 3    you are the traitor among 3 generals: make the loyal ones disagree, whatever rule they use
 *   2 loyal of 4 with 4 generals and 1 traitor, decide by majority; all loyal lieutenants agree
 *   3 the limit  with 7 generals, find how many traitors break agreement, and the 3f + 1 rule
 */
export type V = 'A' | 'R';
export const WORD: Record<V, string> = { A: 'attack', R: 'retreat' };
export const flip = (v: V): V => (v === 'A' ? 'R' : 'A');

// ---------- task 1: three generals, you are the traitor ----------
export type Rule = 'trust' | 'conflict-retreat' | 'conflict-attack';
export const RULE_TEXT: Record<Rule, string> = {
  trust: 'Loyal lieutenants follow the commander’s order.',
  'conflict-retreat': 'Loyal lieutenants compare the commander’s order with what the other lieutenant says it heard. If they conflict, retreat.',
  'conflict-attack': 'New rule: if the two reports conflict, attack.',
};
export interface Round1 { you: 'C' | 'L2'; rule: Rule; order?: V }
export const ROUNDS1: Round1[] = [
  { you: 'C', rule: 'trust' },
  { you: 'L2', rule: 'conflict-retreat', order: 'A' },
  { you: 'L2', rule: 'conflict-attack', order: 'R' },
];

function lieutenantDecides(rule: Rule, direct: V, relay: V): V {
  if (rule === 'trust' || direct === relay) return direct;
  return rule === 'conflict-retreat' ? 'R' : 'A';
}

/**
 * Play a round. As the commander you pick the order for L1 and for L2; as lieutenant L2 you pick what you tell L1
 * the commander said. Returns each loyal general's action and whether they disagree.
 */
export function play1(r: Round1, pick: { toL1?: V; toL2?: V; relay?: V }): { actions: Record<string, V>; broken: boolean } {
  const actions: Record<string, V> = {};
  if (r.you === 'C') {
    const o1 = pick.toL1!, o2 = pick.toL2!;
    actions.L1 = lieutenantDecides(r.rule, o1, o2);
    actions.L2 = lieutenantDecides(r.rule, o2, o1);
  } else {
    actions.C = r.order!;
    actions.L1 = lieutenantDecides(r.rule, r.order!, pick.relay!);
  }
  const vals = Object.values(actions);
  return { actions, broken: vals.some((v) => v !== vals[0]) };
}

// ---------- tasks 0 and 2: four generals, you are loyal lieutenant L1 ----------
export type Gen = 'C' | 'L1' | 'L2' | 'L3';
export interface Round2 { traitor: Exclude<Gen, 'L1'>; direct: Record<'L1' | 'L2' | 'L3', V>; lie?: V }
export const TUTORIAL2: Round2 = { traitor: 'L3', direct: { L1: 'A', L2: 'A', L3: 'A' }, lie: 'A' };
export const ROUNDS2: Round2[] = [
  { traitor: 'L3', direct: { L1: 'A', L2: 'A', L3: 'A' }, lie: 'R' },
  { traitor: 'C', direct: { L1: 'A', L2: 'R', L3: 'A' } },
  { traitor: 'C', direct: { L1: 'A', L2: 'R', L3: 'R' } },
  { traitor: 'L2', direct: { L1: 'R', L2: 'R', L3: 'R' }, lie: 'A' },
];
const LTS = ['L1', 'L2', 'L3'] as const;

/** What lieutenant `me` hears: the commander's order to it, then what each other lieutenant says the commander said. */
export function heard(r: Round2, me: (typeof LTS)[number]): { from: Gen; v: V }[] {
  const out: { from: Gen; v: V }[] = [{ from: 'C', v: r.direct[me] }];
  for (const o of LTS) if (o !== me) out.push({ from: o, v: r.traitor === o ? r.lie! : r.direct[o] });
  return out;
}
export const majority = (vs: V[]): V => (vs.filter((v) => v === 'A').length * 2 > vs.length ? 'A' : 'R');
export const decide2 = (r: Round2, me: (typeof LTS)[number]): V => majority(heard(r, me).map((h) => h.v));
export const loyalLts = (r: Round2): (typeof LTS)[number][] => LTS.filter((l) => l !== r.traitor);

// ---------- task 3: seven generals ----------
export const N3 = 7;
export const tolerates = (n: number, f: number): boolean => n >= 3 * f + 1;
export const MAX_TRAITORS = Math.floor((N3 - 1) / 3);
export const NEED_FOR_3 = 3 * 3 + 1;
export const MAX_CHOICES = [1, 2, 3, 4];
export const NEED_CHOICES = [7, 9, 10, 12];

/** Each general acts once it hears from n − f generals (traitors may stay silent). Two such groups overlap in n − 2f. */
export function explainRun(n: number, f: number): string {
  const q = n - f, ov = n - 2 * f;
  if (tolerates(n, f)) return `Each general acts once ${q} of ${n} have spoken (traitors may stay silent). Any two such groups share ${ov} generals; only ${f} can be traitors, so at least one honest general is in both and the stories can’t split.`;
  return `Each general acts once ${q} of ${n} have spoken. Two such groups share only ${Math.max(ov, 0)} general${ov === 1 ? '' : 's'}, and ${f} traitors can fill all of them, telling each group a different story. The honest generals split.`;
}
