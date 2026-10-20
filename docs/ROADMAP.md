# Roadmap

## The vision

A war that keeps going for days. You start in one small zone. Once you control it, the map
expands and you push into the next zone, while the zones you already hold **keep running**:
they earn money, and rival armies can counter-attack them. Money buys upgrades that help in
both small battles and big campaigns. Over time the map fills with several enemy factions that
fight each other as well as you, so the world feels alive even when you aren't looking.

Scale grows outward: **battle → zone → region → country → world**, and maybe all the way out to
planets and galaxy-level fights. Phase 1 should ship fast; depth and difficulty come with scale.

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
- [x] Fixes from three playtest rounds (simulated kids on phone and iPad, plus QA)
- [x] Battle feedback: capture bursts, screen shake, "under attack" warnings, win/lose preview
- [x] Opening shield, capture the enemy HQ to win, confetti and defeat tips
- [ ] Swarms that fight each other when they meet mid-field
- [x] Sound effects (synthesized in code) with a mute button
- [ ] First-battle tutorial (animated hand showing the drag)
- [ ] Medals for each battle (win, win fast, win without losing a base)
- [ ] Several maps that unlock one after another
- [ ] Random skirmish maps (mirrored so both sides start fair, checked by bot matches)
- [x] Mobile: full screen, pinch zoom and pan, finger-sized touch targets, sharp on Retina
- [ ] Multiple armies in the rules (prep for rival factions)
- [x] Tanks: troops sent from a Factory roll out as slower tanks worth 3 soldiers each
- [x] Top-down soldier and tank sprites (drawn in code; swap for hand-made art any time)
- [x] Harder General: red defends its bases (HQ first) and builds faster
- [x] Keep HUD perk text clear of the corner bases' labels on small screens
- [x] Add to Home Screen: app icon, full-screen launch, safe-area aware
- [ ] Every base kind has a feature worth fighting for (full plan in [BASES.md](BASES.md)):
  - HQ: fastest production; capture it to win
  - Barracks: strong production
  - Factory: faster building everywhere, sends tanks
  - Radar: faster troops everywhere, and reveals incoming attacks earlier
  - Armory: stronger troops everywhere
  - Outpost: troops sent from it move 40% faster (a launch pad for the front line) (done)
  - Bunker (new): defenders count double, a tough nut to crack
  - Airfield (new): sends jets that fly straight over terrain
  - Field hospital (new): some of your troops lost nearby come back

## Phase 1.5: Medals and upgrades

Full plan in [PRESTIGE.md](PRESTIGE.md). Kept simple on purpose; the real difficulty curve,
checkpoints, and prestige come with the expanding world.

- [ ] Campaign mode: a win earns 1 medal scaled by rank (Recruit 50%, Soldier 100%, General
      150%); Quick Battle earns none
- [ ] Command Tent: permanent upgrades bought with medals (starting troops, build speed, troop
      speed, shield, tanks), applied in campaign battles only
- [ ] Save progress on the device (versioned save, ready for zones later)
- [ ] Bots check how fast medals come in and upgrades get bought

## Phase 2: Zones and the persistent world

One continuous world, not separate maps. Zones are irregular regions of the same map that
join seamlessly, so the front line flows from one into the next.

- [ ] Organic zone shapes: the world is split into irregular regions (Voronoi cells shaped
      with noise), each with its own bases, terrain tint, and border
- [ ] Bases placed inside each zone with even spacing (Poisson-disk), never too crowded
- [ ] Terrain that shapes strategy:
  - Water and mountains block troops; bridges and passes become chokepoints worth holding
  - Forest, mud, and hills slow troops; roads speed them up
  - Troops follow real paths around terrain (paths between bases worked out once per map,
    so it stays fast with hundreds of units)
  - The attack preview and the AI use real travel times, so "the long way round" matters
  - Jets from Airfields ignore terrain; tanks are slowed most by forest and mud
- [ ] Fairness by testing, not symmetry: generate many candidate zones, let bots play each one,
      keep only the ones where neither side's start is a big advantage
- [ ] Capturing a zone opens its neighbours; the zone you hold is where you push out from
- [ ] Bases near a zone border connect to bases across it, so attacks cross borders naturally
- [ ] Zones you aren't looking at keep running in a cheaper, simplified simulation (troop
      counts and battles without drawing every unit)
- [ ] Camera zooms out from one zone to the region as the world grows
- [ ] A zone is a battle map that stays alive after you win it
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
- [ ] Rivals start in zones out at the edges and expand toward you and each other
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
