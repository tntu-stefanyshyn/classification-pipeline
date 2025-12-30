import { FC } from 'react';
import { ResultViewProps } from './ResultView.types';
import { HistoryTable } from './components';
import uk from '../../../../../../../i18n/uk';

const ResultView: FC<ResultViewProps> = ({ experimentRun }) => {
  const { history, pathNodes, queue, status, progress } = experimentRun;
  const title = pathNodes?.map((pathNode) => pathNode.label).join('->');
  const [latestLog] = history?.toReversed() ?? [];
  const [firstLog] = history ?? [];

  return (
    <div className="node-modal">
      <p className="item-title">{title}</p>
      <p className="muted small">Вузлів у шляху: {pathNodes?.length}</p>
      {latestLog ? (
        <div className="result-details">
          <div className="result-section">
            <div className="result-section-head">
              <div>
                <h4 className="result-section-title">Поточний стан</h4>
                <p className="muted small">
                  Останнє оновлення: {new Date(latestLog.createdAt).toLocaleString()}
                </p>
              </div>
              <span className={`status-pill status-${status}`}>{uk.computationStatus[status]}</span>
            </div>
            <div className="result-meta-grid">
              <div className="result-meta-item">
                <span className="muted small">Черга</span>
                <span>{uk.computationQueue[queue]}</span>
              </div>
              <div className="result-meta-item">
                <span className="muted small">Останній запуск</span>
                <span>{firstLog.createdAt.toLocaleString()}</span>
              </div>
            </div>
            {typeof progress === 'number' ? (
              <div className="result-progress">
                <div className="result-progress-track">
                  <div className="result-progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <span className="result-progress-value">{progress}%</span>
              </div>
            ) : null}
            {latestLog ? (
              <div className="result-message">
                <span className="muted small">Поточне повідомлення</span>
                <span>{latestLog.message}</span>
              </div>
            ) : null}
          </div>
          <div className="result-section">
            <div className="result-section-head">
              <div>
                <h4 className="result-section-title">Історія виконання</h4>
                <p className="muted small">Кроки, події та метрики процесу.</p>
              </div>
              <span className="result-count">{history.length + 1}</span>
            </div>
            <HistoryTable history={history} />
          </div>
        </div>
      ) : (
        <p className="muted">Запуски для цього шляху ще не виконувались.</p>
      )}
    </div>
  );
};

export default ResultView;
