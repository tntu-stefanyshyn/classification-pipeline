import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ClassificationStage } from '../src/graphql/types.generated';
import {
  collectDescendantIds,
  getGraphSignature,
} from '../src/components/experiments/ExperimentGraphConstructor/utils/graph';
import {
  getDefaultTechnologyForStage,
  resolveTechnology,
  buildTechnologyIndex,
} from '../src/components/experiments/ExperimentGraphConstructor/utils/technology';
import {
  getStageLabel,
  isClassificationStage,
} from '../src/components/experiments/ExperimentGraphConstructor/utils/stage';

type FlatNodeInput = {
  _id: string;
  label: string;
  stage?: ClassificationStage | null;
  technology?: string | null;
  type: string;
  settings?: Record<string, string>;
  parentId?: string | null;
};

type TechnologyInput = {
  name: string;
  stage: ClassificationStage;
};

const asFlatNodes = (nodes: FlatNodeInput[]) => nodes as Parameters<typeof collectDescendantIds>[0];
const asTechnologies = (items: TechnologyInput[]) =>
  items as Parameters<typeof buildTechnologyIndex>[0];

test('collectDescendantIds returns the full subtree including the root node', () => {
  const ids = collectDescendantIds(
    asFlatNodes([
      { _id: 'root', label: 'Root', type: 'stage' },
      { _id: 'left', parentId: 'root', label: 'Left', type: 'stage' },
      { _id: 'right', parentId: 'root', label: 'Right', type: 'stage' },
      { _id: 'leaf', parentId: 'right', label: 'Leaf', type: 'stage' },
      { _id: 'other', label: 'Other', type: 'stage' },
    ]),
    'root'
  );

  assert.deepEqual([...ids].sort(), ['leaf', 'left', 'right', 'root']);
});

test('getGraphSignature normalizes optional fields and sorts settings keys', () => {
  const signature = getGraphSignature(
    asFlatNodes([
      {
        _id: 'node-1',
        parentId: 'root',
        stage: ClassificationStage.CLASSIFICATION,
        technology: 'SVM',
        type: 'classifier',
        label: 'Node 1',
        settings: { gamma: '0.1', c: '1' },
      },
      {
        _id: 'node-2',
        label: 'Node 2',
        type: 'preprocess',
      },
    ])
  );

  assert.equal(
    signature,
    'node-1:root:CLASSIFICATION:SVM:classifier:c:1,gamma:0.1|node-2::::preprocess:'
  );
});

test('getStageLabel and isClassificationStage handle known and unknown values', () => {
  assert.equal(getStageLabel(ClassificationStage.DATA_ENHANCEMENT), 'Покращення даних');
  assert.equal(getStageLabel(null), 'Етап не вказано');
  assert.equal(isClassificationStage(ClassificationStage.PREPROCESSING), true);
  assert.equal(isClassificationStage('OTHER_STAGE'), false);
});

test('buildTechnologyIndex sorts technologies per stage and maps by stage:name', () => {
  const index = buildTechnologyIndex(
    asTechnologies([
      { stage: ClassificationStage.CLASSIFICATION, name: 'XGBoost' },
      { stage: ClassificationStage.CLASSIFICATION, name: 'AdaBoost' },
      { stage: ClassificationStage.PREPROCESSING, name: 'Normalization' },
    ])
  );

  assert.deepEqual(
    index.byStage.get(ClassificationStage.CLASSIFICATION)?.map((item) => item.name),
    ['AdaBoost', 'XGBoost']
  );
  assert.equal(
    index.byStageName.get(`${ClassificationStage.PREPROCESSING}:Normalization`)?.name,
    'Normalization'
  );
});

test('technology helpers resolve explicit, label-based, and default selections', () => {
  const index = buildTechnologyIndex(
    asTechnologies([
      { stage: ClassificationStage.CLASSIFICATION, name: 'AdaBoost' },
      { stage: ClassificationStage.CLASSIFICATION, name: 'SVM' },
      { stage: ClassificationStage.FEATURE_EXTRACTION, name: 'PCA' },
    ])
  );

  assert.equal(
    getDefaultTechnologyForStage(index, ClassificationStage.CLASSIFICATION)?.name,
    'AdaBoost'
  );
  assert.equal(
    resolveTechnology(index, ClassificationStage.CLASSIFICATION, ' SVM ', null)?.name,
    'SVM'
  );
  assert.equal(
    resolveTechnology(index, ClassificationStage.CLASSIFICATION, '', ' AdaBoost ')?.name,
    'AdaBoost'
  );
  assert.equal(
    resolveTechnology(index, ClassificationStage.CLASSIFICATION, 'Unknown', null)?.name,
    'AdaBoost'
  );
  assert.equal(
    resolveTechnology(index, ClassificationStage.DATA_ENHANCEMENT, 'Missing', null),
    null
  );
});
