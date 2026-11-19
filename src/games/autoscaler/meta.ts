import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';
import { hints, learn, pager } from './learn';

const mono = 'font-family="IBM Plex Mono, monospace" font-size="11"';
const diagram = `<svg viewBox="0 0 520 200" role="img" aria-label="Traffic jumps sharply at noon. Reactive scaling adds capacity two minutes later, leaving a gap where users get errors. A scheduled pre-warm adds capacity before the jump.">
  <polyline points="20,150 140,140 200,140 200,50 330,50 330,140 500,140" style="fill:none;stroke:var(--bad);stroke-width:2.5"/>
  <polyline points="20,135 140,128 220,128 220,40 345,40 345,128 500,128" style="fill:none;stroke:var(--muted);stroke-width:2;stroke-dasharray:6 4"/>
  <polyline points="20,135 140,128 175,128 175,40 345,40 345,128 500,128" style="fill:none;stroke:var(--ok);stroke-width:2.5"/>
  <rect x="200" y="40" width="20" height="100" style="fill:var(--bad);opacity:.15"/>
  <text x="20" y="180" ${mono} style="fill:var(--bad)">traffic</text><text x="100" y="180" ${mono} style="fill:var(--muted)">reactive capacity (2 min late)</text><text x="330" y="180" ${mono} style="fill:var(--ok)">pre-warmed capacity</text>
  <text x="196" y="34" ${mono} style="fill:var(--ink)">12:00</text>
</svg>`;

export const meta: GameMeta = {
  id: 'autoscaler',
  level: 4,
  title: 'Autoscaler',
  concept: 'Scaling policies and cost',
  intro:
    'Cloud servers (<b>instances</b>) cost money every minute they run. Each one here handles <b>100 requests per second</b>; past that its CPU hits 100% and users get errors. <b>Autoscaling</b> adds instances when traffic grows and removes them when it falls. The catch: a new instance takes about <b>90 seconds to boot</b>, so you have to scale <i>ahead</i> of the traffic.',
  legend: [
    { color: 'var(--ok)', shape: 'square', label: 'Running instance' },
    { color: 'var(--vote)', shape: 'dash', label: 'Booting instance (90 s)' },
    { color: 'var(--bad)', shape: 'line', label: 'CPU over 100%: users get errors' },
    { color: 'var(--muted)', shape: 'line', label: 'CPU under 35%: you are paying for idle machines' },
  ],
  howTo: [
    'A short tutorial shows you how to add and remove instances. The clock starts after it.',
    'Click + to boot an instance, − to stop one. Watch the CPU gauge.',
    'Adding capacity just in time builds a combo. Overload seconds and idle seconds cost points.',
  ],
  tasks: [
    'Tutorial: add an instance, remove one',
    'Ride the morning ramp by hand',
    'Pick a target CPU for an automatic scaler',
    'Survive a flash sale at noon',
  ],
  lessons: [
    'Adding capacity is not instant: a new instance must boot, start the app and pass health checks before it gets traffic. Removing one is instant, which makes scaling down the easy half.',
    'Scaling by hand means reacting 90 seconds early, all day, forever. You had to read the trend, not the current CPU. That is the job autoscalers automate.',
    '<b>Target tracking</b> keeps average CPU near a number you pick (AWS Auto Scaling, Kubernetes HPA). The gap between the target and 100% is your <b>headroom</b>: it absorbs spikes while new instances boot. Too little headroom overloads; too much wastes money.',
    'No reactive rule beats a step change faster than boot time. For known events (a sale, a launch, a match kickoff) teams <b>pre-warm</b> with a scheduled scale-up. A higher minimum would also work, but it costs money every hour of every day.',
  ],
  walkthrough: [
    { id: 'add', target: '#as-add', text: 'Traffic is about to grow. Click + to boot one more instance.' },
    { id: 'remove', target: '#as-remove', text: 'It boots in 90 seconds (sped up here). Now click − to stop an instance, which is instant.' },
  ],
  minTimeMs: RULES['autoscaler'].minTimeMs,
  parMs: RULES['autoscaler'].parMs,
  pager,
  learn,
  hints,
  learnMore: {
    paragraphs: [
      'Autoscalers come in three flavours. <b>Reactive</b> policies (target tracking, step scaling) watch a metric such as CPU or requests per instance. <b>Scheduled</b> scaling changes capacity at known times. <b>Predictive</b> scaling forecasts traffic from history and scales ahead of it.',
      'The hard part is the delay chain: the metric is averaged over a minute, the alarm fires, the instance boots, the app warms up, and health checks pass. Two to five minutes is common. Faster boots (containers, pre-baked images, warm pools) shorten the chain; headroom covers the rest.',
      'Scaling in needs a <b>cooldown</b>: removing instances right after a spike can cause flapping (add, remove, add). And every scaling decision is a cost decision: idle capacity is money spent on nothing, while too little capacity costs users.',
    ],
    diagram,
    caption: 'A reactive scaler arrives after the spike; a scheduled pre-warm arrives before it.',
    links: [
      { label: 'AWS docs: Target tracking scaling policies for Amazon EC2 Auto Scaling', url: 'https://docs.aws.amazon.com/autoscaling/ec2/userguide/as-scaling-target-tracking.html' },
      { label: 'Kubernetes docs: Horizontal Pod Autoscaling', url: 'https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/' },
      { label: 'AWS docs: Scheduled scaling for Amazon EC2 Auto Scaling', url: 'https://docs.aws.amazon.com/autoscaling/ec2/userguide/ec2-auto-scaling-scheduled-scaling.html' },
    ],
  },
};
