# Bases and their powers (design plan)

A plan, not a spec: nothing here beyond what's marked **live** is built yet. Numbers are
starting points for the bot balance harness, not final values.

## Design rules

- **One sentence per base.** A kid should be able to say what a base does in one breath
  ("the Bunker is twice as hard to take"). If it needs two sentences, it's two bases.
- **A shape you recognise without reading.** Every kind gets its own silhouette and icon.
- **Every base is worth fighting for**, but special bases build troops slowly, so a map of
  only specials can't win on numbers alone.
- **Rock-paper-scissors between units**, never a hard counter: anything can take anything
  with enough troops.
- **Three layers of power**, added over time:
  1. **Passive**: always on while you hold the base (Phase 1).
  2. **Upgrades**: bought with command points in the prestige loop (Phase 1.5).
  3. **Active ability**: tap the base, tap the ability button; it has a cooldown
     (Phase 3, alongside commander abilities). At most one per base.
- **Army-wide bonuses stack with diminishing returns** (for example +25%, then +15%, then
  +10%) so holding three Factories helps but doesn't snowball.

## Units

| Unit    | From      | Worth | Speed     | Notes                                                                  |
| ------- | --------- | ----- | --------- | ---------------------------------------------------------------------- |
| Soldier | most      | 1     | 1.0       | **Live.** The swarm.                                                   |
| Tank    | Factory   | 3     | 0.6       | **Live.** Full damage to Bunkers; slowed most by mud/forest (Phase 2). |
| Jet     | Airfield  | 1     | 2.2       | Flies straight over terrain; half damage to Bunkers.                   |
| Shell   | Artillery | 3 dmg | arcs, 1.5 | Not a unit you send: fired automatically, can't capture.               |

## Production bases

### HQ (star) — live

- **Power:** builds troops fastest. **Capture the enemy HQ to win.**
- Stats: 1.6 troops/s, holds 80.
- Upgrades: Bigger HQ (holds 100), Elite Guard (start each battle with +10 troops),
  Last Stand (defenders count +25% while your HQ is your only base).
- Active: **Rally**: every base you hold sends a quarter of its troops to the HQ.

### Barracks (square) — live

- **Power:** the workhorse; good steady troop production.
- Stats: 1.2/s, holds 50.
- Upgrades: Drill Sergeant (+15% production here), Bunk Beds (holds 70).
- Active: **Draft**: +10 troops instantly.

### Outpost (triangle) — live

- **Power:** a launch pad. Troops sent from it move 40% faster.
- Stats: 0.7/s, holds 30.
- Upgrades: Jump Pad (+60% speed), Watchtower (shows enemy troops heading for nearby bases).
- Active: **Forward March**: for 10 seconds, all troops leaving any base move 30% faster.

## Army-wide bases

### Factory (hexagon) — live

