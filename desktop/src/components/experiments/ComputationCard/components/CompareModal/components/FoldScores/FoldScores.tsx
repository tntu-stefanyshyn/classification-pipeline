import type { FC } from 'react';
import { formatScore, highlight } from '../../utils/compare';
import type { FoldScoresProps } from './FoldScores.types';

// Every fold is shown, and highlighted where the other run differs: equal means can hide folds
// that changed.
const FoldScores: FC<FoldScoresProps> = ({ mean, folds, differs }) => (
  <>
    {formatScore(mean)}
    <div className="muted small compare-folds">
      {folds.map((fold, index) => (
        <span key={index} className={highlight(differs[index] ?? false)}>
          {formatScore(fold)}
        </span>
      ))}
    </div>
  </>
);

export default FoldScores;
