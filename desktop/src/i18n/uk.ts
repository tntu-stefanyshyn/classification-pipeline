import { ComputationQueue, PipelineStatus, ExperimentStatus } from '../graphql/types.generated';

const uk = {
  computationQueue: { cloud: 'Хмарна черга', local: 'Локальна черга' } satisfies Record<
    ComputationQueue,
    string
  >,
  computationStatus: {
    queued: 'Очікування',
    running: 'Обчислення',
    paused: 'Пауза',
    completed: 'Завершено',
    failed: 'Провалився',
    stopped: 'Зупинено',
    idle: 'Немає запусків',
  } satisfies Record<PipelineStatus, string>,
  experimentStatus: {
    creating: 'Створення',
    configuring: 'Налаштування',
    computing: 'Обчислення',
    completed: 'Завершено',
  } satisfies Record<ExperimentStatus, string>,
};

export default uk;
