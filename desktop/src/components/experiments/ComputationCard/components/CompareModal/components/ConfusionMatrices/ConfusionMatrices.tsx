import type { FC } from 'react';
import { useI18n } from '../../../../../../../i18n';
import { highlight, matricesOf, matrixCellDiffers, rowPercent } from '../../utils/compare';
import type { ConfusionMatricesProps } from './ConfusionMatrices.types';

/**
 * The confusion matrices of one run, per fold, as row percentages. A matrix is a grid, not a list
 * of records, so it uses the confusion-table markup rather than DataTable (see the Tables section
 * of docs/architecture/desktop-components.md).
 */
const ConfusionMatrices: FC<ConfusionMatricesProps> = ({ run, other }) => {
  const { messages } = useI18n();
  const otherMatrices = matricesOf(other);

  return (
    <>
      {matricesOf(run).map((matrix, foldIndex) => (
        <div className="result-confusion" key={foldIndex}>
          <table className="confusion-table">
            <thead>
              <tr>
                <th colSpan={matrix[0]?.length ?? 1}>
                  {`${messages.resultView.fold} ${foldIndex + 1}`}
                </th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((matrixRow, rowIndex) => (
                <tr key={rowIndex}>
                  {matrixRow.map((cell, columnIndex) => (
                    <td
                      key={columnIndex}
                      className={highlight(
                        matrixCellDiffers(matrix, otherMatrices[foldIndex], rowIndex, columnIndex)
                      )}
                    >
                      {rowPercent(cell, matrixRow).toFixed(2)}%
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
};

export default ConfusionMatrices;
