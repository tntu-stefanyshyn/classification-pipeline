import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';

import { ClassificationStage } from '../experiments/classes/ClassificationStage';
import { stub } from '../../test/testUtils';
import { Technologies } from './graphql/Technologies';
import { Technology } from './classes/Technology';
import { TechnologySetting, TechnologySettingType } from './classes/TechnologySetting';
import { TechnologyModel, technologiesCollectionName } from './models/TechnologyModel';
import { TechnologyManager } from './services/TechnologyManager';

test('technology classes and model metadata are available', () => {
  const technology = new Technology();
  const setting = new TechnologySetting();

  setting.key = 'kernel';
  setting.label = 'Kernel';
  setting.type = TechnologySettingType.SELECT;
  setting.required = true;
  setting.placeholder = 'linear';
  setting.defaultValue = 'rbf';
  setting.options = ['linear', 'rbf'];

  technology._id = new Types.ObjectId();
  technology.name = 'SVM';
  technology.stage = ClassificationStage.CLASSIFICATION;
  technology.settings = [setting];

  assert.equal(technologiesCollectionName, 'technologies');
  assert.equal(TechnologyModel.modelName, 'Technology');
  assert.equal(technology.settings[0].type, TechnologySettingType.SELECT);
});

test('TechnologyManager methods forward queries to the model', async (t) => {
  const manager = new TechnologyManager();
  const findCalls: any[] = [];
  const findOneCalls: any[] = [];
  const listResult = [{ _id: new Types.ObjectId(), name: 'SVM' }];
  const stageResult = [{ _id: new Types.ObjectId(), name: 'CSP' }];
  const oneResult = { _id: new Types.ObjectId(), name: 'SVM' };

  stub(t, TechnologyModel as unknown as Record<string, unknown>, 'find', (query?: any) => {
    findCalls.push(query);
    const result = query ? stageResult : listResult;
    return {
      sort(sortBy: any) {
        assert.deepEqual(sortBy, { name: 1 });
        return {
          lean: async () => result,
        };
      },
    };
  });
  stub(t, TechnologyModel as unknown as Record<string, unknown>, 'findOne', (query: any) => {
    findOneCalls.push(query);
    return {
      lean: async () => oneResult,
    };
  });

  assert.equal(await manager.list(), listResult);
  assert.equal(await manager.findByStage(ClassificationStage.PREPROCESSING), stageResult);
  assert.equal(
    await manager.findByStageAndName(ClassificationStage.CLASSIFICATION, 'SVM'),
    oneResult
  );
  assert.deepEqual(findCalls, [undefined, { stage: ClassificationStage.PREPROCESSING }]);
  assert.deepEqual(findOneCalls, [{ stage: ClassificationStage.CLASSIFICATION, name: 'SVM' }]);
});

test('Technologies resolver delegates to manager.list', async (t) => {
  const resolver = new Technologies();
  const technologies = [{ _id: new Types.ObjectId(), name: 'SVM' }];

  stub(t, resolver as unknown as Record<string, unknown>, 'manager', {
    list: async () => technologies,
  } as any);

  assert.equal(await resolver.technologies(), technologies);
});
