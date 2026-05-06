import { Pipe, PipeTransform } from '@angular/core';
import { DealStage, DealStageType } from '../models/deal.model';

/**
 * StageColorPipe
 * Returns the hex color for a given stage name/type from the stages array.
 *
 * Usage:
 *   [style.color]="stages | stageColor:'new'"
 */
@Pipe({ name: 'stageColor', standalone: true, pure: true })
export class StageColorPipe implements PipeTransform {
  transform(stages: DealStage[], stageValue: DealStageType | string): string {
    if (!stages?.length || !stageValue) return '#6366f1';
    const normalized = stageValue.toLowerCase().replace(/_/g, ' ');
    const match = stages.find(
      s => s.name.toLowerCase() === normalized ||
           s.name.toLowerCase().replace(/\s+/g, '_') === stageValue,
    );
    return match?.color ?? '#6366f1';
  }
}
