# Handoff: where things stand and why

Written 2026-10-20 when the working copy moved from OneDrive to `C:\dev\node-wars`. The design
docs (ROADMAP, BASES, CONQUEST, PRESTIGE) say _what_ is planned; this note keeps the _why_
behind decisions that aren't obvious from the code, so a new session doesn't undo them.

## Who it's for

Built for the user's two sons (8 and 11). They play on a phone and an iPad (touch); the user
tests on PC. Live at https://dlswimmer.github.io/node-wars/, deployed by GitHub Actions on
every push to `main` (CI runs lint, format, typecheck and tests first).

## How we work

- **Early phases lean easy.** An 8-year-old should win most early battles. Difficulty grows
  with scope (zones, factions, upgrades), not by making today's battles harder.
- **Balance by bots, not by feel.** `npm run balance` (add `-- 100 random` or `-- 100 regions`)
  plays simulated kids and adults against every difficulty; `src/sim/playtest/balance.test.ts`
  locks the win-rate bands. Run it after any rule change.
- **Lean on usage.** The user is on the Pro plan: no playtester subagents, prefer bot sims and
  reading game state (`window.nodeWars` in dev builds) over many screenshots. Ask before big jobs.
- **Check phone and iPad sizes** (844x390 and 1024x768) with the built-in browser after visual
  changes.
- Commit straight to `main` and push; confirm the deploy passes.

## Decisions worth keeping

- **Same rules for every army.** Nothing assumes "player vs enemy" in the sim, so rival AI
  factions can come later. Difficulty comes from AI settings and production handicaps
  (`src/sim/difficulty.ts`), never from special rules for the player.
- **Fair early, not everywhere** (decided 2026-10-21). The tutorial and 1-2 star battles stay
  mirrored so a new kid can count on winning. Further out, maps may be lopsided (and upgrades
  make fights uneven anyway): bots measure each map's real difficulty to set its stars rather
  than forcing symmetry. Losing a battle only loses that fight (the region's stars drop a
  little); it is never game over. Random maps and regions are still all mirrored today.
- **Region battles use the region's exact shape** from the world map (scaled, never stretched);
  your HQ starts west/south, along the region's long axis.
- **Medals are whole numbers:** one per star; every medal number lives in `src/sim/economy.ts`.
- **Terrain is mirrored too, and rebuilt from the seed.** Rivers run through the map centre and
  mirror onto themselves, so the save never stores terrain. Rivers come from their own random stream so bases and scenery don't move.
- **Paths are worked out once per map**, on a 20-unit grid where a cell is open only if all
  of it is dry, then pulled tight into a few corners. Maps with nothing in the way keep exact
  straight lines, so their balance doesn't change. Kid bots still judge by straight-line
  distance on purpose (that's how a kid sees the map).
- **Where terrain goes** (`src/sim/terrain.ts`): random maps get a river (about 40%) and
  mountain ranges with a pass (about 40%). Conquest regions follow their _natural_ star rating
  (from the world seed, so a region's map doesn't change as its stars drift): 1 star none,
  2 stars only a river with three bridges, 3 stars a river or a range, 4-5 stars more ranges.
  The tutorial region and Boot Camp get none (lakes still block). A map whose HQs' walk would
  be over 1.7x the straight line drops its mountains, then its river. Scenery is placed after
  terrain so it never sits on water or rock.
- **Enemy personalities** (`src/sim/personality.ts`) change how an AI plays, not how well.
  Recruit and Corporal always face the steady AI (personalities swing win rates and early
  battles must be dependable). Soldier rolls Rusher, Raider or Opportunist; the Turtle, which
  gathers every base into each attack, only turns up from General (at Soldier it played
  like a General). A Turtle that waits to build up was tried and dropped: it crushed kids and
  was easy for adults. Balance tests play `mixed` personalities, as the game does.
- **Missions are a bonus, never a handicap** (`src/sim/missions.ts`). Each region (not the
  tutorial) has one, fixed by the world seed: capture every base of a kind, win in under 4-5
  minutes, win without losing a base, or hold 60% of the bases at once. Completing it pays
  one extra medal; winning still pays as usual. An "Outnumbered" mission (enemy starts with
  extra bases) was dropped: one extra base took the adult bot from 40% to 5% at General.
  Auto-battles have no mission.
- **Swarm clashes** cancel troop for troop mid-field (Armory counts; a tank absorbs soldiers).
- **Bunker AI by rank:** only General and Marshal know a Bunker needs double troops and value
  Bunkers/Hospitals by position. Easier AIs waste troops on Bunkers. This keeps early ranks
  easy; giving every AI the knowledge cost the new-kid bots about 5 points of win rate.
- **Barracks has no special power on purpose.** Two were tried (faster building when nearly
  empty; +5 recruits on capture). Both helped the AI more than a new kid and broke the
  tutorial's 90% win band. It stays "the strong builder".
- **Base powers are passive for now.** The user chose clearer passives (tap a base you don't own
  to see its power; each base drawn as the building it is) over tap-to-use abilities. The ability bar
  stays planned for Phase 3 (see BASES.md).

## State on 2026-10-20

Done: Phase 1 skirmish, medals and Command Tent, the Adjutant helper, the conquest world map,
random mirrored maps with scenery, Settings, and the Bunker and Field Hospital.

Terrain steps 1 and 2 are done (2026-10-21): rivers with 1-3 bridges, mountain ranges with
passes, lakes that block, real paths (`src/sim/paths.ts`), the preview, AI and Adjutant using
real travel distances, and terrain in conquest regions by star rating.

Free-for-All is in Quick Battle (2026-10-21): three armies (you, red, purple) on a map laid out
for one army and turned a third of the way round twice on an oval, so it is close to fair but
not exact. Being knocked out ends your battle as a loss even while the other two fight on. It
plays easier than one against one at the top ranks because the AIs fight each other too
(bands in `balance.test.ts`; `npm run balance -- 100 ffa`). The bot "Skilled adult" does worse
than a sharp kid there; worth a look if FFA gets tuned.

Bases are drawn as the buildings they are (2026-10-21; `drawBase` in `src/scenes/drawing.ts`).

Next up, one step at a time: **forest and mud** that slow troops (tanks most; needs separate
soldier and tank route tables), then polish (mountain and bridge looks, Bridge Fort). See
ROADMAP.md.

Also open:

- Known issue: on iPad, the text over the starting zone on the world map gets cut off
  (`src/scenes/WorldMapScene.ts`). Low priority; keep labels inside the screen at 1024x768.
- With the new maps, Soldier on conquest regions is a coin flip for the "new 8yo" bot
  (about 45-50%). Bands still pass; ease it if the kids find Soldier too hard.

## Old conversations

The full transcripts of the sessions that built this are exported to
`Downloads\node-wars-sessions` on the user's PC, for reference only.
