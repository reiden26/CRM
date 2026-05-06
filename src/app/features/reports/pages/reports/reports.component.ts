import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container">
      <h1>Reports</h1>
      <p>Dashboards & analytics — coming soon</p>
    </div>
  `,
  styles: [`.page-container { padding: 24px; }`]
})
export class ReportsComponent {}
