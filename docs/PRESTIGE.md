# Medals and upgrades (design plan)

Phase 1.5. A plan, not built yet. Deliberately simple: this is the seed of the progression
system, and the real difficulty curve (and anything like checkpoints) arrives with the
expanding world in Phase 2.

## The loop

Win campaign battles to earn **medals**. Spend medals on **permanent upgrades** in the
**Command Tent**. Upgrades make you stronger, so you can take on a harder rank, which pays
more medals.

## Modes

- **CAMPAIGN**: battles that count. Wins earn medals and your upgrades apply.
- **QUICK BATTLE**: today's game. No medals, no upgrades: a fair fight, good for brothers
  comparing scores.

## Earning medals

Medals are always whole. A campaign win earns **one medal per star** of the region (1-5); an
Adjutant auto-battle earns half that, rounded down, but at least 1. A loss earns nothing, and
Quick Battle earns none. Every medal number (rewards, unlock thresholds, Command Tent prices)
lives in one table, `src/sim/economy.ts`, for tuning.

| Stars | Like     | Medals per win | Auto-battle |
| ----- | -------- | -------------- | ----------- |
| ★     | Recruit  | 1              | 1           |
| ★★    | Corporal | 2              | 1           |
| ★★★   | Soldier  | 3              | 1           |
| ★★★★  | General  | 4              | 2           |
| ★★★★★ | Marshal  | 5              | 2           |

(Before whole medals, wins paid ½ to 2; old saves had their medals multiplied by 3.)

Because upgrades make battles easier and the battles themselves don't get harder yet, the
pull toward higher ranks (more medals) is what keeps it challenging for now.

## The Command Tent

Permanent upgrades bought with medals. Each has a few levels; costs rise per level and are
matched to 1-5 medals per win: 3, 6, 10, 15, 25 for most, Heavy Tanks 10 and 20, the
Adjutant 3, 10, 15, 25, 35 (`UPGRADE_COSTS` in `src/sim/economy.ts`). A simulated campaign
with bot win rates reaches three levels of an upgrade in about 9 battles and a maxed one in
about 24, the same pace as before whole medals.

| Upgrade       | Per level                         |
| ------------- | --------------------------------- |
| Head Start    | +5 troops in your HQ at the start |
| Fast Builders | +8% troop production              |
| Quick March   | +6% troop speed                   |
| Strong Shield | +5 s opening shield               |
| Heavy Tanks   | Tanks worth +1 (2 levels)         |

Base-specific upgrades from [BASES.md](BASES.md) can join the tent later.

### The Adjutant (AI helper)

A special upgrade track: an AI officer that helps run your army. It starts cheap and simple
and grows until it can fight battles on its own, but only battles you've already mastered.
New and expanded battles always need the player.

| Level | Name          | What it does                                                                                   |
| ----- | ------------- | ---------------------------------------------------------------------------------------------- |
| 1     | Defender      | Sends reinforcements to a base that's about to fall (small amounts, every few seconds at most) |
| 2     | Quartermaster | Full bases send their extra troops toward the front instead of sitting idle                    |
| 3     | Scout         | Grabs nearby gray bases it's sure to win                                                       |
| 4     | Field Officer | Attacks enemy bases when the odds are clearly good                                             |
| 5     | Commander     | **Auto-battle**: plays a whole battle by itself, at levels you've mastered                     |

Rules that keep the player in charge:

- **Never better than you.** The Adjutant uses the same brains as the test bots, set to a
  careful, slower-than-a-kid pace, so a player who's paying attention always does better.
  Each level makes it a bit quicker and smarter.
- **Visible and switchable.** Its orders are drawn in a different color, and a toggle in
  battle turns it on or off.
- **Auto-battle only where you've proven yourself.** A level counts as mastered after you've
  won it yourself several times (for example, 5 wins at that rank). Later, each zone works
  the same way: master it, then the Adjutant can hold it and fight there, while the new
  frontier still needs you.
