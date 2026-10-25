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
- **Double-tap sends everything** (the older son's idea). Drag and single tap still send half;
  double-tapping one of your bases arms it to send all its troops, and the preview rings count
  them all. Bots don't use it, so it is a little extra power for the player only.
- **First battle shows a hand** dragging from your HQ to the nearest neutral base, with "Drag
  from your base to a gray one!", until you send your first troops. It shows whenever the
  game thinks it is your first battle (the same flag that picks Boot Camp).
- **Radar early warning adds, never takes away.** Holding a Radar shows how many enemies are
  heading for each of your bases (⚠9). The red danger ring is the same with or without one.
- **The Adjutant's Quartermaster pushes forward from bases 70% full**, not full: battles
  rarely last long enough for bases to fill, so it hardly ever acted.
- **Long battles end.** After six minutes the AI pools all its bases into each attack, drops
  its personality's habits and waits for a bigger edge (bots once traded the same few bases
  for 15 minutes).
- **Next up: pacing.** The user wants battles of about five minutes. Plan: from 3 stars up,
  tougher middle garrisons, bigger maps and slightly slower troops, tuned by bots; 1-2 stars
  stay quick.
- **Forest and mud are real** (`src/sim/paths.ts`): forest slows soldiers to 75% and tanks to
  50%, mud to 60% and 40%; jets fly over. Routes count slow cells as longer, tanks get their
  own routes, and a route's `time` (full-speed distance) is what the preview and AI use.
  Balance barely moved (bots: Soldier vs typical kid 77% before, 79% after) and battles got
  about 10% longer. They are scenery patches (`features`), so the save is unchanged.
- **Prestige is built** (2026-10-25): Threat, Tactical Retreat, Honor and the War College; see
  PRESTIGE.md. Save version 4. Region ratings now climb faster with distance (0.9 a ring,
  was 0.6) so wars reach 5 stars and Threat in a few rings.
- **Prestige direction** (the user, 2026-10-25): the campaign should get so hard a kid can't go
  on, then pay a deep currency for permanent upgrades. Plan: enemy upgrades that grow with a
  Threat level as you conquer outward; a **Tactical Retreat** (the prestige) that resets the
  world, medals and Tent for Honor based on how far you got; a War College of permanent
  upgrades bought with Honor. **"Promotion" is reserved for moving up to the next phase**,
  never for the prestige.
- **Prestige target:** after a few Tactical Retreats, the 8-year-old should be able to beat 5
  stars and beyond in the first phase. Tune the War College with bots so the "new 8yo"
  profile wins 5-star regions after a handful of retreats.
- **The game is an incremental at heart** (the user, 2026-10-25): players should often go back
  to the beginning phases, each time with more abilities. Prestige is layered: a Tactical
  Retreat resets a war; a Promotion (the next phase) will likely reset more, for bigger,
  longer-lasting rewards. Promotion needs 100 Honor earned in total, counting what the
  current war would pay (`PROMOTION_HONOR`); for now it only awards a Phase 2 badge.
- **Upgrade webs, two of them** (the user, 2026-10-25): the Command Tent (medals, resets each
  war) is a radial web (`src/sim/web.ts`, `src/scenes/WebScene.ts`): centre node, a spoke
  per upgrade, a node per level. The War College (Honor, permanent) is an endless hex web
  (`src/sim/collegeweb.ts`): any node touching one you own can be bought, so paths fork
  freely. Two webs, not one, because they use different currencies and reset differently.
  Kept separate on purpose; the user agreed. Old War College levels didn't map cleanly onto
  the web, so save version 5 refunds all Honor spent on them instead of guessing.
- **The Adjutant only knows what the player could see** (the user, 2026-10-25): bases,
  troops and troops already moving (shown as rings and incoming numbers), never the enemy
  AI's plans. If fog of war is added, the Adjutant and the Commander must obey it too.
- **Commander = enemy brain at the same rank** (the user, 2026-10-25): AI against AI with no
  upgrades is a coin flip; upgrades are what make auto-battles win.
- **Retreating early must not pay.** Honor grows faster than progress (based on the hardest
  threat beaten and regions held), a retreat needs a minimum (e.g. a 3-star region beaten),
  and a bot test compares Honor per hour for "retreat after 5 battles", "after 15" and "push
  to the wall": pushing deep must come out clearly ahead.
- **Active abilities are prestige unlocks** (air strike, supply drop, charge...), nodes in
  the War College web, not free in every battle.
- **A fresh battle mechanic is wanted but undecided.** The user floated an army builder
  (earn resources, buy units, AI controls them) but isn't sure it fits. Prototype any new
  mechanic as its own Quick Battle mode first.
- **Medals show both counts**: what you have to spend and every medal ever earned (which
  unlocks higher-star regions), on the menu, world map and Command Tent.
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

- With the new maps, Soldier on conquest regions is a coin flip for the "new 8yo" bot
  (about 45-50%). Bands still pass; ease it if the kids find Soldier too hard.

## Old conversations

The full transcripts of the sessions that built this are exported to
`Downloads\node-wars-sessions` on the user's PC, for reference only.
