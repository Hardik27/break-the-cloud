# Break the Cloud: UX research and redesign proposal

Status: research only. Nothing in the code has changed. Written 2026-11-19 after a play-through of Handshake, Latency Budget, Heartbeat, Rate Limiter, Cache Hit and Gossip.

---

## 1. The one-line diagnosis

The games test students on ideas we never taught them. We drop a second-year student into "be the cache" before they know what a cache is, then explain it afterwards in a side panel they don't read. The look, the scoring and the juice work. The **teaching order** is backwards.

The fix is not more text. It is a different loop: **see it → try it → watch it break → understand why → try again, harder**.

---

## 2. What the play-through showed

| # | What happened | Where | Root cause |
|---|---|---|---|
| 1 | "Read the brief, then press Start" over a wall of text. Nobody reads it. | Latency Budget, every game | Teaching is passive text before any action. |
| 2 | "Half of the games I do not understand." | Cache Hit, Rate Limiter task 3, Gossip | Concepts (cache, eviction, token bucket, fanout) are used before they are explained. |
| 3 | The brief gives the answer away: *"It is set to evict after 1 missed beat at 0.5 s: it keeps evicting healthy servers during GC pauses."* | Heartbeat task 3 | The side panel mixes the goal, the hint and the solution. |
| 4 | Pressing Run shows the final numbers instantly. You never see *why*. | Heartbeat, Rate Limiter, Cache Hit (LRU/LFU), Gossip, Retry Storm, Circuit Breaker, Quorum, Saga | "Run" tasks compute the result and print a table. There is no playback. |
| 5 | The clock keeps running while you read or wait. | All "Run" tasks | The timer counts reading and thinking time as if it were slowness. |
| 6 | A server looks dead, you click it, and you get an error: it was "only in a GC pause". | Heartbeat task 2 | The lesson (a pause and a crash look the same) feels like a trick, because the student has no tool to tell them apart: no "silent for 1.4 s" counter, no visible timeout. |
| 7 | 7 CDN edges for 8 cities, so you place one per city. No thinking needed. | Latency Budget task 3 | The budget is too generous, so there is no trade-off. |
| 8 | Click node, click node, click Next round. A heartbeat table that counts up. | Gossip | Busywork. The decision the student makes is trivial; the interesting part (randomness, waste, log N) happens off screen. |
| 9 | "Recovered 0/3", "Reassembled 0/2": click the red one, click in number order. | Handshake tasks 3–4 | The answer is visible, so the student pattern-matches without thinking about ACKs or sequence numbers. |
| 10 | "I have lost interest already." | Overall | No story, no reason to come back tomorrow, every game feels like a form. |

What works and must stay: the typography and graph-paper look, the coach bar, the points/combo/grade juice, the result card, the lessons with a real system named, the real-mouse test discipline.

---

## 3. Research we're leaning on (short)

These are well-established findings in learning science, picked because they map directly to the problems above.

- **Predict → Observe → Explain** (POE). Asking a student to *predict* before they watch a simulation, then explain the gap, beats watching alone. It turns every "Run" button into a learning moment instead of a results table.
- **Productive failure.** Students who try a problem *before* instruction, fail, and then get the concept understand it better than students taught first. That is our "break it" premise, but it only works if the instruction comes *right after* the failure, at the moment of confusion, and names what they just did.
- **Just-in-time, not just-in-case.** Teach one idea right before the task that needs it. A 3-page brief at the start is just-in-case and is forgotten by task 3.
- **Worked example → faded guidance → solo.** Show one, do one with help, do one alone. Our tutorial is the first step; tasks 1–4 jump straight to solo.
- **Concrete before abstract.** "A cache is the sticky note on your desk so you don't walk to the library" before "an in-memory key-value store". Names (LRU, LFU, Lamport) come *after* the student has seen the behaviour.
- **Retrieval practice and spacing.** Being asked to recall a concept tomorrow is what makes it stick. Today we never ask again.
- **Cognitive load.** One new idea per screen. The side panel currently shows brief + task + lesson + task list + leaderboard at once.

