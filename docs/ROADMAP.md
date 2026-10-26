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

## Phase 1: Skirmish

Goal: one battle that is genuinely exciting for an 8-year-old, and a solid base to build on.

- [x] Bases with production, capacity, and capture
- [x] Swarm units that fly between bases
- [x] Special bases granting army-wide bonuses (Factory, Radar, Armory)
- [x] Mouse and touch controls (drag, multi-select drag, tap-tap)
- [x] Double-tap a base to send all its troops instead of half (a playtester's idea)
- [x] Difficulty levels (Recruit / Soldier / General), tuned with simulated players
- [x] Pause menu, auto-pause when the app is backgrounded
- [x] Fixes from three playtest rounds (simulated kids on phone and iPad, plus QA)
- [x] Battle feedback: capture bursts, screen shake, "under attack" warnings, win/lose preview
- [x] Opening shield, capture the enemy HQ to win, confetti and defeat tips
- [x] Swarms that fight each other when they meet mid-field
- [x] Sound effects (synthesized in code) with a mute button
- [x] First-battle tutorial (animated hand showing the drag)
- [x] ~~Medals for each battle~~ (replaced by medals per star in the campaign)
- [x] ~~Several maps that unlock one after another~~ (replaced by the conquest map)
- [x] Random skirmish maps (mirrored so both sides start fair, checked by bot matches)
- [x] Map outlines with fog of war outside, and scenery (forests, rocks, lakes, craters,
      sandbags, tank traps) that is just for looks until terrain arrives in Phase 2
- [x] Mobile: full screen, pinch zoom and pan, finger-sized touch targets, sharp on Retina
- [x] Multiple armies in the rules (any number of armies, same rules; a third "rival" army exists in the sim, not yet on any map)
- [x] Tanks: troops sent from a Factory roll out as slower tanks worth 3 soldiers each
- [x] Top-down soldier and tank sprites (drawn in code; swap for hand-made art any time)
- [x] Harder General: red defends its bases (HQ first) and builds faster
- [x] Keep HUD perk text clear of the corner bases' labels on small screens
- [x] Add to Home Screen: app icon, full-screen launch, safe-area aware
- [ ] Every base kind has a feature worth fighting for (full plan in [BASES.md](BASES.md)):
  - HQ: fastest production; capture it to win
  - Barracks: strong production
  - Factory: faster building everywhere, sends tanks
  - Radar: faster troops everywhere, and shows how many enemies are coming (done)
  - Armory: stronger troops everywhere
  - Outpost: troops sent from it move 40% faster (a launch pad for the front line) (done)
  - Bunker: defenders count double, a tough nut to crack (done)
  - Airfield: sends jets that fly straight over terrain (done)
  - Field hospital: some of your troops lost nearby come back (done)
  - Tap a base you don't own to see its power in one line (done)

## Phase 1.5: Medals and upgrades

Full plan in [PRESTIGE.md](PRESTIGE.md). Kept simple on purpose; the real difficulty curve,
checkpoints, and prestige come with the expanding world.

- [x] Campaign mode: a win earns 1 medal scaled by rank (Recruit 50%, Soldier 100%, General
      150%); Quick Battle earns none
- [x] Command Tent: permanent upgrades bought with medals (starting troops, build speed, troop
      speed, shield, tanks), applied in campaign battles only
- [x] The Adjutant: an AI helper upgrade (auto-defend, then auto-expand and attack, then
      auto-battle on levels you have mastered, for fewer medals)
- [x] Save progress on the device (versioned save, ready for zones later)
- [x] Bots check how fast medals come in and upgrades get bought (`npm run campaign`)

## Phase 1.75: Conquest map

Full plan in [CONQUEST.md](CONQUEST.md). The bridge from single battles to the persistent world.

- [x] Campaign becomes a world map of organic, puzzle-piece regions; win a region and the
      camera zooms out to reveal the regions touching it
- [x] First battle has no rating; after that each neighbouring region shows 1-5 stars and its
      medal reward, so the player picks how hard the next fight is
- [x] Each region's battle uses that region's shape as its map outline
- [x] See everywhere you've won; save v2 keeps the conquest map
- [x] A bonus mission for every region (capture them all, win fast, lose nothing, hold the
      map), shown on the world map and worth an extra medal
- [x] More upgrades (Sharpshooters, Recruiters, Elite Guard, Thick Walls, Afterburners,
      Field Medics) on two Command Tent pages, each showing what you have now and next
- [x] The Command Tent is an upgrade web: a centre node with a spoke per upgrade, one node per
      level outward, lit gold as you buy (resets with each war)
- [x] The War College as an endless upgrade web (small passives, forks, notables, abilities;
      costs rise with distance), replacing its list pages
- [ ] Battles of about 5 minutes from 3 stars up (tougher middle garrisons, bigger maps, a
      little slower), tuned by bots; 1-2 stars stay quick
- [x] Enemies get upgrades as regions get harder: a Threat level past five stars that keeps
      climbing outward until the war can't be pushed further
- [x] Tactical Retreat (prestige): bank Honor for how far the war got, start a new war, spend
      Honor in the War College on upgrades that last for good; your insignia rises each time
- [x] Prestige-only active abilities in the War College (air strike, supply drop, charge)

## Phase 2: Zones and the persistent world (current)

One continuous world, not separate maps. Zones are irregular regions of the same map that
join seamlessly, so the front line flows from one into the next.

- [ ] Organic zone shapes: the world is split into irregular regions (Voronoi cells shaped
      with noise), each with its own bases, terrain tint, and border
- [ ] Zones fit together like puzzle pieces: each battle's outline is its zone's border, shared
      edge for edge with the neighbouring zones (where other battles are going on), so the
      fog around a battle is the next territory to expand into. Today's random-map outline
      (`src/sim/scenery.ts`) is a stand-in drawn around one battle; it gets replaced by the
      zone border, and fairness moves from mirroring to bot testing (see below)
- [ ] Bases placed inside each zone with even spacing (Poisson-disk), never too crowded
- [ ] Terrain that shapes strategy:
  - Water and mountains block troops; bridges and passes become chokepoints worth holding
    (done: rivers with bridges, mountain ranges with passes, lakes; regions by star rating)
  - (done) Forest and mud slow troops, tanks most; tanks get their own routes. Hills and
    roads that speed troops up are still to come
  - (done) Troops follow real paths around terrain (paths between bases worked out once per map,
    so it stays fast with hundreds of units)
  - (done) The attack preview and the AI use real travel times, so "the long way round" matters
  - Jets from Airfields ignore terrain; tanks are slowed most by forest and mud
- [ ] Rate difficulty by testing, not symmetry: early battles (tutorial, 1-2 stars) stay
      mirrored and fair; further out, maps may be lopsided and bots measure how hard each one
      really is, which sets its stars and medals (a tougher map is worth more, not thrown away)
- [ ] Three-army battles: the sim handles any number of armies (same rules for all); a
      Free-for-All in Quick Battle first (done), then three-way regions at 4-5 stars on the conquest
      map with their own balance bands, a second enemy colour and a bigger reward
- [x] Enemy personalities (Rusher, Turtle, Raider, Opportunist), announced at the start, so
      battles at the same rank feel different
- [x] Show a region's terrain (river, mountains, forest, mud) on the world map before you
      pick it
- [ ] Fog of war over enemy troops on Soldier and up (see BASES.md decisions)
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

## Ideas from the kids (2026-10-26, not designed yet)

- [ ] Armor (younger son): maybe an ability that puts a temporary shield over one base
- [ ] Isolated areas (older son): pockets cut off by water (islands) or mountains, with no
      direct path to the enemy; taking an Airfield is the way forward. Jets can't capture
      today, so this needs a way across (e.g. Airfields that can airlift troops)
- [ ] Three-way battles on the campaign map, not only in Quick Battle
- [ ] Adjutant style: Careful / Balanced / Bold
- [ ] A War College node for faster auto-battles (×3)

## Later ideas

- [ ] Install to home screen as an app (PWA) with offline play
- [ ] Two players on the same iPad
- [ ] Portrait-mode layout for phones
- [ ] Achievements
