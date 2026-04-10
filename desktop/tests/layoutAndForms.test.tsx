import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import React from 'react';

import {
  createUseStateStub,
  findElement,
  findElements,
  getElementName,
  ignoreCssImports,
  loadFreshModule,
  stubResolvedModule,
} from './testUtils';

const stubReactHooks = (t: TestContext, compiledFile: string, seededValues: unknown[] = []) => {
  const state = createUseStateStub(seededValues);

  stubResolvedModule(t, compiledFile, 'react', {
    ...React,
    useState: state.useState,
    useMemo: <T,>(factory: () => T) => factory(),
    useCallback: <T extends (...args: any[]) => any>(callback: T) => callback,
    useRef: <T,>(value: T) => ({ current: value }),
    useEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect();
      if (typeof cleanup === 'function') {
        cleanup();
      }
    },
  });

  return state;
};

const setWindowEnvironment = (t: TestContext) => {
  const previousWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  const previousDocument = (globalThis as typeof globalThis & { document?: unknown }).document;
  const previousLocalStorage = (globalThis as typeof globalThis & { localStorage?: unknown })
    .localStorage;

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      innerWidth: 480,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      body: {
        classList: { toggle: () => undefined },
        style: { overflow: '' },
      },
    },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: () => 'dark',
      setItem: () => undefined,
      removeItem: () => undefined,
    },
  });

  t.after(() => {
    if (previousWindow === undefined) {
      delete (globalThis as typeof globalThis & { window?: unknown }).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        writable: true,
        value: previousWindow,
      });
    }

    if (previousDocument === undefined) {
      delete (globalThis as typeof globalThis & { document?: unknown }).document;
    } else {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        writable: true,
        value: previousDocument,
      });
    }

    if (previousLocalStorage === undefined) {
      delete (globalThis as typeof globalThis & { localStorage?: unknown }).localStorage;
    } else {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        writable: true,
        value: previousLocalStorage,
      });
    }
  });
};

test('AuthLayout initializes mobile theme state and wires sidebar actions', (t) => {
  const authLayoutModulePath = path.resolve(
    __dirname,
    '../src/components/layout/AuthLayout/AuthLayout'
  );
  const authLayoutCompiledFile = path.resolve(
    __dirname,
    '../src/components/layout/AuthLayout/AuthLayout.js'
  );
  const toggleCalls: Array<[string, boolean]> = [];
  const storageCalls: Array<[string, string]> = [];

  setWindowEnvironment(t);
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      innerWidth: 480,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      body: {
        classList: {
          toggle: (token: string, active: boolean) => toggleCalls.push([token, active]),
        },
        style: { overflow: '' },
      },
    },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: () => 'dark',
      setItem: (key: string, value: string) => storageCalls.push([key, value]),
      removeItem: () => undefined,
    },
  });

  const state = stubReactHooks(t, authLayoutCompiledFile);
  stubResolvedModule(t, authLayoutCompiledFile, '../AppSidebar', {
    AppSidebar: function AppSidebar(props: any) {
      return React.createElement('app-sidebar', props, props.children);
    },
  });

  const module =
    loadFreshModule<typeof import('../src/components/layout/AuthLayout/AuthLayout')>(
      authLayoutModulePath
    );
  const tree = module.default({
    badge: 'Demo',
    title: 'Заголовок',
    subtitle: 'Підзаголовок',
    actions: React.createElement('button', { type: 'button' }, 'Action'),
    onLogout: () => undefined,
    children: React.createElement('div', null, 'Body'),
  });

  const sidebar = findElement(tree, (element) => getElementName(element) === 'AppSidebar');
  assert.ok(sidebar);
  sidebar!.props.onToggleTheme();
  sidebar!.props.onCloseMobile();

  assert.deepEqual(toggleCalls, [['theme-dark', true]]);
  assert.deepEqual(storageCalls, [['theme', 'dark']]);
  assert.deepEqual(state.calls, [
    { index: 0, value: 'light' },
    { index: 2, value: false },
  ]);
});

