# Node Wars

A military swarm-strategy game. Capture bases, grow your army, and take over the map. It starts as a
single battlefield and will grow into zones, regions, and countries (see the [roadmap](docs/ROADMAP.md)).

Runs in any browser: PC, phone, or iPad.

## How to play

- **Drag** from one of your **blue** bases to any other base to send half its troops.
- **Drag across several** of your bases before letting go to attack with all of them at once.
- Or **tap** your base, then **tap** the target.
- Troops that reach an enemy or neutral base fight its defenders. Get more there than they have and
  the base is yours. Sending troops to your own base reinforces it.
- Special bases power up your whole army while you hold them:

  | Base     | Shape    | Bonus while you hold it    |
  | -------- | -------- | -------------------------- |
  | HQ       | Star     | Fastest troop production   |
  | Barracks | Square   | Good troop production      |
  | Outpost  | Triangle | Small forward base         |
  | Factory  | Hexagon  | +25% production everywhere |
  | Radar    | Rings    | +20% troop speed           |
  | Armory   | Diamond  | +25% attack power          |

Capture every red base and wipe out their troops to win.

## Development

You need [Node.js](https://nodejs.org/) 20.19 or newer.

```bash
npm install      # once
npm run dev      # start a local server with hot reload
npm test         # run the unit tests
npm run lint     # check code style
npm run build    # production build into dist/
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