---

## 4. The new game structure: Learn → Play → Learn deeper → Play

Every game becomes a short **chapter** of 3–4 **beats**. Each beat has the same four steps, so students learn the rhythm once.

```
 ┌─ BEAT ───────────────────────────────────────────────────────────┐
 │ 1. SEE      30–60 s interactive explainer, one idea, one analogy │
 │ 2. PREDICT  "What will happen?" 2–3 choices (no penalty)         │
 │ 3. PLAY     the task; clock runs only while you have control     │
 │ 4. REPLAY   slowed-down replay of what happened, annotated;      │
 │             the concept is NAMED here ("you just did LRU")       │
 └──────────────────────────────────────────────────────────────────┘
```

### 4.1 SEE: the concept card (replaces the brief)

- A card that fills the stage, not the side panel. Big diagram, max 3 short lines, one analogy.
- It is **interactive**: one thing to poke. For a cache: tap "Read deals" twice and watch the first take 300 ms (walk to the library) and the second take 2 ms (sticky note).
- It ends with a **one-question check** ("The cache has 4 slots and is full. A new page arrives. What has to happen?"). A wrong answer just shows the explanation. No points lost.
- "I know this, skip" link for returning players.
- Clock: paused.

### 4.2 PREDICT

- Before every automatic run (every "Run 20 s" button today), ask: *"With burst = 1, what happens to Ana's page loads?" (a) all fine (b) some blocked (c) all blocked.*
- Correct prediction: +50 "called it" bonus and a badge counter. Wrong: no penalty; the replay will show why.
- This one change fixes "results show instantly and I don't understand".

### 4.3 PLAY

- The side panel shows only **Goal**, **Your tools** (what each control does, never which setting to use) and **Hints**.
- **Hint ladder**, on demand:
  1. *Nudge* (free): "Look at what happens at second 4."
  2. *Concept* (−25): "Page loads arrive 6 at a time. A bucket that holds 1 token can only let 1 through."
  3. *Show me* (−100, no flawless bonus): highlights the right control.
- **Stuck detector**: 20 s with no useful action, or 3 mistakes in a row, and the Nudge button pulses. That ends "I don't know what to do".
- Every silent or confusing click gets a reason, as now. A mistake toast always says what to do next.

### 4.4 REPLAY (the "aha" moment)

- Automatic runs are no longer instant. They **play back** at 4–8× speed (a 20 s run in about 4 s) with a scrubber, play/pause and a "jump to where it broke" button.
- The clock is **paused** during playback.
- The playback is annotated: a callout appears at the moment of failure ("Here: web-2 paused for 1.2 s, the timeout was 0.5 s → evicted").
- After the replay, the lesson appears **here**, on the stage, naming the concept: *"What you just tuned is a token bucket. Stripe, GitHub and AWS API Gateway all use one."*
- The side panel never shows the lesson before the task is done.

### 4.5 Clock rules (fairness)

The clock counts only **decision time**: it runs while the student has control of a task, and pauses for SEE cards, predictions, playback, replays and the between-task screen. Leaderboard times become comparable and nobody is punished for reading.

---

## 5. Stickiness: why come back

Ranked by value for effort.

