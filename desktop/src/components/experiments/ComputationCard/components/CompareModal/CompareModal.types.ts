import type { PipelineInfoQuery } from './graphql';

export type CompareRun = NonNullable<PipelineInfoQuery['pipeline']>;

export interface CompareModalProps {
  /** Exactly two runs; the caller mounts the modal only then. */
  ids: string[];
  onClose: () => void;
}

/** One row of a two-column comparison; `differs` marks the values to highlight. */
export interface CompareRow {
  label: string;
  a: string;
  b: string;
  differs: boolean;
}

export interface MetricCompareRow {
  label: string;
  meanA: number | null;
  meanB: number | null;
  foldsA: number[];
  foldsB: number[];
  /** Per fold, whether the two runs show a different score there (a missing fold differs too). */
  foldDiffers: boolean[];
  delta: number | null;
  /** Whether the shown means differ; equal means can still hide different folds. */
  meanDiffers: boolean;
}

export interface SettingsLabels {
  node: string;
  queue: string;
  duration: string;
  predictionSplit: string;
  folds: string;
  eegRows: string;
  channels: string;
  device: string;
  finished: string;
}
