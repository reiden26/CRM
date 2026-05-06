import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  private _count = signal(0);
  readonly isLoading = () => this._count() > 0;

  show(): void {
    this._count.update(c => c + 1);
  }

  hide(): void {
    this._count.update(c => Math.max(0, c - 1));
  }
}
