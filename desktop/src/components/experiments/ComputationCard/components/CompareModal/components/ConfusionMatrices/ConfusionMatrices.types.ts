import type { CompareRun } from '../../CompareModal.types';

export interface ConfusionMatricesProps {
  run: CompareRun;
  /** The run it is compared with: cells that differ from it are highlighted. */
  other: CompareRun;
}
