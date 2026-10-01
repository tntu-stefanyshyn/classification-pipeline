import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ClassificationStage } from '../src/graphql/types.generated';
import {
  collectDescendantIds,
  getGraphSignature,
} from '../src/components/experiments/ExperimentGraphConstructor/utils/graph';
import {
  applyFlowNodePositionOverrides,
  buildFlowElements,
} from '../src/components/experiments/ExperimentGraphConstructor/utils/flow';
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
  displayName?: string | null;
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
    'node-1:root:CLASSIFICATION:SVM:classifier:Node 1:c:1,gamma:0.1|node-2::::preprocess:Node 2:'
  );
});

test('getGraphSignature changes when only the visible label changes', () => {
  const ukrainian = getGraphSignature(
    asFlatNodes([
      {
        _id: 'node-1',
        parentId: 'root',
        stage: ClassificationStage.DATA_ENHANCEMENT,
        technology: 'Приглушення короткочасних артефактів',
        type: 'technology',
        label: 'Приглушення короткочасних артефактів',
      },
    ])
  );

  const english = getGraphSignature(
    asFlatNodes([
      {
        _id: 'node-1',
        parentId: 'root',
        stage: ClassificationStage.DATA_ENHANCEMENT,
        technology: 'Приглушення короткочасних артефактів',
        type: 'technology',
        label: 'Transient Artifact Suppression',
      },
    ])
  );

  assert.notEqual(ukrainian, english);
});

test('buildFlowElements places graph levels from top to bottom', () => {
  const { flowNodes } = buildFlowElements({
    nodes: asFlatNodes([
      {
        _id: 'parent',
        label: 'Parent',
        stage: ClassificationStage.PREPROCESSING,
        type: 'technology',
      },
      {
        _id: 'child-a',
        label: 'Child A',
        stage: ClassificationStage.FEATURE_EXTRACTION,
        type: 'technology',
        parentId: 'parent',
      },
      {
        _id: 'child-b',
        label: 'Child B',
        stage: ClassificationStage.CLASSIFICATION,
        type: 'technology',
        parentId: 'parent',
      },
    ]),
    selectedNodeId: null,
    collapsedNodeIds: new Set(),
    graphActionsDisabled: false,
    graphInspectionDisabled: false,
    graphUpdating: false,
    onAdd: () => undefined,
    onEdit: () => undefined,
    onDelete: () => undefined,
    onToggleCollapse: () => undefined,
  });

  const rootNode = flowNodes.find((node) => node.id === 'graph-root');
  const parentNode = flowNodes.find((node) => node.id === 'parent');
  const firstChildNode = flowNodes.find((node) => node.id === 'child-a');

  assert.ok(rootNode);
  assert.ok(parentNode);
  assert.ok(firstChildNode);
  assert.equal(rootNode.sourcePosition, 'bottom');
  assert.equal(parentNode?.targetPosition, 'top');
  assert.equal(parentNode?.sourcePosition, 'bottom');
  assert.ok((parentNode?.position.y ?? 0) > (rootNode.position.y ?? 0));
  assert.ok((firstChildNode?.position.y ?? 0) > (parentNode?.position.y ?? 0));
});

test('applyFlowNodePositionOverrides enables dragging and applies local positions', () => {
  const { flowNodes } = buildFlowElements({
    nodes: asFlatNodes([
      {
        _id: 'node-1',
        label: 'Node 1',
        stage: ClassificationStage.PREPROCESSING,
        type: 'technology',
      },
    ]),
    selectedNodeId: null,
    collapsedNodeIds: new Set(),
    graphActionsDisabled: false,
    graphInspectionDisabled: false,
    graphUpdating: false,
    onAdd: () => undefined,
    onEdit: () => undefined,
    onDelete: () => undefined,
    onToggleCollapse: () => undefined,
  });

  const updated = applyFlowNodePositionOverrides(flowNodes, { 'node-1': { x: 123, y: 456 } }, true);
  const rootNode = updated.find((node) => node.id === 'graph-root');
  const movedNode = updated.find((node) => node.id === 'node-1');

  assert.equal(rootNode?.draggable, false);
  assert.equal(movedNode?.draggable, true);
  assert.deepEqual(movedNode?.position, { x: 123, y: 456 });
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
      {
        stage: ClassificationStage.CLASSIFICATION,
        name: 'XGBoost',
        displayName: 'Extreme Gradient Boosting / Екстремальний градієнтний бустинг',
      },
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
      {
        stage: ClassificationStage.CLASSIFICATION,
        name: 'AdaBoost',
        displayName: 'Adaptive Boosting / Адаптивний бустинг',
      },
      { stage: ClassificationStage.CLASSIFICATION, name: 'SVM' },
      { stage: ClassificationStage.FEATURE_EXTRACTION, name: 'PCA' },
    ]),
    'en'
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
    resolveTechnology(
      index,
      ClassificationStage.CLASSIFICATION,
      ' Adaptive Boosting / Адаптивний бустинг ',
      null
    )?.name,
    'AdaBoost'
  );
  assert.equal(
    resolveTechnology(index, ClassificationStage.CLASSIFICATION, ' Adaptive Boosting ', null)?.name,
    'AdaBoost'
  );
  assert.equal(
    resolveTechnology(index, ClassificationStage.CLASSIFICATION, ' Адаптивний бустинг ', null)
      ?.name,
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
