# best-flight-game-20261126

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/chouuu12/best-flight-game-20261126/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/chouuu12/best-flight-game-20261126/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Skyline Courier — a complete, original flight game that runs in a desktop browser from static files: no build step, no network request. Fly a courier plane down a dusk-lit valley, thread golden rings, and land on short strips before the fuel runs out.

## Run it

```sh
python3 -m http.server 8000 --directory game
# then open http://localhost:8000 in desktop Chrome
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>

## Play

Open `game/index.html` in desktop Chrome (or serve `game/` with any static HTTP server). Keyboard + mouse:

| Control | Action |
| --- | --- |
| ↑ / ↓ or W / S | Pitch nose up / down |
| ← / → or A / D | Bank left / right (bank turns the plane) |
| Shift / Ctrl or mouse wheel | Throttle up / down |
| Mouse move | Steer (position = stick) |
| Space | Brake |
| P | Pause · R restart · M mute · 1/2/3 missions |

## Missions

1. **Ring Run** — thread 8 golden rings down the valley, then land at Mara Airfield.
2. **Island Hop** — land on three short island strips in order; fuel is tight.
3. **Storm Courier** — deliver the parcel through gusting wind and five storm rings.

Flying rewards throttle and turn discipline: speed buys climb, banking turns the nose, and below stall speed the wing quits. Fuel burns, ridges graze the airframe, and a touchdown only counts when it is slow, level and gentle.

## What is in the game

- Chase-view flight over a seeded, deterministic valley: patchwork fields, a winding river, three ridge layers, clouds and a low sun.
- A glass-cockpit HUD: altitude, speed, vertical speed, compass tape with heading, artificial horizon, throttle, fuel and damage gauges, warnings (stall, terrain, low fuel, engine out) and mission objectives.
- Synthesised WebAudio: engine hum, wind, ring chimes, touchdown thuds and stall alarms — no audio files.
- Three missions with briefings, scoring (rings, landings, time bonus) and a debrief screen.
- Deterministic: the same mission always builds the same valley and the same weather, so every flight is fair and every screenshot reproducible.

## Layout

```
main.ts            entry program (Node 22): copies game/ + screenshots/ to
                   /output and writes dossier.json with vendor/makefun-game.ts
game/
  index.html       page shell
  src/
    config.js      tuning, palette, missions
    random.js      seeded RNG + noise
    terrain.js     valley, ridges, river, fields, clouds
    physics.js     flight model (throttle, pitch, bank, stall, fuel)
    missions.js    rings, landings, scoring, objectives
    audio.js       synthesised WebAudio sounds
    input.js       keyboard + mouse
    render.js      canvas renderer: sky, terrain, plane, HUD, instruments
    main.js        game loop, states, screenshot staging (?shot=1..4)
screenshots/      real renders of the game's own code
vendor/
  makefun-game.ts  kit library, unchanged
```

## Build / check

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
node <kit>/cli/makefun.mjs check
```

## License

MIT — see [LICENSE](LICENSE).
