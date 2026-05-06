import {
  Component, OnInit, OnDestroy, inject, signal, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, debounceTime, takeUntil, skip } from 'rxjs';
import { NotificationPreferencesService } from '../../../../core/services/notification-preferences.service';
import { PushNotificationService } from '../../../../core/services/push-notification.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-notification-preferences',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatSlideToggleModule, MatSelectModule, MatFormFieldModule,
    MatButtonModule, MatIconModule, MatDividerModule, MatProgressSpinnerModule,
    MatTooltipModule, SkeletonComponent,
    TranslateModule,
  ],
  templateUrl: './notification-preferences.component.html',
  styleUrl: './notification-preferences.component.scss',
})
export class NotificationPreferencesComponent implements OnInit, OnDestroy {

  private readonly prefService  = inject(NotificationPreferencesService);
  private readonly pushService  = inject(PushNotificationService);
  private readonly notify       = inject(NotificationService);
  private readonly fb           = inject(FormBuilder);
  private readonly destroy$     = new Subject<void>();

  readonly loading      = this.prefService.loading$;
  readonly saving       = this.prefService.saving$;
  readonly isSubscribed = this.pushService.isSubscribed$;
  readonly pushPerm     = this.pushService.permission$;
  readonly toggling     = signal(false);

  readonly form = this.fb.group({
    // Email
    emailOnDealAssigned: [true],
    emailOnTaskDue:      [true],
    emailOnMention:      [true],
    // Push
    pushOnDealAssigned:  [true],
    pushOnTaskDue:       [true],
    pushOnMention:       [true],
  });

  ngOnInit(): void {
    this._loadPrefs();

    // Auto-save on any change with debounce
    this.form.valueChanges.pipe(
      skip(1),           // skip the initial patch
      debounceTime(500),
      takeUntil(this.destroy$),
    ).subscribe(() => this._save());
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  private async _loadPrefs(): Promise<void> {
    const prefs = await this.prefService.loadPreferences();
    if (prefs) {
      this.form.patchValue({
        emailOnDealAssigned: prefs.emailOnDealAssigned,
        emailOnTaskDue:      prefs.emailOnTaskDue,
        emailOnMention:      prefs.emailOnMention,
        pushOnDealAssigned:  prefs.pushOnDealAssigned,
        pushOnTaskDue:       prefs.pushOnTaskDue,
        pushOnMention:       prefs.pushOnMention,
      }, { emitEvent: false });
    }
  }

  private async _save(): Promise<void> {
    const v = this.form.getRawValue();
    await this.prefService.updatePreferences({
      emailOnDealAssigned: !!v.emailOnDealAssigned,
      emailOnTaskDue:      !!v.emailOnTaskDue,
      emailOnMention:      !!v.emailOnMention,
      pushOnDealAssigned:  !!v.pushOnDealAssigned,
      pushOnTaskDue:       !!v.pushOnTaskDue,
      pushOnMention:       !!v.pushOnMention,
    });
  }

  async togglePush(): Promise<void> {
    this.toggling.set(true);
    if (this.isSubscribed()) {
      await this.pushService.unsubscribeFromPush();
      this.notify.info('Push notifications disabled on this device.');
    } else {
      const ok = await this.pushService.subscribeToPush();
      if (ok) this.notify.success('Push notifications enabled!');
    }
    this.toggling.set(false);
  }

  get pushDenied(): boolean { return this.pushPerm() === 'denied'; }
  get pushUnsupported(): boolean { return this.pushPerm() === 'unsupported'; }
}