- **Power:** all your bases build 25% faster, and troops sent from here roll out as tanks.
- Stats: 0.8/s, holds 40.
- Upgrades: Heavy Tanks (worth 4), Assembly Line (+35% build bonus).
- Active: **Tank Column**: instantly sends 5 tanks (15 troops' worth) at a target.

### Radar (rings) — live

- **Power:** your troops move 20% faster, and you see attacks coming sooner (the warning
  ring appears earlier and shows how many enemies are incoming).
- Stats: 0.5/s, holds 40.
- Upgrades: Long Range (+30%), Early Warning (warning sound plays sooner).
- With fog of war (Phase 2): reveals the area around it.
- Active: **Scan**: reveals the whole map for 10 seconds.

### Armory (diamond) — live

- **Power:** your troops hit 25% harder.
- Stats: 0.5/s, holds 40.
- Upgrades: Sharpshooters (+35%), Armor Plating (tanks worth +1).
- Active: **Supply Drop**: one of your bases gets +15 troops.

## New bases

### Bunker (thick octagon) — Phase 1 candidate

- **Power:** defenders count double. Twice as many troops are needed to take it.
- Tanks ignore this (they do full damage), and jets do half damage.
- Stats: 0.4/s, holds 60. Bunkers are rewarding to hold and painful to take, ideal at
  chokepoints.
- Upgrades: Concrete (holds 80), Pillboxes (shoots one incoming attacker every 2 s).
- Active: **Lockdown**: can't be damaged for 8 seconds.

### Field Hospital (white cross) — Phase 1 candidate

- **Power:** a quarter of your troops lost in fights near it come back here.
- "Near" is a range ring shown when you tap it.
- Stats: 0.4/s, holds 40.
- Upgrades: Medics (a third come back), Big Tent (bigger range).
- Active: **Patch Up**: every base in range gets +5 troops.

### Supply Depot (crate) — Phase 1.5 candidate

- **Power:** your bases nearby hold 50% more troops.
- Stats: 0.5/s, holds 40.
- Pairs well with the prestige loop, where capacity upgrades already exist.
- Active: **Resupply**: nearby bases instantly fill up by 25%.

### Artillery (cannon) — Phase 2

- **Power:** every 6 seconds it fires a shell at the nearest enemy or neutral base in range,
  knocking off 3 troops. It never captures; it softens targets, especially Bunkers.
- Stats: 0.4/s, holds 30. A range ring is shown.
- Active: **Barrage**: five shells at one target.

### Airfield (runway) — Phase 2 (needs terrain to matter)

- **Power:** troops sent from here take off as jets: very fast and flying straight over
  water and mountains.
- Stats: 0.6/s, holds 40.
- Upgrades: Afterburners (faster), Bombers (jets worth 2).
- Active: **Air Strike**: knocks 10 troops off any base on the map.

### Bridge Fort (castle on a bridge) — Phase 2

- **Power:** controls a river crossing. Enemy troops crossing your bridge move at half speed.
- Only appears where terrain makes a chokepoint.

### Oil Field (derrick) — Phase 3

- **Power:** earns war funds while you hold it, for the upgrade shop.
- Stats: 0.3/s, holds 30. Weak in battle, important for the economy.

### Command Center (satellite dish) — Phase 3

- **Power:** active abilities recharge 25% faster, and you can hold one extra ability at once.

### Shipyard (anchor) — Phase 4 or 5 (water maps)

- **Power:** sends ships that travel along rivers and coasts and can attack coastal bases.

### Missile Silo (silo) — Phase 5

- **Power:** once per battle, a strike that empties any one base (except an HQ).
- Rare: at most one per region.

### Spaceport (rocket) — galaxy era

- **Power:** launches troops to other planets. The bridge from countries to galaxy fights.

## Counters at a glance

| Attacker \ Target | Normal base | Bunker   | Across water/mountains |
| ----------------- | ----------- | -------- | ---------------------- |
| Soldiers          | full        | half     | must go around         |
| Tanks             | full        | **full** | must go around, slowed |
| Jets              | full        | half     | **flies over**         |
| Artillery shells  | 3 each      | 3 each   | flies over (in range)  |

## Rollout

| When      | Bases                                                      |
| --------- | ---------------------------------------------------------- |
| Live      | HQ, Barracks, Outpost, Factory, Radar, Armory              |
| Phase 1   | Bunker, Field Hospital (with random maps that place them)  |
| Phase 1.5 | Supply Depot; upgrades for every base in the prestige tree |
| Phase 2   | Artillery, Airfield, Bridge Fort (with terrain and zones)  |
| Phase 3   | Oil Field, Command Center; active abilities for all bases  |
| Phase 4+  | Shipyard, Missile Silo, Spaceport                          |

## AI notes

- The AI should value bases by what they give it: Factories and Armories early, Bunkers at
  chokepoints, Hospitals near the front.
- On Recruit and Soldier the AI never uses active abilities; on General it uses them, but
  with a delay so the player can react.
- Every new base gets bot balance runs before it ships: win rates per rank must stay in the
  bands in `src/sim/playtest/balance.test.ts`.

## Open questions

1. Should jets be able to capture bases, or only knock troops off (pure raiders)?
2. Fog of war in Phase 2: fun for an 11-year-old, possibly confusing for an 8-year-old.
   Maybe on for General only?
3. Should active abilities belong to bases (tap the base) or to the player (a small ability
   bar), with bases only unlocking them?
4. Do neutral bases ever fight back (for example, a neutral Bunker shooting nearby troops)?
