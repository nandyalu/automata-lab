import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface NavTab {
  label: string;
  path: string;
}

const TABS: NavTab[] = [
  { label: "Langton's Ant", path: '/langtons-ant' },
  { label: 'Game of Life', path: '/game-of-life' },
  { label: 'Boids', path: '/boids' },
  { label: 'Chaos Game', path: '/chaos-game' },
  { label: 'Reaction-Diffusion', path: '/reaction-diffusion' },
  { label: 'Maze', path: '/maze' },
];

@Component({
  selector: 'app-navbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})
export class NavbarComponent {
  readonly tabs = TABS;
}
