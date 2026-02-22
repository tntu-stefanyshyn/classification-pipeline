import { ClassificationStage } from '../modules/experiments/classes/ClassificationStage';
import { TechnologySettingType } from '../modules/technologies/classes/TechnologySetting';
import { TechnologyModel } from '../modules/technologies/models/TechnologyModel';
import type { Seeder } from './types';
import { Technology } from '../modules/technologies/classes/Technology';

const TECHNOLOGY_SEEDS = [
  {
    name: 'CSP',
    stage: ClassificationStage.PREPROCESSING,
    settings: [
      {
        key: 'n_components',
        label: 'Кількість компонентів',
        type: TechnologySettingType.NUMBER,
        required: true,
        defaultValue: '4',
      },
      {
        key: 'reg',
        label: 'Регуляризація',
        type: TechnologySettingType.SELECT,
        defaultValue: 'auto',
        options: ['auto', 'ledoit_wolf', 'oas', 'none'],
      },
      {
        key: 'log',
        label: 'Логарифмічне перетворення',
        type: TechnologySettingType.BOOLEAN,
        defaultValue: 'true',
      },
      {
        key: 'cov_est',
        label: 'Оцінка коваріації',
        type: TechnologySettingType.SELECT,
        defaultValue: 'concat',
        options: ['concat', 'epoch'],
      },
      {
        key: 'norm_trace',
        label: 'Нормалізація trace',
        type: TechnologySettingType.BOOLEAN,
        defaultValue: 'false',
      },
    ],
  },
  {
    name: 'Приглушення короткочасних артефактів',
    stage: ClassificationStage.DATA_ENHANCEMENT,
    settings: [
      {
        key: 'window_ms',
        label: 'Довжина вікна (мс)',
        type: TechnologySettingType.NUMBER,
        required: true,
        defaultValue: '250',
      },
      {
        key: 'threshold',
        label: 'Поріг',
        type: TechnologySettingType.NUMBER,
        required: true,
        defaultValue: '0.8',
      },
      {
        key: 'method',
        label: 'Метод приглушення',
        type: TechnologySettingType.SELECT,
        defaultValue: 'median',
        options: ['median', 'mean', 'winsor'],
      },
      {
        key: 'taper',
        label: 'Плавне згладжування',
        type: TechnologySettingType.BOOLEAN,
        defaultValue: 'true',
      },
    ],
  },
  {
    name: 'ICA',
    stage: ClassificationStage.FEATURE_EXTRACTION,
    settings: [
      {
        key: 'n_components',
        label: 'Кількість компонентів',
        type: TechnologySettingType.NUMBER,
        defaultValue: '20',
      },
      {
        key: 'algorithm',
        label: 'Алгоритм',
        type: TechnologySettingType.SELECT,
        defaultValue: 'parallel',
        options: ['parallel', 'deflation'],
      },
      {
        key: 'whiten',
        label: 'Whiten',
        type: TechnologySettingType.SELECT,
        defaultValue: 'unit-variance',
        options: ['unit-variance', 'arbitrary-variance', 'false'],
      },
      {
        key: 'fun',
        label: 'Нелінійність',
        type: TechnologySettingType.SELECT,
        defaultValue: 'logcosh',
        options: ['logcosh', 'exp', 'cube'],
      },
      {
        key: 'max_iter',
        label: 'Максимум ітерацій',
        type: TechnologySettingType.NUMBER,
        defaultValue: '200',
      },
      {
        key: 'tol',
        label: 'Толерантність',
        type: TechnologySettingType.NUMBER,
        defaultValue: '0.0001',
      },
      {
        key: 'random_state',
        label: 'Random state',
        type: TechnologySettingType.NUMBER,
        defaultValue: '42',
      },
    ],
  },
  {
    name: 'PCA',
    stage: ClassificationStage.DIMENSIONALITY_REDUCTION,
    settings: [
      {
        key: 'n_components',
        label: 'Кількість компонентів (або частка)',
        type: TechnologySettingType.TEXT,
        placeholder: '0.95, 10, mle',
        defaultValue: '0.95',
      },
      {
        key: 'svd_solver',
        label: 'SVD solver',
        type: TechnologySettingType.SELECT,
        defaultValue: 'auto',
        options: ['auto', 'full', 'arpack', 'randomized'],
      },
      {
        key: 'whiten',
        label: 'Whiten',
        type: TechnologySettingType.BOOLEAN,
        defaultValue: 'false',
      },
      {
        key: 'iterated_power',
        label: 'Iterated power',
        type: TechnologySettingType.TEXT,
        placeholder: 'auto або число',
        defaultValue: 'auto',
      },
      {
        key: 'random_state',
        label: 'Random state',
        type: TechnologySettingType.NUMBER,
        defaultValue: '42',
      },
      {
        key: 'tol',
        label: 'Толерантність',
        type: TechnologySettingType.NUMBER,
        defaultValue: '0.0',
      },
    ],
  },
  {
    name: 'SVM',
    stage: ClassificationStage.CLASSIFICATION,
    settings: [
      {
        key: 'c',
        label: 'Параметр C',
        type: TechnologySettingType.NUMBER,
        required: true,
        defaultValue: '1.0',
      },
      {
        key: 'kernel',
        label: 'Ядро',
        type: TechnologySettingType.SELECT,
        required: true,
        defaultValue: 'rbf',
        options: ['linear', 'poly', 'rbf', 'sigmoid'],
      },
      {
        key: 'degree',
        label: 'Степінь (poly)',
        type: TechnologySettingType.NUMBER,
        defaultValue: '3',
      },
      {
        key: 'gamma',
        label: 'Gamma',
        type: TechnologySettingType.TEXT,
        placeholder: 'scale, auto, 0.1',
        defaultValue: 'scale',
      },
      {
        key: 'coef0',
        label: 'Coef0',
        type: TechnologySettingType.NUMBER,
        defaultValue: '0.0',
      },
      {
        key: 'shrinking',
        label: 'Shrinking',
        type: TechnologySettingType.BOOLEAN,
        defaultValue: 'true',
      },
      {
        key: 'probability',
        label: 'Probability',
        type: TechnologySettingType.BOOLEAN,
        defaultValue: 'false',
      },
      {
        key: 'tol',
        label: 'Толерантність',
        type: TechnologySettingType.NUMBER,
        defaultValue: '0.001',
      },
      {
        key: 'max_iter',
        label: 'Максимум ітерацій',
        type: TechnologySettingType.NUMBER,
        defaultValue: '-1',
      },
      {
        key: 'class_weight',
        label: 'Class weight',
        type: TechnologySettingType.SELECT,
        defaultValue: 'none',
        options: ['none', 'balanced'],
      },
    ],
  },
  {
    name: 'CNN',
    stage: ClassificationStage.CLASSIFICATION,
    settings: [
      {
        key: 'epochs',
        label: 'Кількість епох',
        type: TechnologySettingType.NUMBER,
        defaultValue: '30',
      },
      {
        key: 'batch_size',
        label: 'Розмір батчу',
        type: TechnologySettingType.NUMBER,
        defaultValue: '32',
      },
      {
        key: 'learning_rate',
        label: 'Швидкість навчання',
        type: TechnologySettingType.NUMBER,
        defaultValue: '0.001',
      },
      {
        key: 'optimizer',
        label: 'Оптимізатор',
        type: TechnologySettingType.SELECT,
        defaultValue: 'adam',
        options: ['adam', 'sgd', 'rmsprop'],
      },
      {
        key: 'dropout',
        label: 'Dropout',
        type: TechnologySettingType.NUMBER,
        defaultValue: '0.2',
      },
      {
        key: 'filters',
        label: 'Кількість фільтрів',
        type: TechnologySettingType.NUMBER,
        defaultValue: '32',
      },
      {
        key: 'kernel_size',
        label: 'Розмір ядра',
        type: TechnologySettingType.NUMBER,
        defaultValue: '3',
      },
    ],
  },
] satisfies Omit<Technology, '_id'>[];

export const technologiesSeeder: Seeder = {
  name: 'technologies',
  run: async () => {
    const operations = TECHNOLOGY_SEEDS.map((technology) => ({
      updateOne: {
        filter: { name: technology.name, stage: technology.stage },
        update: {
          $set: {
            settings: technology.settings,
          },
          $setOnInsert: {
            name: technology.name,
            stage: technology.stage,
          },
        },
        upsert: true,
      },
    }));

    const result = await TechnologyModel.bulkWrite(operations, { ordered: false });
    return result.upsertedCount ?? 0;
  },
};
