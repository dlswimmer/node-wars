# Conquest map (design plan)

The step between single battles and the full persistent world (Phase 2). Built (Phase 1.75),
except enemy upgrades. Code: `src/sim/worldmap.ts` (regions, ratings, progress),
`src/scenes/WorldMapScene.ts`, save v2 in `src/save.ts`. Stars map to Recruit, Corporal,
Soldier, General and Marshal (`STAR_DIFFICULTY` in `src/sim/difficulty.ts`). Auto-battle replays
regions you already hold.

**Battle shape.** A region's battle outline is its world-map polygon exactly, only scaled (to a
set area) and moved, never stretched or turned. Fairness still comes from mirroring: bases
are placed in pairs through the shape's centre, only where a base and its twin both fit
inside. The pairs are laid out along the region's long axis, turned so your HQ starts on the
west or south side (`generateRegionLevel` in `src/sim/mapgen.ts`).

## The idea

The campaign becomes a map you conquer piece by piece. Your first battle is easy and has no
difficulty rating. Win it, and the camera **zooms out**: your territory turns blue, and the
territories touching it appear, each with a difficulty rating. You choose how hard your next
fight is. Win again and that piece joins your territory, revealing its neighbours. Over time
you can see everywhere you've won and how far you've pushed.

## The map

- **Organic pieces, not squares.** The world is split into irregular regions like puzzle
  pieces or countries on a map (Voronoi cells with wobbly, noise-shaped borders), generated
  from a world seed.
- **Pieces touch.** New battles are always regions that share a border with one you hold.
- **Fog of war** covers everything beyond your frontier; winning lifts it from the new
  neighbours.
- **Each region is a battle.** Its battle map is generated from the region's own seed, and the
  battle's outline is the region's shape, so the fight looks like the piece you picked
  (this reuses the outline and scenery generator from random maps).
- **Colours:** blue for yours, gray with a difficulty badge for available fights, dark for
  fogged. (Rival faction colours arrive in Phase 4.)

## The start

A small, almost tutorial-sized starting region replaces Boot Camp in the campaign: few bases,
a gentle enemy, and room for the first-battle tutorial. Quick Battle keeps Boot Camp and random
maps.

## Difficulty and rewards

- Each available region shows **1-5 stars** and what it pays.
- Stars replace picking a rank in the campaign (Quick Battle keeps the ranks):

  | Stars | Roughly like                       | Medals per win |
  | ----- | ---------------------------------- | -------------- |
  | ★     | Recruit                            | ½              |
  | ★★    | between Recruit and Soldier        | ¾              |
  | ★★★   | Soldier                            | 1              |
  | ★★★★  | General                            | 1½             |
  | ★★★★★ | harder than General (new top tier) | 2              |

- **Choice at every step:** the frontier always offers a mix, at least one easier and one
  harder neighbour, so a kid can play safe or push for more medals.
- **Harder further out:** regions far from the start lean toward more stars, so the map
  itself becomes the difficulty curve over time.
- **The world keeps growing.** There is no edge to reach: new regions keep generating beyond
  the frontier, so there's always somewhere to push.
- **Enemy upgrades (later):** as well as playing smarter, enemies get their own upgrades that
  mirror the Command Tent (head start, faster building, stronger tanks, their own Adjutant-like
  helpers). Higher-star regions field more of them, which raises difficulty in ways a kid can
  see and understand ("this army has Heavy Tanks").

## Winning and losing

- **Win:** the region becomes yours, the camera zooms out, and its neighbours are revealed
  with a short animation.
- **Lose:** nothing is taken from you; that region stays available to retry, or you can pick
  another. After a loss, the stars on **all** available regions drift down a little, with some
  randomness (most drop one notch, some stay), so the next choices are a bit friendlier. Wins
  let them drift back up toward their normal rating.

## Saving

The save (`src/save.ts`) moves to version 2: world seed, which regions you hold, and stars and
wins per region. Version-1 saves migrate (medals and upgrades carry over; the conquest map
starts fresh).

## How it connects to what exists

- **Medals and the Command Tent** work as they do now; stars set the payout.
- **The Adjutant's auto-battle** later applies to regions you've already conquered, at star
  levels you've mastered, rather than to ranks.
- **Phase 2** grows from this: held regions keep producing and earning, rivals counter-attack
  them, and terrain gets gameplay. The conquest map is the world map those systems live on.

## Engineering sketch

1. `src/sim/worldmap.ts` (pure, seeded): region points, relaxed for even sizes; Voronoi cells
   with noisy borders; an adjacency graph; star ratings from distance to the start plus
   per-region variety, with each frontier guaranteed a mix. Unit tests for determinism,
   adjacency, and that every frontier offers an easier and a harder option.
2. Region → battle: turn a region's polygon into a battle outline (scaled to battle size) and
   generate bases inside it with the random-map generator.
3. `WorldMapScene`: draws the map, pans and zooms (touch and mouse), tap a region to see its
   stars and reward, then FIGHT. Zoom-out and reveal animation after a win.
4. A 5-star difficulty above General, tuned with the bots.
5. Save v2 and migration, then a browser check at phone and iPad sizes.

## Decisions

1. **After a loss, ratings drop globally with some randomness**, then recover as you win.
2. **The world keeps growing**; there's no final edge.
3. **The campaign starts in a small, almost tutorial region.**
4. **Enemies will get mirrored upgrades** to raise difficulty, not only smarter AI.
5. **Higher stars unlock with medals earned.** 1-3 stars are always open; 4 stars need 10
   medals earned and 5 stars need 25 (`STAR_UNLOCK_MEDALS` in `src/sim/worldmap.ts`). It counts
   lifetime medals earned (`medalsEarned` in the save), so spending in the Command Tent never
   re-locks anything, and auto-battle medals count, which gives farming held regions a purpose.
   Locked regions still show, with a padlock line saying how many medals they need. The
   frontier always keeps at least one unlocked region. With bot win rates, a bold kid first
   sees 4-star regions around battle 7 and unlocks them around battle 12; 5 stars around 29.
