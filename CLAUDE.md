# Node Wars: notes for Claude

A military swarm-strategy browser game (TypeScript + Phaser 3 + Vite) built for a kid. Must work
with mouse and touch on PC, phone, and iPad.

## Commands

- `npm run dev`: dev server on port 5173 (also exposed on LAN for testing on devices)
- `npm test`, `npm run lint`, `npm run typecheck`, `npm run format`
- Run lint, format:check, typecheck, and tests before committing; CI runs the same checks.

## Architecture

- `src/sim/` is pure game logic and must never import Phaser. All rules (production, combat,
  bonuses, AI) go here with Vitest tests next to them (`*.test.ts`).
- `src/scenes/` holds Phaser scenes that only draw world state and turn input into sim calls.
- Base stats and balance numbers live in `src/sim/config.ts`; levels in `src/sim/levels.ts`.
- The game canvas is a fixed 1280x720 world scaled with `Scale.FIT`.
- Use a seeded RNG (`world.rng`) inside the sim, never `Math.random`, so tests stay deterministic.

## Conventions

- Keep tap targets large (see `baseAt` padding) and text readable on a phone.
- Track planned features in `docs/ROADMAP.md`.