- **Auto-battles pay less**, for example half medals, so playing yourself is always the best
  way to earn. Auto-battles are quick to watch (or skip once that exists), which makes them
  a way to farm mastered levels, not a replacement for playing.

Tuning with bots: on each rank, check the Adjutant's win rate alone at each level (it should
be low until Commander, and only decent on mastered levels), and check that a player with
the Adjutant on still wins noticeably more than the Adjutant alone, so "doing nothing" is
never the best play.

### Tuning targets (checked with bots)

- First upgrade after about 2 Recruit wins (or 1 Soldier win).
- Maxing out the first set takes many sessions, not one afternoon.
- A fully upgraded player on Recruit should still have to play, not just watch.

## Engineering plan (for the build session)

1. **Sim:** player modifiers (production, speed, starting troops, shield, tank power) in
   `WorldOptions`, applied only in campaign battles; `medalsFor(stars, won)` returning
   whole medals (one per star). Unit-tested.
2. **Save:** one versioned save in localStorage (medals, upgrade levels, wins per rank), with
   a version number so later phases can extend it without wiping progress.
3. **Bot check:** bots play many campaign battles, buy upgrades between them, and report
   medals over time against the targets above.
4. **Screens:**
   - Menu: CAMPAIGN and QUICK BATTLE, with your medal count shown.
   - Campaign: pick a rank (showing medals per win), or open the Command Tent.
   - After a campaign win: "+3 medals" with a short celebration.
   - Command Tent: each upgrade with its level, cost, and a BUY button.
5. **Browser check** at phone and iPad sizes.

## Threat, Tactical Retreat and the War College (built)

- **Threat.** Region ratings climb with distance from the start; past five stars the extra
  becomes a region's Threat (shown as ★★★★★+2). Each level gives every enemy army +10% build
  speed, +6% hit strength, +6% capacity and +6 starting troops (`threatOptions` in
  `src/sim/upgrades.ts`), and the region pays stars + Threat medals. It never stops
  climbing, so every war hits a wall.
- **Tactical Retreat.** From the War College page of the Command Tent, once a 3-star region
  is won. It pays Honor: each held region adds (stars + Threat)² / 9, so deep regions are
  worth far more than many easy ones. Then a new war starts on a new world with no medals and
  no Command Tent upgrades; Honor, the War College, insignia and star mastery stay.
  ("Promotion" is kept for moving up to the next phase.)
- **War College** (`src/sim/college.ts`, prices in `HONOR_COSTS`): Veteran Pay (+25% medals),
  War Chest (start with medals), Drill School, Logistics and Gunnery School (lasting
  build speed, troop speed and hit strength), Fortifications (bigger bases, longer shield),
  Officer Corps (start with Adjutant levels).
- **Commander abilities** (`src/sim/abilities.ts`), each unlocked once on the ABILITIES page:
  Air Strike (knock 10 troops off a base you don't own; can't capture or hit a shielded army;
  45 s), Supply Drop (+15 troops to one of yours; 40 s), Rally (every base sends a quarter
  of its troops to one of yours; 30 s). Campaign battles only, all recharging for the first
  20 s. In battle they are buttons at the bottom right: tap one, then tap a base.
- **Insignia:** Lieutenant, Captain, Major, Colonel, Brigadier, Field Marshal, then stars.
- **Checked with bots** (`npm run campaign -- newKid 4`): retreating after 8 battles pays
  about 0.3-0.6 Honor a battle, after 20 about 0.6-1, and pushing to the wall 0.7 rising to
  2 as the War College adds up. A new-8yo bot beats 5 stars in its first war and 5 stars at
  Threat 5 by its fourth.

## Later, with the expanding world (not designed yet)

- A real difficulty curve as the map grows, instead of rank alone.
- Checkpoints, risk and reward, and early cash-out, tied to zones.
- Promotion (true prestige): reset upgrades for a permanent medal multiplier and a new
  insignia.
- Ability loadouts and a second currency (war funds) in Phase 3.
