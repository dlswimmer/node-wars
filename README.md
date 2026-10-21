# Node Wars

A military swarm-strategy game. Capture bases, grow your army, and take over the map. It starts as a
single battlefield and will grow into zones, regions, and countries (see the [roadmap](docs/ROADMAP.md)).

Runs in any browser: PC, phone, or iPad. On a phone or iPad, use **Share → Add to Home Screen**
to get an app icon that opens full-screen. Sound can be muted with the speaker button.

## How to play

- **Drag** from one of your **blue** bases to any other base to send half its troops.
- **Drag across several** of your bases before letting go to attack with all of them at once.
- Or **tap** your base, then **tap** the target. Rings show which targets you'd win.
- While you drag, the target shows how many troops you're sending and whether it's enough:
  green **ATTACK!**, yellow **CLOSE!**, or red **NOT ENOUGH**.
- Troops that reach an enemy or neutral base fight its defenders. Get more there than they have and
  the base is yours. Sending troops to your own base reinforces it.
- Swarms that meet mid-field fight and cancel out troop for troop, so you can send troops to
  **intercept** an attack before it reaches your base.
- Every base has a power while you hold it (tap one you don't own to see it):

  | Base     | Shape          | Power while you hold it                                   |
  | -------- | -------------- | --------------------------------------------------------- |
  | HQ       | Star           | Fastest troop production; capture red's to win            |
  | Barracks | Square         | Good troop production                                     |
  | Outpost  | Triangle, flag | Troops sent from here move 40% faster                     |
  | Factory  | Hexagon, gear  | +25% production everywhere, and it sends **tanks**        |
  | Radar    | Rings          | +20% troop speed                                          |
  | Armory   | Diamond        | +25% attack power                                         |
  | Bunker   | Thick octagon  | Defenders count double (tanks still hit it at full power) |
  | Hospital | White cross    | A quarter of your troops lost nearby come back here (+N)  |

Troops sent from a Factory roll out as **tanks**: slower, but each one hits like 3 soldiers.

Capture red's **HQ** to win (or wipe out every red base). Your bases are shielded for the first
few seconds, shown by blue rings.

**Maps:** your first Quick Battle is Boot Camp; after that every battle is a new random map, mirrored so
both sides start with exactly the same bases and scenery, surrounded by fog of war. The end screen shows the map number, and
**PLAY AGAIN** replays that same map.

**Campaign:** a conquest map of organic, puzzle-piece regions. Start in the small Training
Ground; every win turns a region blue and reveals its neighbours, each rated 1-5 stars and
paying one medal per star. You always get an easier and a harder choice, regions get
tougher the further you push, and the world never runs out. Each battle is fought on that
region's own shape. 4-star regions unlock after 30 medals earned and 5-star after 75, so
replaying regions you hold to farm medals pays off. Lose and nothing is taken; ratings ease off a little until you win again.
Spend medals in the **Command Tent** on permanent upgrades, including the **Adjutant**, an AI
officer that helps while you give orders and, at its top level, can auto-battle regions you
hold at star levels you've mastered (5 wins) for fewer medals. **Quick Battle** is a fair fight
with no medals or upgrades. Pan and pinch the world map like a battle; tap a region to fight.

**Ranks (Quick Battle):** Recruit (start here), Soldier, and General. The campaign's stars
add Corporal (★★) and Marshal (★★★★★, tougher than General). **Pinch** or use the mouse wheel to zoom;
drag empty ground to scroll. The pause button is top right (or press P / Esc).

**Settings** (the gear on the home screen): sound on/off and volume, screen shake and attack
hints on/off (saved on the device, never erased by a reset), **NEW WORLD** for a fresh conquest
map (medals and upgrades stay), and **RESET EVERYTHING**. Both ask again first, and erasing
everything needs the button held down for two seconds.

## Development

You need [Node.js](https://nodejs.org/) 20.19 or newer.

```bash
npm install      # once
npm run dev      # start a local server with hot reload
npm test         # run the unit tests
npm run lint     # check code style
npm run build    # production build into dist/
npm run balance  # simulated players test every difficulty (add `-- 100 random` for random maps)
```

`npm run dev` listens on your local network too, so you can open the "Network" URL it prints on a
phone or iPad on the same Wi‑Fi.

### Project layout

```
src/
  sim/       Game rules: pure TypeScript with no Phaser, unit-tested with Vitest
  scenes/    Phaser scenes: drawing and input only
  theme.ts   Colors and fonts
docs/        Roadmap and design notes
```

Game logic lives in `src/sim` and never imports Phaser, so it can be tested quickly and reused later
(for example by the zone and campaign layers). Scenes read the world state each frame and draw it.

### Deployment

Every push to `main` runs CI and publishes the game to GitHub Pages. To enable it once: on GitHub,
open **Settings → Pages** and set **Source** to **GitHub Actions**.
