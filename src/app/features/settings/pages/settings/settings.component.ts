import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container">
      <h1>Settings</h1>
      <p>Users & permissions — coming soon</p>
    </div>
  `,
  styles: [`.page-container { padding: 24px; }`]
})
export class SettingsComponent {}
