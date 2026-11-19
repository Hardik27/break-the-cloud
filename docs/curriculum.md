# Curriculum: 8 levels, 24 games

Each game is 3–5 tasks. Task 1 is always the guided tutorial. The last task is a harder "prove it" task. Every task ends with a lesson. ✅ = already playable in `reference/break-the-cloud-v1.html` (port it, then add the walkthrough).

## Level 1 · The Network (how a request reaches a server)

1. **DNS Detective** (DNS resolution and caching). Tasks: walk a query from resolver → root → TLD → authoritative by clicking the next server to ask; see a cached answer skip the walk; change a record and watch stale answers persist until TTL expires; pick a TTL that balances freshness against load.
2. **Handshake** (TCP: SYN/SYN-ACK/ACK, retransmission, ordering). Tasks: complete a handshake by sending the right packets; drop a packet and watch a retransmit; deliver packets out of order and reassemble by sequence number; see the cost of RTT on a page with 20 requests.
3. **Latency Budget** (RTT, CDNs, edge caching). Tasks: place users and one server on a map and see load times; add CDN edges to get every user under 100 ms; find the request that a CDN cannot cache (personalised data).

## Level 2 · One Service (keeping a single service up)

4. **Traffic Cop** ✅ (load balancing: manual, round robin, least-loaded, health checks).
5. **Heartbeat** (health checks, failover, false positives). Tasks: detect a dead server from missed heartbeats; set a timeout too short and watch healthy servers get evicted during a slow GC pause; tune interval and threshold to catch failures in < 5 s with no false evictions.
6. **Rate Limiter** (token bucket, leaky bucket, 429s). Tasks: let a bot flood an API; add a token bucket and tune rate and burst; protect paying users while a noisy tenant hits the limit.

## Level 3 · Data (copies, caches and where data lives)

7. **Cache Hit** (cache-aside, TTL, LRU vs LFU, eviction). Tasks: put a cache in front of a slow DB and reach 80% hit rate; choose LRU vs LFU for two traffic patterns; serve stale data after an update and fix it with invalidation.
8. **Replica Diff** ✅ (replication verification: missing objects, checksums, tags, retention locks).
9. **Thundering Herd** (cache stampede, request coalescing, jittered TTLs). Tasks: expire a hot key and watch 1,000 requests hit the DB; add request coalescing; add TTL jitter so keys do not expire together.

## Level 4 · Scale (growing without falling over)

10. **The Ring** (consistent hashing, virtual nodes). Tasks: shard keys with `hash % N` and add a server (watch almost everything move); switch to a hash ring and add a server again; add virtual nodes to fix an unbalanced ring.
11. **Autoscaler** (scaling policies, cooldowns, cost). Tasks: handle a morning traffic ramp by adding instances by hand; write a target-tracking rule (CPU 60%); survive a sudden spike given a 90 s boot time (learn about pre-warming and headroom); stay under a cost budget.
12. **Backpressure** (message queues, consumers, dead-letter queues). Tasks: decouple a slow service with a queue; scale consumers to drain a backlog; find the poison message that crashes every consumer and route it to a DLQ.

## Level 5 · Reliability (failing gracefully)

13. **Retry Storm** (timeouts, exponential backoff, jitter). Tasks: a dependency slows down and naive retries triple the load; add exponential backoff; add jitter to break synchronised waves.
14. **Circuit Breaker** (closed/open/half-open). Tasks: a failing dependency takes the whole page down; add a breaker; tune the half-open probe so recovery is detected quickly.
15. **Blast Radius** (availability zones, regions, cells). Tasks: lose an AZ with everything in one AZ; spread across 3 AZs; lose a region and fail over with a given RPO/RTO.

## Level 6 · Distributed Data (when copies disagree)

16. **Partition** (CAP: choose consistency or availability). Tasks: split the network between two replicas and choose CP (reject writes) or AP (accept and diverge); reconcile divergent writes after healing; match three real systems to CP or AP.
17. **Quorum** (N, R, W; R + W > N). Tasks: read stale data with R=1, W=1; pick R and W so every read sees the latest write; keep writes available with one replica down.
18. **Clock Skew** (wall clocks vs Lamport vs vector clocks). Tasks: order events with skewed wall clocks and get it wrong; use Lamport timestamps; use vector clocks to detect truly concurrent updates.

## Level 7 · Consensus and Transactions (agreeing when the network lies)

19. **Split Brain** ✅ (Raft: elections, terms, log replication, majority commit).
20. **Two-Phase Commit** (atomic commit across services, blocking). Tasks: commit a transfer across two banks; crash a participant after "yes"; crash the coordinator after "prepare" and watch participants block holding locks.
21. **Saga** (compensating actions, outbox pattern). Tasks: book flight + hotel + car; the car fails, so run compensations in reverse; publish an event exactly once with an outbox.

## Level 8 · Advanced (byzantine faults and convergence)

22. **Gossip** (epidemic broadcast, failure detection). Tasks: spread a rumour to 50 nodes with fanout 1 vs 3; see rounds grow as O(log N); detect a dead node via gossip.
23. **Byzantine Generals** (traitors, 3f+1). Tasks: with 3 generals and 1 traitor, fail to agree; with 4 generals, reach agreement; find the maximum traitors for N=7.
24. **CRDT Merge** (convergent replicated data types). Tasks: two offline editors increment a counter and lose updates; use a G-counter; use an OR-set for a shared shopping list and resolve add/remove conflicts.

## Milestones

- **M1 Foundation:** Vite + TS scaffold, design tokens, router, home page with all 8 levels (unbuilt games shown as "coming soon"), play shell, coach + spotlight walkthrough system, privacy page, local best times. Port the 3 existing games with full walkthroughs. All tests green.
- **M2 Leaderboard:** Supabase schema, RLS, anonymous auth, Edge Function, leaderboard UI (all-time, weekly, your rank), play counts on home page, "Delete my data".
- **M3:** Levels 1–2 complete (games 1–6).
- **M4:** Levels 3–4 (games 7–12).
- **M5:** Levels 5–6 (games 13–18).
- **M6:** Levels 7–8 (games 19–24).
- **M7 Polish:** a certificate or "course complete" page per level, instructor mode (a page listing every concept with a link to its game, for professors to assign), Open Graph images, deploy.
