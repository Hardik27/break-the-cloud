# Paste this into Claude Code (first session)

Read CLAUDE.md, docs/curriculum.md, and both files in reference/ in full before writing any code.

Build milestone M1 from docs/curriculum.md:

1. Scaffold the project exactly as CLAUDE.md describes (Vite + TypeScript, Vitest, Playwright).
2. Copy the design tokens, fonts and visual style from reference/split-brain.html into src/styles/tokens.css. The site must look like the reference: same fonts, graph paper, orange accent, light and dark mode.
3. Build the shell: router, home page showing all 8 levels and 24 games (unbuilt ones marked "coming soon"), play page with timer, moves, task list, result card, local best times, and the #/privacy page with a "Delete my data" button.
4. Build the walkthrough system in src/shell/coach.ts: a coach bar above every game that always says what to do next, and a spotlight tutorial for task 1 of every game that dims everything except the element to click and only advances when the student does it. The clock starts after the tutorial.
5. Port the three working games from reference/ (Traffic Cop, Replica Diff, Split Brain) into the Game contract, with the simulation split into sim.ts. Follow the rendering rule in CLAUDE.md: the v1 Traffic Cop rebuilt its buttons every frame, so real clicks did nothing.
6. Write the tests from the "Definition of done" in CLAUDE.md for all three games, including the real-mouse click test and the phone-width test. Run them and fix everything until they pass.

When M1 is done, show me how to run it locally (npm run dev), list what you tested, and stop so I can try it before M2.
