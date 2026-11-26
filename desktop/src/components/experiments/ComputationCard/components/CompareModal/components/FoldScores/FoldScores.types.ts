export interface FoldScoresProps {
  mean: number | null;
  folds: number[];
  /** Per fold, whether the other run shows a different score there. */
  differs: boolean[];
}