test('AppSidebar exposes nav link classes and footer actions', (t) => {
  const appSidebarModulePath = path.resolve(
    __dirname,
    '../src/components/layout/AppSidebar/AppSidebar'
  );
  const appSidebarCompiledFile = path.resolve(
    __dirname,
    '../src/components/layout/AppSidebar/AppSidebar.js'
  );
  const calls: string[] = [];

  stubResolvedModule(t, appSidebarCompiledFile, 'react-router-dom', {
    NavLink: function NavLink(props: any) {
      return React.createElement('nav-link', props, props.children);
    },
  });

  const module =
    loadFreshModule<typeof import('../src/components/layout/AppSidebar/AppSidebar')>(
      appSidebarModulePath
    );
  const tree = module.default({
    onLogout: () => calls.push('logout'),
    isOpen: true,
    isMobile: true,
    onCloseMobile: () => calls.push('close-mobile'),
    theme: 'dark',
    onToggleTheme: () => calls.push('toggle-theme'),
  });

  const navLinks = findElements(tree, (element) => getElementName(element) === 'NavLink');
  assert.ok(navLinks.length > 0);
  assert.equal(navLinks[0].props.className({ isActive: true }), 'sidebar-link active');
  assert.equal(navLinks[0].props.className({ isActive: false }), 'sidebar-link');

  const buttons = findElements(tree, (element) => element.type === 'button');
  buttons.forEach((button) => button.props.onClick?.());

  assert.deepEqual(calls, ['close-mobile', 'toggle-theme', 'logout']);
});

test('Modal handles open and closed states', (t) => {
  const modalModulePath = path.resolve(__dirname, '../src/components/ui/Modal/Modal');
  const modalCompiledFile = path.resolve(__dirname, '../src/components/ui/Modal/Modal.js');
  const events: string[] = [];
  const overflowStates: string[] = [];

  setWindowEnvironment(t);
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      addEventListener: (type: string) => events.push(`add:${type}`),
      removeEventListener: (type: string) => events.push(`remove:${type}`),
    },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      body: {
        style: {
          get overflow() {
            return overflowStates[overflowStates.length - 1] ?? 'auto';
          },
          set overflow(value: string) {
            overflowStates.push(value);
          },
        },
      },
    },
  });

  stubReactHooks(t, modalCompiledFile);
  stubResolvedModule(t, modalCompiledFile, 'react-dom', {
    createPortal: (node: unknown, target: unknown) => ({ node, target }),
  });

  const module =
    loadFreshModule<typeof import('../src/components/ui/Modal/Modal')>(modalModulePath);
  const openResult = module.default({
    open: true,
    title: 'Modal',
    onClose: () => events.push('close'),
    children: React.createElement('div', null, 'content'),
  });
  const closedResult = module.default({
    open: false,
    title: 'Hidden',
    onClose: () => undefined,
    children: React.createElement('div', null, 'hidden'),
  });

  assert.ok(openResult);
  assert.equal(closedResult, null);
  assert.deepEqual(events, ['add:keydown', 'remove:keydown', 'remove:keydown']);
  assert.deepEqual(overflowStates, ['hidden', 'auto']);
});

test('Modal returns null when document is missing', (t) => {
  const modalModulePath = path.resolve(__dirname, '../src/components/ui/Modal/Modal');
  const modalCompiledFile = path.resolve(__dirname, '../src/components/ui/Modal/Modal.js');
  const previousDocument = (globalThis as typeof globalThis & { document?: unknown }).document;

  setWindowEnvironment(t);
  delete (globalThis as typeof globalThis & { document?: unknown }).document;

  stubResolvedModule(t, modalCompiledFile, 'react', {
    ...React,
    useEffect: () => undefined,
  });
  stubResolvedModule(t, modalCompiledFile, 'react-dom', {
    createPortal: () => {
      throw new Error('createPortal should not be called without document');
    },
  });

  const module =
    loadFreshModule<typeof import('../src/components/ui/Modal/Modal')>(modalModulePath);
  const result = module.default({
    open: true,
    title: 'Missing document',
    onClose: () => undefined,
    children: React.createElement('div', null, 'content'),
  });

  if (previousDocument !== undefined) {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: previousDocument,
    });
  }

  assert.equal(result, null);
});

