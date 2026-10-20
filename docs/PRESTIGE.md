# Campaign and prestige loop (design plan)

Phase 1.5. A plan, not built yet. Numbers are starting points for bot tuning.

## The loop in one breath

Win battles to climb a ladder of **operations** that keep getting harder. Every win earns
**medals**. Medals are at risk until you reach a **checkpoint**; lose before then and the
unbanked medals are gone. Spend banked medals on **permanent upgrades**, then climb again,
higher this time.

## First version (battle phase only)

### A run

- The menu gains **CAMPAIGN** (the main mode) next to **QUICK BATTLE** (today's rank picker).
- A run starts at **Operation 1**. Each operation is one battle (Boot Camp for now; random
  maps once they exist).
- Each operation the enemy is a bit stronger (see Scaling).
- After every win the player chooses:
  - **NEXT OPERATION**: keep going for more medals, at the risk of losing what isn't banked.
  - **HEAD HOME**: bank everything and end the run. This is the early cash-out; a full
    prestige layer builds on it later.
- A loss ends the run. Only banked medals are kept.

### Earning medals

| Event                        | Medals               |
| ---------------------------- | -------------------- |
| Win operation _n_            | 5 + 2 × _n_          |
| Fast win (under 2:00)        | +3                   |
| Flawless (never lost a base) | +3                   |
| Reach a checkpoint           | bonus of 5 × _n_ ÷ 3 |

So later operations are worth much more, which makes pushing your luck tempting.

### Checkpoints

- Every **3rd win** (Operations 3, 6, 9, ...) is a checkpoint: everything in the "backpack"
  is banked automatically, plus the checkpoint bonus.
- A loss after a checkpoint only loses medals earned since that checkpoint.
- The debrief screen always shows: banked medals, backpack (at risk), and wins to the next
  checkpoint, so the risk is clear to a kid.

### Spending: the Command Tent

Permanent upgrades bought with banked medals. Each has 5 levels and costs rise per level
(about 10, 25, 50, 90, 150). First set:

| Upgrade       | Per level                         |
| ------------- | --------------------------------- |
| Head Start    | +5 troops in your HQ at the start |
| Fast Builders | +8% troop production              |
| Quick March   | +6% troop speed                   |
| Strong Shield | +5 s opening shield               |
| Heavy Tanks   | Tanks worth +1 (levels 1-2 only)  |

Base-specific upgrades from [BASES.md](BASES.md) (Bunk Beds, Jump Pad, and so on) join the
tent later, unlocked by capturing that base kind in a campaign.

### Scaling by operation

For operation _n_ (starting at 1), on top of the chosen rank:

| Enemy setting         | Change per operation                         |
| --------------------- | -------------------------------------------- |
| Production            | +6% (×1.06 per operation)                    |
| Decision speed        | 3% faster, never under 0.8 s                 |
| Starting HQ troops    | +3                                           |
| Your opening shield   | −3 s (never below 0)                         |
| Combined attacks      | 2 bases from Operation 4, 3 from Operation 8 |
| Defends its bases     | from Operation 6                             |
| Snipes weakened bases | from Operation 5                             |

**The rank sets the slope**: Recruit climbs slowly (×0.6 of the changes), Soldier normally,
General steeply (×1.4) and with fog of war once that exists.

### Targets for tuning (checked with bots)

- A typical 8-year-old's first run on Recruit reaches about Operation 3-4 and banks enough
  for one upgrade.
- Each run should get noticeably further than the last for the first several runs.
- Fully upgrading the first set should take many sessions, not one afternoon.
- No operation should ever be unwinnable: past about Operation 15, scaling slows down.

## Later layers (built on top)

1. **Promotion (true prestige):** at any point, reset all Command Tent upgrades in exchange
   for a promotion (Private → Corporal → Sergeant → ...). Each rank gives a permanent medal
   multiplier and a new insignia, so promoting early pays off in the long run.
2. **Zones replace the ladder** (Phase 2): operations become zones on the world map, and
   checkpoints become zones you've fortified.
3. **Abilities loadout** (Phase 3): the tent also sells active abilities for the ability bar.
4. **War funds** (Phase 3): a second currency from Oil Fields for in-battle purchases;
   medals stay for permanent upgrades.

## Engineering plan (for the build session)

1. **Sim:** per-army modifiers (production, speed, starting troops, shield, tank power) in
   `WorldOptions`; `difficultyFor(rank, operation)` for scaling; `medalsFor(result)` for
   rewards. All unit-tested.
2. **Save system:** one versioned save in localStorage (banked medals, upgrade levels,
   current run, best operation, stats), migrated by version number so later phases can extend
   it without wiping progress.
3. **Bot ladder simulation:** bots play whole runs, buy upgrades greedily between runs, and
   report operations reached and medals per run, to tune rewards, costs, and scaling against
   the targets above.
4. **Screens:** campaign start, debrief after each battle (medals breakdown, banked vs at
   risk, NEXT OPERATION / HEAD HOME), and the Command Tent.
5. **Browser check** at phone and iPad sizes.

## Open questions

1. Name for the currency: **Medals**, Stars, or War Points?
2. Checkpoint every **3** wins, or every 5?
3. Should Quick Battles earn a small number of medals (so no play feels wasted), or none?
4. Can the player pick the rank for a campaign run, or does the campaign have its own
   difficulty curve?
