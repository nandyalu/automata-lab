# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Dev server at http://localhost:4200
npm run build      # Production build
npm test           # Run unit tests with Vitest
npm run watch      # Build in watch mode (development)
```

To run a single test file:
```bash
npx vitest run src/app/app.spec.ts
```

## Architecture

This is an Angular 21 SPA with two cellular automaton simulations. The root shell (`app.ts`) renders a fixed navbar and a `<router-outlet>`. Both feature routes are lazy-loaded.

**Routing** (`app.routes.ts`):
- `/` → redirects to `/langtons-ant`
- `/langtons-ant` → `LangtonAntComponent` (lazy)
- `/game-of-life` → `GameOfLifeComponent` (lazy)

**Feature components** live in `src/app/langtons-ant/` and `src/app/game-of-life/`. Each is a self-contained simulation that:
- Owns a `<canvas>` element sized via `ResizeObserver`
- Drives animation with `requestAnimationFrame` and cleans up in `ngOnDestroy`
- Exposes Play/Pause, Reset/Randomize, and a speed slider
- Uses Angular signals (`signal()`, `computed()`) for all reactive state

`LangtonAntComponent` tracks cells in a `Set<string>` and keeps the canvas centered on the ant. `GameOfLifeComponent` uses a `Uint8Array` flat grid with toroidal (wrap-around) edges and a 30% random initial fill.

**NavbarComponent** (`src/app/navbar/`) is a purely presentational component with two `RouterLink` tabs.

**Global styles** (`src/styles.scss`) apply a CSS reset and set routed components to `position: absolute` so they fill the main content area. The dark theme palette is defined per-component in SCSS.

**Testing**: Vitest with JSDOM. Test files use the `.spec.ts` suffix.
