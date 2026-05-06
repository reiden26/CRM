import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Contact, STATUS_COLORS, STATUS_LABELS } from '../../models/contact.model';

@Component({
  selector: 'app-contact-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatTooltipModule,
  ],
  template: `
    <mat-card class="contact-card" [class.selected]="selected">
      <mat-card-content class="card-body">

        <!-- Avatar + name -->
        <div class="card-header">
          <div class="avatar" [style.background]="avatarColor">
            {{ initials }}
          </div>
          <div class="card-info">
            <span class="contact-name">{{ contact.fullName }}</span>
            @if (contact.position) {
              <span class="contact-position">{{ contact.position }}</span>
            }
            @if (contact.companyName) {
              <span class="contact-company">
                <mat-icon class="meta-icon">business</mat-icon>
                {{ contact.companyName }}
              </span>
            }
          </div>
          <!-- Status badge -->
          <span class="status-badge" [style.background]="statusColor + '22'" [style.color]="statusColor">
            {{ statusLabel }}
          </span>
        </div>

        <!-- Contact details -->
        <div class="card-details">
          @if (contact.email) {
            <a class="detail-row" [href]="'mailto:' + contact.email" (click)="$event.stopPropagation()">
              <mat-icon class="detail-icon">email</mat-icon>
              <span>{{ contact.email }}</span>
            </a>
          }
          @if (contact.phone) {
            <a class="detail-row" [href]="'tel:' + contact.phone" (click)="$event.stopPropagation()">
              <mat-icon class="detail-icon">phone</mat-icon>
              <span>{{ contact.phone }}</span>
            </a>
          }
        </div>

        <!-- Tags -->
        @if (contact.tags.length > 0) {
          <div class="card-tags">
            @for (tag of contact.tags.slice(0, 3); track tag.id) {
              <span class="tag-chip" [style.background]="tag.color + '22'" [style.color]="tag.color">
                {{ tag.name }}
              </span>
            }
            @if (contact.tags.length > 3) {
              <span class="tag-more">+{{ contact.tags.length - 3 }}</span>
            }
          </div>
        }

      </mat-card-content>

      <!-- Actions -->
      <mat-card-actions class="card-actions">
        <button mat-icon-button matTooltip="View" (click)="view.emit(contact.id)">
          <mat-icon>visibility</mat-icon>
        </button>
        <button mat-icon-button matTooltip="Edit" (click)="edit.emit(contact.id)">
          <mat-icon>edit</mat-icon>
        </button>
        <button mat-icon-button matTooltip="Archive" color="warn" (click)="delete.emit(contact.id)">
          <mat-icon>archive</mat-icon>
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styleUrl: './contact-card.component.scss',
})
export class ContactCardComponent {
  @Input({ required: true }) contact!: Contact;
  @Input() selected = false;

  @Output() view   = new EventEmitter<string>();
  @Output() edit   = new EventEmitter<string>();
  @Output() delete = new EventEmitter<string>();

  get initials(): string {
    return (
      (this.contact.firstName[0] ?? '') +
      (this.contact.lastName[0] ?? '')
    ).toUpperCase();
  }

  get avatarColor(): string {
    // Deterministic color from name
    const colors = ['#6366f1','#0288d1','#22c55e','#f59e0b','#ef4444','#8b5cf6'];
    const idx = (this.contact.firstName.charCodeAt(0) ?? 0) % colors.length;
    return colors[idx];
  }

  get statusColor(): string {
    return STATUS_COLORS[this.contact.status] ?? '#9ca3af';
  }

  get statusLabel(): string {
    return STATUS_LABELS[this.contact.status] ?? this.contact.status;
  }
}
