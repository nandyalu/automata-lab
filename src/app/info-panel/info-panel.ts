import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';

@Component({
  selector: 'app-info-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './info-panel.html',
  styleUrl: './info-panel.scss',
})
export class InfoPanelComponent {
  readonly heading = input('');
  readonly expanded = signal(true);

  toggle() {
    this.expanded.update(v => !v);
  }
}
