# Node Wars: notes for Claude

A military swarm-strategy browser game (TypeScript + Phaser 3 + Vite) built for a kid. Must work
with mouse and touch on PC, phone, and iPad.

## Commands

- `npm run dev`: dev server on port 5173 (also exposed on LAN for testing on devices)
- `npm test`, `npm run lint`, `npm run typecheck`, `npm run format`
- `npm run balance` (bot win rates per difficulty), `npm run sweep -- <profile> <winRate>`
- `npm run campaign -- <profile> <wars>` (bots play whole wars with upgrades, Threat and
  Tactical Retreats; checks that pushing deep earns more Honor than retreating early)
- Run lint, format:check, typecheck, and tests before committing; CI runs the same checks.

## Architecture

- `src/sim/` is pure game logic and must never import Phaser. All rules (production, combat,
  bonuses, AI) go here with Vitest tests next to them (`*.test.ts`).
- `src/scenes/` holds Phaser scenes that only draw world state and turn input into sim calls.
- Base stats and balance numbers live in `src/sim/config.ts`; levels in `src/sim/levels.ts`.
- The canvas fills the screen at device pixel ratio (`Scale.NONE`, zoom 1/DPR; see
  `src/display.ts`). BattleScene's camera zooms/pans over the world; HudScene is a separate
  overlay scene so UI size never depends on battlefield zoom. Size touch/UI things in CSS px
  via `cssToWorld`, and convert pointers with `BattleScene.toWorld`, not `pointer.worldX`.
- Difficulty lives in `src/sim/difficulty.ts`. After changing balance, run `npm run balance`
  (bot players at four skill levels); `balance.test.ts` locks the bands. Early phases lean easy.
- Campaign progress lives in `src/save.ts` (versioned localStorage save). Upgrade rules,
  medal rates, and how upgrades change a battle are in `src/sim/upgrades.ts`; the Adjutant AI
  helper is `src/sim/adjutant.ts`. Bump the save version and migrate when its shape changes.
- The campaign is the conquest map: regions, star ratings and progress in `src/sim/worldmap.ts`,
  drawn by `src/scenes/WorldMapScene.ts`. Stars pick a difficulty via `STAR_DIFFICULTY`.
- Use a seeded RNG (`world.rng`) inside the sim, never `Math.random`, so tests stay deterministic.

## Conventions

- Keep tap targets large (see `baseAt` padding) and text readable on a phone.
- Track planned features in `docs/ROADMAP.md`. Read `docs/HANDOFF.md` for the reasons behind
  past decisions (and keep it current when a decision changes).
