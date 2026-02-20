import { ComputationQueue, PipelineStatus, ExperimentStatus } from '../graphql/types.generated';

const uk = {
  computationQueue: { cloud: 'Хмарна черга', local: 'Локальна черга' } satisfies Record<
    ComputationQueue,
    string
  >,
  computationStatus: {
    queued: 'Черга',
    running: 'Обчислення',
    completed: 'Завершено',
    idle: 'Бездіяльність',
  } satisfies Record<PipelineStatus, string>,
  experimentStatus: {
    creating: 'Створення',
    configuring: 'Налаштування',
    computing: 'Обчислення',
    optimization: 'Оптимізація',
    completed: 'Завершено',
  } satisfies Record<ExperimentStatus, string>,
};

export default uk;
