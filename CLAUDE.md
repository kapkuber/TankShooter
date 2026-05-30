# CLAUDE.md

io-style arena game (diep/arras lineage). Single-player MVP today, designed so **multiplayer (server-authoritative, 4 teams + FFA) can be added without rewriting core systems**. Preserve these patterns.

## Team system (`src/game/teams.ts`) is authoritative for color and friend/foe

Every ownable thing — cores, tanks, bullets, future buildings — carries `teamId: TeamId` and reads its accent via `getTeamPalette(thing.teamId)`. **Never hardcode team colors at a call site.** When adding a new ownable type:

1. Add `teamId: TeamId` to its interface.
2. Default it to `LOCAL_PLAYER_TEAM` in its factory.
3. Read the palette in its draw fn.

`LOCAL_PLAYER_TEAM` is a single constant today; in multiplayer it becomes per-client server state. Treat it as a variable, not "the player".

## `teamId` ≠ `ownerId`

- `teamId` — visuals, friend/foe, friendly-fire (use this for "is this friendly?")
- `ownerId` — per-player attribution (kill credit, per-player caps)

They match in FFA, differ in team modes.

## Game loop is canvas + refs, not React components

React state is for HUD only. Game entities live in `useRef` arrays. Mutations live in named system functions (`resolveCoreEntityCollisions`, `updateBullets`, etc.) — never inside render code. This keeps the data shape ready to be replaced by server snapshots without a rendering rewrite.

Polygons (square/triangle/pentagon) are neutral world resources — they do NOT get `teamId`.
Future buildings that fire bullets just need attributable: false on their spawn.