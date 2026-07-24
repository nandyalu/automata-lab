# Automata Lab

A collection of interactive cellular-automaton and generative-art simulations,
each showing how complex, often unpredictable patterns emerge from a handful
of simple rules.

**Live:** [ic443.link](https://ic443.link) · [labs.ic443.link](https://labs.ic443.link)

## Experiments

- **[Langton's Ant](https://ic443.link/langtons-ant)** — a single ant flips
  cells black/white on a grid using two rules, wanders chaotically for
  ~10,000 steps, then locks into an endlessly repeating diagonal "highway."
- **[Conway's Game of Life](https://ic443.link/game-of-life)** — the classic
  zero-player cellular automaton where four rules about live neighbors are
  enough to support universal computation.
- **[Boids](https://ic443.link/boids)** — flocking birds emerge from three
  local steering forces (separation, alignment, cohesion) with no leader and
  no choreography, the same model used for the bat swarm in *Batman Returns*.
- **[Chaos Game](https://ic443.link/chaos-game)** — jumping repeatedly toward
  a randomly chosen vertex produces the deterministic Sierpiński triangle,
  the discovery behind fractal image compression.
- **[Reaction-Diffusion](https://ic443.link/reaction-diffusion)** — two
  virtual chemicals feeding, reacting, and diffusing across a grid produce
  spots, stripes, and mazes — Turing's 1952 model for animal coat patterns.
- **[Maze (Wilson's Algorithm)](https://ic443.link/maze)** — generates a
  maze via loop-erased random walks so every possible spanning tree is
  equally likely, then solves it with A*.

Each simulation includes an info panel with more on its history and how the
algorithm works.

## Development

```bash
npm start   # dev server at http://localhost:4200
npm test    # run unit tests with Vitest
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for how this is built and deployed.