1. **A story with stakes.** You are the new on-call engineer at a startup (a pizza-delivery app is relatable and funny). Each level is "a day on call". Each game opens with a 1-line incident from a pager: *"02:14 · Checkout p99 latency 4.2 s · customers in Sydney complaining."* The student is fixing *their* app, not doing exercises. A mentor character (a sarcastic senior SRE) voices the coach bar and the hints.
2. **A map, not a list.** A path through 8 levels (like a metro map) with nodes that light up. Next game is always one tap away. Stars gate a bonus "boss incident" at the end of each level that mixes that level's concepts.
3. **Concept cards you collect.** Every named concept (LRU, Lamport clock, token bucket, quorum...) becomes a card in a deck: one diagram, one sentence, one real system. The deck is the cheat sheet students revise from before exams. That is a real reason for a student to keep it.
4. **Daily incident.** One random, remixed task per day, same for everyone, 2 minutes, global leaderboard, streak counter. This is the "come back tomorrow" hook.
5. **Stand-up recall.** The first screen of a new session asks 3 quick questions from games played earlier ("Which fails: LRU or LFU when a scan reads every page once?"). Spaced retrieval for free, and it shows the student they *remember*.
6. **Post-mortem share card.** The result card becomes "Incident report: Cache Hit · resolved in 3:04 · grade B · root cause: stale price". Funny, shareable, on-brand.
7. **Shorter sessions.** Target 5–7 minutes per game, under 60 s per beat. Several games today run 3–4 minutes of play plus reading.

---

## 6. Per-game redesigns: the six from the play-through

### 6.1 Cache Hit (first to rebuild: it is the model for the rest)

**SEE 1: What is a cache?** Analogy: the library (database, 300 ms walk) and your desk (cache, 4 sticky notes, 2 ms). Interactive: request "deals" twice; the second one is instant. Check: *"Your desk is full. A new page comes in. What now?"* → something must be thrown out = **eviction**.

