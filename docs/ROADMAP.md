# Roadmap

## The vision

A war that keeps going for days. You start in one small zone. Once you control it, the map
expands and you push into the next zone, while the zones you already hold **keep running**:
they earn money, and rival armies can counter-attack them. Money buys upgrades that help in
both small battles and big campaigns. Over time the map fills with several enemy factions that
fight each other as well as you, so the world feels alive even when you aren't looking.

Scale grows outward: **battle → zone → region → country → world**.

### Design rules that protect the vision

These are decided now because changing them later would be expensive:

- **Any number of armies.** The rules must never assume exactly "player vs enemy". Every
  army, including AI rivals, uses the same rules, so bots can fight each other.
- **The simulation is pure and time-stepped** (`src/sim`, no Phaser). This lets zones the
  player isn't looking at run in the background, faster than real time, or catch up on time
  that passed while the game was closed.
- **Everything saves.** Progress is a versioned save file from the first persistent feature
  onward, so old saves keep working after updates.
- **Difficulty ramps with scope.** Early phases lean easy so an 8-year-old wins most battles
  and gets hooked; challenge grows as zones, factions, and upgrades arrive.
- **One currency to start.** Money earned from held bases. More resources only if they make
  decisions more interesting for a kid.

## Phase 1: Skirmish (current)

Goal: one battle that is genuinely exciting for an 8-year-old, and a solid base to build on.

- [x] Bases with production, capacity, and capture
- [x] Swarm units that fly between bases
- [x] Special bases granting army-wide bonuses (Factory, Radar, Armory)
- [x] Mouse and touch controls (drag, multi-select drag, tap-tap)
- [x] Difficulty levels (Recruit / Soldier / General), tuned with simulated players
- [x] Pause menu, auto-pause when the app is backgrounded
- [ ] Fixes from playtest rounds
- [ ] Battle feedback: capture bursts, screen shake, "under attack" warnings
- [ ] Swarms that fight each other when they meet mid-field
- [ ] Sound effects and victory/defeat music
- [ ] First-battle tutorial (animated hand showing the drag)
- [ ] Medals for each battle (win, win fast, win without losing a base)
- [ ] Several maps that unlock one after another
- [ ] Random skirmish maps (mirrored so both sides start fair, checked by bot matches)
- [ ] Mobile: full screen, pinch zoom and pan, finger-sized touch targets, sharp on Retina
- [ ] Multiple armies in the rules (prep for rival factions)

## Phase 2: Zones and the persistent world

- [ ] A zone is a battle map that stays alive after you win it
- [ ] Capturing a zone expands the world map and opens neighbouring zones
- [ ] Held zones keep producing and earn money while you fight elsewhere (and while the game
      is closed, within limits)
- [ ] Rivals counter-attack held zones; you get alerts and can jump back to defend
- [ ] Save and load the whole world

## Phase 3: Economy and upgrades

- [ ] Money from held bases and zones
- [ ] Upgrade shop: base upgrades (walls, turrets, bigger barracks), army upgrades (speed,
      attack), and one-shot commander abilities (airstrike, paratroopers, supply drop)
- [ ] Unit types: infantry (cheap), tanks (slow, tough), jets (fast, fragile)

## Phase 4: Many factions

- [ ] Several AI factions with their own colors, personalities, and home zones
- [ ] Factions fight each other, form fronts, and can be wiped out
- [ ] A world map view showing who controls what

## Phase 5: Regions and countries

- [ ] Zones group into regions and countries, each with a theme (desert, arctic, jungle, city)
- [ ] Holding a whole region or country gives big bonuses
- [ ] Campaign story beats and unlockable generals

## Later ideas

- [ ] Install to home screen as an app (PWA) with offline play
- [ ] Two players on the same iPad
- [ ] Portrait-mode layout for phones
- [ ] Achievements
