import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'langtons-ant', pathMatch: 'full' },
  {
    path: 'langtons-ant',
    loadComponent: () =>
      import('./langtons-ant/langtons-ant').then(m => m.LangtonAntComponent),
  },
  {
    path: 'game-of-life',
    loadComponent: () =>
      import('./game-of-life/game-of-life').then(m => m.GameOfLifeComponent),
  },
  {
    path: 'boids',
    loadComponent: () => import('./boids/boids').then(m => m.BoidsComponent),
  },
  {
    path: 'chaos-game',
    loadComponent: () =>
      import('./chaos-game/chaos-game').then(m => m.ChaosGameComponent),
  },
  {
    path: 'reaction-diffusion',
    loadComponent: () =>
      import('./reaction-diffusion/reaction-diffusion').then(m => m.ReactionDiffusionComponent),
  },
  {
    path: 'maze',
    loadComponent: () => import('./maze/maze').then(m => m.MazeComponent),
  },
];