test('Alert, Button, InputControl, CheckboxField, and FileInput render expected props', () => {
  const alertModule = loadFreshModule<typeof import('../src/components/ui/Alert/Alert')>(
    path.resolve(__dirname, '../src/components/ui/Alert/Alert')
  );
  const buttonModule = loadFreshModule<typeof import('../src/components/ui/Button/Button')>(
    path.resolve(__dirname, '../src/components/ui/Button/Button')
  );
  const inputControlModule = loadFreshModule<
    typeof import('../src/components/inputs/InputControl/InputControl')
  >(path.resolve(__dirname, '../src/components/inputs/InputControl/InputControl'));
  const checkboxModule = loadFreshModule<
    typeof import('../src/components/inputs/CheckboxField/CheckboxField')
  >(path.resolve(__dirname, '../src/components/inputs/CheckboxField/CheckboxField'));
  const fileInputModule = loadFreshModule<
    typeof import('../src/components/inputs/FileInput/FileInput')
  >(path.resolve(__dirname, '../src/components/inputs/FileInput/FileInput'));

  const alert = alertModule.default({ variant: 'error', className: 'custom', children: 'Oops' });
  const button = buttonModule.default({ loading: true, disabled: true, children: 'Save' } as any);
  const inputControl = inputControlModule.default({
    label: 'Name',
    value: 'test',
    onChange: () => undefined,
    error: 'Required',
  });
  const checkbox = checkboxModule.default({
    label: 'Cloud',
    checked: true,
    onChange: () => undefined,
  });
  const fileInput = (fileInputModule.default as any).render(
    { accept: '.csv', onChange: () => undefined, hidden: true },
    null
  );

  assert.equal(alert.props.role, 'alert');
  assert.match(alert.props.className, /alert-error/);
  assert.match(button.props.className, /btn ghost/);
  assert.equal(button.props.style.opacity, 0.7);
  assert.equal(
    findElement(inputControl, (element) => element.type === 'input')?.props.className,
    'input-error'
  );
  assert.equal(findElement(checkbox, (element) => element.type === 'input')?.props.checked, true);
  assert.deepEqual(fileInput.props.style, { display: 'none' });
});

test('InputField, SubmitButton, and FormError reflect Formik state', (t) => {
  const inputFieldModulePath = path.resolve(
    __dirname,
    '../src/components/inputs/InputField/InputField'
  );
  const inputFieldCompiledFile = path.resolve(
    __dirname,
    '../src/components/inputs/InputField/InputField.js'
  );
  const submitButtonModulePath = path.resolve(
    __dirname,
    '../src/components/inputs/SubmitButton/SubmitButton'
  );
  const submitButtonCompiledFile = path.resolve(
    __dirname,
    '../src/components/inputs/SubmitButton/SubmitButton.js'
  );
  const formErrorModulePath = path.resolve(
    __dirname,
    '../src/components/inputs/FormError/FormError'
  );
  const formErrorCompiledFile = path.resolve(
    __dirname,
    '../src/components/inputs/FormError/FormError.js'
  );

  stubResolvedModule(t, inputFieldCompiledFile, 'formik', {
    useField: () => [
      { name: 'email', value: 'a@b.c', onChange: () => undefined },
      { touched: true, error: 'Wrong' },
    ],
    useFormikContext: () => ({ isSubmitting: true, isValid: false }),
  });
  stubResolvedModule(t, submitButtonCompiledFile, 'formik', {
    useField: () => [
      { name: 'email', value: 'a@b.c', onChange: () => undefined },
      { touched: true, error: 'Wrong' },
    ],
    useFormikContext: () => ({
      isSubmitting: true,
      isValid: false,
      errors: { form: '  Form error  ' },
    }),
  });
  stubResolvedModule(t, formErrorCompiledFile, 'formik', {
    useField: () => [
      { name: 'email', value: 'a@b.c', onChange: () => undefined },
      { touched: true, error: 'Wrong' },
    ],
    useFormikContext: () => ({
      isSubmitting: true,
      isValid: false,
      errors: { form: '  Form error  ' },
    }),
  });

  const inputFieldModule =
    loadFreshModule<typeof import('../src/components/inputs/InputField/InputField')>(
      inputFieldModulePath
    );
  const submitButtonModule =
    loadFreshModule<typeof import('../src/components/inputs/SubmitButton/SubmitButton')>(
      submitButtonModulePath
    );
  const formErrorModule =
    loadFreshModule<typeof import('../src/components/inputs/FormError/FormError')>(
      formErrorModulePath
    );

  const inputField = inputFieldModule.default({ name: 'email', label: 'Email' });
  const submitButton = submitButtonModule.default({ label: 'Save', loadingLabel: 'Saving' });
  const formError = formErrorModule.default({});

  assert.equal(
    findElement(inputField, (element) => element.type === 'input')?.props.className,
    'input-error'
  );
  assert.equal(
    findElement(submitButton, (element) => element.type === 'button')?.props.disabled,
    true
  );
  assert.equal(
    findElement(formError, (element) => getElementName(element) === 'Alert')?.props.variant,
    'error'
  );
});

