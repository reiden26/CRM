import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-tasks-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container">
      <h1>Tasks</h1>
      <p>Activities & tasks — coming soon</p>
    </div>
  `,
  styles: [`.page-container { padding: 24px; }`]
})
export class TasksListComponent {}
