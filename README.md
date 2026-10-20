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
- Special bases power up your whole army while you hold them:

  | Base     | Shape    | Bonus while you hold it                            |
  | -------- | -------- | -------------------------------------------------- |
  | HQ       | Star     | Fastest troop production                           |
  | Barracks | Square   | Good troop production                              |
  | Outpost  | Triangle | Small forward base                                 |
  | Factory  | Hexagon  | +25% production everywhere, and it sends **tanks** |
  | Radar    | Rings    | +20% troop speed                                   |
  | Armory   | Diamond  | +25% attack power                                  |

Troops sent from a Factory roll out as **tanks**: slower, but each one hits like 3 soldiers.

Capture red's **HQ** to win (or wipe out every red base). Your bases are shielded for the first
few seconds, shown by blue rings.

**Campaign:** wins earn medals (Recruit ½, Soldier 1, General 1½). Spend them in the
**Command Tent** on permanent upgrades, including the **Adjutant**, an AI officer that helps
while you give orders and, at its top level, can auto-battle ranks you've mastered (5 wins)
for half medals. **Quick Battle** is a fair fight with no medals or upgrades.

**Ranks:** Recruit (start here), Soldier, and General. **Pinch** or use the mouse wheel to zoom;
drag empty ground to scroll. The pause button is top right (or press P / Esc).

## Development

You need [Node.js](https://nodejs.org/) 20.19 or newer.

```bash
npm install      # once
npm run dev      # start a local server with hot reload
npm test         # run the unit tests
npm run lint     # check code style
npm run build    # production build into dist/
npm run balance  # simulated players test every difficulty
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