test('MetricWeightsSlider normalizes weights and propagates slider changes', (t) => {
  const sliderModulePath = path.resolve(
    __dirname,
    '../src/components/inputs/MetricWeightsSlider/MetricWeightsSlider'
  );
  const sliderCompiledFile = path.resolve(
    __dirname,
    '../src/components/inputs/MetricWeightsSlider/MetricWeightsSlider.js'
  );
  const changes: Array<Record<string, string>> = [];

  ignoreCssImports(t);
  stubReactHooks(t, sliderCompiledFile);
  stubResolvedModule(t, sliderCompiledFile, 'rc-slider', {
    __esModule: true,
    default: function Slider(props: any) {
      return React.createElement('slider', props);
    },
  });

  const module =
    loadFreshModule<
      typeof import('../src/components/inputs/MetricWeightsSlider/MetricWeightsSlider')
    >(sliderModulePath);
  const tree = module.default({
    metrics: { accuracy: '80', f1: '10', rocAuc: '10', ntps: '10' },
    labels: { accuracy: 'A', f1: 'F', rocAuc: 'R', ntps: 'N' },
    metricKeys: ['accuracy', 'f1', 'rocAuc', 'ntps'],
    onChange: (value) => changes.push(value),
  });

  const slider = findElement(tree, (element) => getElementName(element) === 'Slider');
  slider!.props.onChange([25, 50, 75]);

  assert.deepEqual(changes[0], {
    accuracy: '72.73',
    f1: '9.09',
    rocAuc: '9.09',
    ntps: '9.09',
  });
  assert.deepEqual(changes[1], {
    accuracy: '25',
    f1: '25',
    rocAuc: '25',
    ntps: '25',
  });
});

test('Graph settings helpers and modal normalize, validate, and save settings', (t) => {
  const helpers = loadFreshModule<
    typeof import('../src/components/experiments/GraphSettingsModal/utils/settings')
  >(path.resolve(__dirname, '../src/components/experiments/GraphSettingsModal/utils/settings'));
  const modalModulePath = path.resolve(
    __dirname,
    '../src/components/experiments/GraphSettingsModal/GraphSettingsModal'
  );
  const modalCompiledFile = path.resolve(
    __dirname,
    '../src/components/experiments/GraphSettingsModal/GraphSettingsModal.js'
  );
  const onSaveCalls: any[] = [];
  const validationErrors = helpers.validateGraphSettings({
    metrics: { accuracy: '50', f1: '30', rocAuc: '', ntps: '10' },
    queues: [],
    folds: 0,
    hyperOptimizationMinutesPerPipeline: 0,
    predictDataPercent: 100,
  });

  assert.equal(helpers.normalizeMetricInput('101', '0'), '100');
  assert.equal(validationErrors.isValid, false);
  assert.ok(validationErrors.errors.length > 0);

  const settings = {
    metrics: { accuracy: 0.4, f1: 0.2, rocAuc: 0.2, ntps: 0.2 },
    queues: ['local', 'cloud'],
    folds: 5,
    hyperOptimizationMinutesPerPipeline: 20,
    predictDataPercent: 25,
  } as any;
  const seededDraft = helpers.buildSettingsDraft(settings);
  const state = stubReactHooks(t, modalCompiledFile, [seededDraft]);

  const module =
    loadFreshModule<
      typeof import('../src/components/experiments/GraphSettingsModal/GraphSettingsModal')
    >(modalModulePath);
  const tree = module.default({
    open: true,
    settings,
    onClose: () => undefined,
    onSave: (value) => onSaveCalls.push(value),
    isBusy: false,
    isLocked: false,
    errorMessage: null,
  });

  findElement(tree, (element) => getElementName(element) === 'MetricWeightsSlider')!.props.onChange(
    {
      accuracy: '25',
      f1: '25',
      rocAuc: '25',
      ntps: '25',
    }
  );
  findElements(tree, (element) => getElementName(element) === 'CheckboxField')[0].props.onChange();
  findElements(tree, (element) => getElementName(element) === 'InputControl')[0].props.onChange({
    target: { value: '7' },
  });
  const saveButton = findElements(tree, (element) => element.type === 'button').find(
    (element) => element.props.children === 'Зберегти'
  );
  saveButton!.props.onClick();

  assert.ok(state.calls.length >= 3);
  assert.deepEqual(onSaveCalls, [
    {
      metrics: { accuracy: 0.4, f1: 0.2, rocAuc: 0.2, ntps: 0.2 },
      queues: ['local', 'cloud'],
      folds: 5,
      hyperOptimizationMinutesPerPipeline: 20,
      predictDataPercent: 25,
    },
  ]);
});
