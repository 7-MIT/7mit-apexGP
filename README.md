# Apex GP

A 3D Formula 1 time-attack game that runs in the browser. Powered and organised by Jumay™ Corporation.

- **Single player**: time attack on 8 real circuits and 5 original layouts, with assists, tyre wear, ERS and DRS.
- **Multiplayer**: host a room and share its 5-character code, join with a code, or discover public rooms. Ghost racing (no collisions) over Supabase Realtime; nothing is stored.
- Static site: open `index.html`, no build step (deploys as-is on Cloudflare Pages).

## Credits and data
- Real circuit centrelines come from [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT), projected to metres and simplified in `circuits.js`.
- 3D rendering by [three.js](https://threejs.org) (MIT); realtime by [supabase-js](https://github.com/supabase/supabase-js) (MIT).
- Engine, tyre, wind and other sounds are synthesised at runtime with the Web Audio API (`audio.js`).
- Team names and colours follow the 2026 grid for flavour only. Handling and speeds are a simplified simulation, not official data.