**PLAY 1: Be the cache (keep today's task, add guidance).** Requests scroll in on a conveyor. On a miss you choose which sticky note to throw away. A small "last used 3 s ago · used 7 times" label sits on each note, so students *invent* a rule.

**REPLAY 1:** "Your hit rate was 72%. Here's the moment you threw away 'home', which was asked for 2 s later." Then name what they did: *"You mostly threw out the note you used longest ago. That rule has a name: **LRU**, least recently used. The other rule, throwing out the least *often* used, is **LFU**."*

**SEE 2: LRU vs LFU in 30 s.** Two desks side by side, same requests, one using each rule, tap "step" to advance. Shown with a one-off "scan" of 10 pages: LRU forgets the popular pages, LFU keeps them.

**PREDICT 2 → PLAY 2:** Two traffic patterns; predict which policy wins; run it **with playback**, both desks animating side by side; watch hit rates diverge.

**SEE 3: Stale data.** The admin changes the price in the library; your sticky note still says $39. Show a shopper reading the wrong price.

**PLAY 3:** Today's invalidation task, but the timeline is visual (admin → DB → cache → shopper) instead of a text log, and the "race" (invalidate before the read) is animated.

Answer to *"explain LRU/LFU before the game, is that perfect?"*: no. Let them play by hand first, then name the rule they just used. Students remember a concept they discovered much better than one they were told.

### 6.2 Latency Budget / CDN

**SEE 1: Distance is time.** A world map. Drag a server and watch a request's "ball" fly there and back; a stopwatch shows the round trip. Light in fibre ≈ 200 km per ms → London–Sydney is about 17,000 km → ~85 ms one way, 170 ms round trip. Then show **why 3 round trips**: an animated handshake (TCP), a key exchange (TLS), then the request. Check: *"Server 100 ms away. How long before the first byte?"* → about 300 ms.

**PLAY 1:** One server for the world (as today, but with the flying balls so the cost is visible).

**SEE 2: What a CDN edge is.** A copy of your static files (images, CSS) in a city near users. Dynamic data (your cart) still goes to the origin.

**PLAY 2 (your idea, and it is a good one): coverage puzzle.**
- 8 cities, each with a population bubble. **Budget: 3 edges** (then a harder round with 2, or a cost per edge).
- Each placed edge draws a ring of "fast" (under 150 ms). Cities inside a ring turn green.
- Goal: cover as many **people** as possible (not cities). Placing in Singapore covers Mumbai, Singapore and Sydney partly; Frankfurt covers London and Lagos; and so on. There is a trade-off, so there is thinking.
- Round 2: a "launch in Brazil" twist: São Paulo's population triples, so do you move an edge?
- REPLAY: a heat map of user latency before vs after.

**PLAY 3:** Edge or origin sort (keep, it is quick and good), but each card shows *why* after the answer.

### 6.3 Heartbeat

The idea is excellent; the execution makes the lesson feel like a trick.

**SEE 1:** A server sends "I'm alive" every second. If the beats stop, it is either **dead** or just **frozen for a moment** (a garbage-collection pause, like your laptop freezing for a second). From outside you can't tell which. The only tool you have is **waiting**.

**PLAY 1 changes:**
- Each server row shows **"silent for 1.4 s"**, counting up live, with a visible **timeout line** the student controls (start at 2 s).
- The coach never says which server is dead. It says "web-2 has been silent for 2.1 s: past your timeout. Evict?"
- A pause ends with a visible "...I'm back!" beat; a crash never does. If you evict during a pause, the replay shows the beat that came 0.3 s later: *"10 more ms of patience would have saved it."*
- This turns the "error" the student hit into the actual lesson: the timeout trade-off.

**PLAY 2–3:** keep the settings tasks, but with PREDICT and an animated 30 s run at 6× (the timeline you already draw, filled in live), the clock paused. Remove the answer from the brief: the goal is "no false evictions"; the settings are for the student to find.

### 6.4 Rate Limiter

**SEE 1: The bouncer and the token bucket.** A bucket that refills at a steady **rate** (say 2 tokens per second) and holds at most **burst** tokens. Every request takes a token; no token → 429 "slow down". Animated: tokens drip in, requests grab them.

**PLAY 1:** Be the bouncer (keep, it's fun).

**PLAY 2 (task 3 today, which nobody understood), split into two short steps:**
1. **One client first.** Only Ana: she loads a page = 6 requests at once, every 5 s. Show *her* bucket animating. With burst 1, five of her six requests bounce. The student fixes rate and burst for Ana alone, with PREDICT first.
2. **Now add the bot**, which sends 15 a second. The same settings that serve Ana must starve the bot. The student watches both buckets side by side in playback. The "aha": burst lets humans through, rate stops machines.

**PLAY 3:** Noisy tenant (keep the idea), with the animated per-tenant buckets and a clearer result table: "Freebie 17% through" in green confused the player, because being throttled is the *goal* for the noisy tenant. Label it "Freebie: throttled as intended ✓".

### 6.5 Handshake

- **Lost packets:** packets fly across the screen; one visibly drops (it fades out mid-flight). ACKs fly back. A **duplicate-ACK counter** on the sender goes 1, 2, 3; at 3 a "fast retransmit" button lights up. Do not mark the lost segment in red: the student must read the ACK number to find it. Bonus if they wait for 3 duplicates rather than guessing at 1.
- **Reassembly:** segments arrive one by one in random order into a receive buffer. The app can only take the **next contiguous** bytes. The student clicks "deliver" when there is a contiguous prefix, and sees the ACK number jump. That teaches the *receive window*, not "click numbers in order".

### 6.6 Gossip: replace, don't patch

New concept: **"The rumour mill"**, framed as a group chat of 50 students and a party invitation.

- **SEE:** Telling everyone yourself = one overloaded server (show the outbox queue explode). Gossip = tell a few, they tell a few.
- **PLAY 1, fog of war:** you hold the rumour and can message 2 random friends per round, but you **can't see who already knows** (exactly the real constraint). Each round, nodes light up; wasted messages ("already knew!") show as grey bounces. Goal: reach all 50 within 7 rounds while sending at most N messages. The student feels why fanout and randomness matter.
- **PLAY 2, race:** your gossip network vs a central broadcaster with a 10-messages-per-second limit. Drag a "cluster size" slider 50 → 5,000 during playback and see gossip's rounds barely move (log N) while the broadcaster's time explodes. This is the O(log N) lesson as a race, not a chip choice.
- **PLAY 3, who's ghosting? (SWIM):** a friend stops answering. You can **ping** them, or ask 2 other friends to **ping them for you** (indirect ping). A slow friend answers via the indirect path; a dead one never does. Declaring a slow friend dead costs points. This teaches the real algorithm (SWIM, used by Consul) through a social situation students instantly get.

---

## 7. The other 18 games: quick audit

These need a hands-on play-test before redesign; this table is from code review. **Every game** gets the shared changes (SEE cards, PREDICT before runs, animated replays, paused clock, hint ladder, spoiler-free side panel).

| Game | Main risk | Proposed change |
|---|---|---|
| DNS Detective | Resolver/root/TLD/authoritative are 4 new words at once | SEE card: "a phone book that asks other phone books"; animate one lookup end to end before task 1 |
| Traffic Cop | Good, most played | Add PREDICT before the "pick an algorithm" boss wave; replay the crash moment |
| Replica Diff | Spot-the-difference without knowing *why* copies drift | SEE: what a checksum is (fingerprint of a file); show a bit flip changing it |
| Thundering Herd | "Stampede" needs to be seen to be believed | Animated playback of 1,000 requests hitting the DB at expiry, then with a lock/jitter |
| The Ring | Hashing and mod N are abstract | SEE: interactive hash function (type a key → a number); animate keys moving when N changes |
| Autoscaler | OK; "target CPU" is jargon | SEE: CPU as a fuel gauge; PREDICT before the flash sale |
| Backpressure | Queue/consumer/DLQ are 3 new words | SEE: a kitchen with an order rail; DLQ = "the weird orders tray" |
| Retry Storm | Results instant | Replay of synchronized retry waves (very visual); predict before each policy |
| Circuit Breaker | OK by hand; auto tasks instant | Replay with the breaker state lamp; predict |
| Blast Radius | Zones vs regions confusion | SEE: building → city → country map |
| Partition | Strong, decision-based | Add the CAP triangle as a SEE card; keep |
| Quorum | R/W chips are abstract | Replay the 600 requests as a few visible read/write arrows overlapping |
| Clock Skew | Lamport math is dry | SEE: "phones disagree about the time"; animate counters jumping on receive |
| Split Brain | Strong (the reference game) | Keep; add SEE card for "leader", "term", "majority" |
| Two-Phase Commit | Text-heavy logs | Animated messages between nodes; locks shown as padlocks with a queue of angry customers |
| Saga | Good; outbox task is a chip choice | Animate crash points in each design during playback |
| Byzantine Generals | Rules shift each round | One rule per round shown as a big card; animated messengers |
| CRDT Merge | Fine; G-counter picking is mechanical | SEE: two phones offline, a "merge" animation; name G-counter after they invent per-device counts |

---

## 8. What to build, in order

1. **Shared framework in the shell (once):** the SEE card component, PREDICT prompt, PLAYBACK player (scrubber, speed, "jump to failure", annotations), hint ladder plus stuck detector, clock pause rules, a side panel with Goal / Tools / Hints only, and lessons moved on-stage after the replay.
2. **Pilot on 3 games:** Cache Hit (concept-first), Latency Budget (coverage puzzle) and Rate Limiter (playback). They cover the three patterns: by-hand, puzzle, and run-and-watch.
3. **Play-test with 5 students.** Watch silently. Measure: % who finish each beat, hint use, time per beat, and a 3-question quiz before vs after. Target: under 10% stuck, quiz +40%.
4. **Roll out** to the other games, Gossip rebuilt from scratch.
5. **Stickiness layer:** story and pager framing, map, concept-card deck, daily incident, stand-up recall. This can overlap with M7.

---

## 9. Decisions for you

1. **Story framing:** pizza-delivery startup on call (fun, relatable), or keep neutral?
2. **Concept cards before every beat, or only the first beat of a game?** Recommendation: every beat, each at most 60 s, always skippable.
3. **Points for correct predictions?** Recommendation: yes, small (+50), never negative.
4. **Pilot games:** Cache Hit, Latency Budget, Rate Limiter? Or different ones?
5. **Gossip:** OK to replace it entirely with "The rumour mill"?
