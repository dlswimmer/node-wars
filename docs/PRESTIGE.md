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

A win earns medals by rank. A loss earns nothing.

| Rank    | Medals per win |
| ------- | -------------- |
| Recruit | 1              |
| Soldier | 2              |
| General | 3              |

Because upgrades make battles easier and the battles themselves don't get harder yet, the
pull toward higher ranks (more medals) is what keeps it challenging for now.

## The Command Tent

Permanent upgrades bought with medals. Each has a few levels; costs rise per level and are
small to match 1-3 medals per win (roughly 2, 4, 6, 9, 12 to start; tuned with bots).

| Upgrade       | Per level                         |
| ------------- | --------------------------------- |
| Head Start    | +5 troops in your HQ at the start |
| Fast Builders | +8% troop production              |
| Quick March   | +6% troop speed                   |
| Strong Shield | +5 s opening shield               |
| Heavy Tanks   | Tanks worth +1 (2 levels)         |

Base-specific upgrades from [BASES.md](BASES.md) can join the tent later.

### Tuning targets (checked with bots)

- First upgrade after about 1-2 Recruit wins.
- Maxing out the first set takes many sessions, not one afternoon.
- A fully upgraded player on Recruit should still have to play, not just watch.

## Engineering plan (for the build session)

1. **Sim:** player modifiers (production, speed, starting troops, shield, tank power) in
   `WorldOptions`, applied only in campaign battles; `medalsFor(rank, won)`. Unit-tested.
2. **Save:** one versioned save in localStorage (medals, upgrade levels, wins per rank), with
   a version number so later phases can extend it without wiping progress.
3. **Bot check:** bots play many campaign battles, buy upgrades between them, and report
   medals over time against the targets above.
4. **Screens:**
   - Menu: CAMPAIGN and QUICK BATTLE, with your medal count shown.
   - Campaign: pick a rank (showing medals per win), or open the Command Tent.
   - After a campaign win: "+2 medals" with a short celebration.
   - Command Tent: each upgrade with its level, cost, and a BUY button.
5. **Browser check** at phone and iPad sizes.

## Later, with the expanding world (not designed yet)

- A real difficulty curve as the map grows, instead of rank alone.
- Checkpoints, risk and reward, and early cash-out, tied to zones.
- Promotion (true prestige): reset upgrades for a permanent medal multiplier and a new
  insignia.
- Ability loadouts and a second currency (war funds) in Phase 3.
