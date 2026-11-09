import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import React from 'react';

import {
  findElement,
  findElements,
  getElementName,
  loadFreshModule,
  stubResolvedModule,
} from './testUtils';
import uk from '../src/i18n/uk';

test('LoginForm submits credentials and reports the session', async (t) => {
  const modulePath = path.resolve(__dirname, '../src/components/auth/LoginForm/LoginForm');
  const compiledFile = path.resolve(__dirname, '../src/components/auth/LoginForm/LoginForm.js');
  const loginCalls: any[] = [];
  const formErrors: string[] = [];
  const successTokens: unknown[] = [];

  stubResolvedModule(t, compiledFile, './graphql', {
    useLoginMutation: () => [
      async (options: any) => {
        loginCalls.push(options);
        options.onError?.({ message: 'Invalid credentials' });
        return { data: { login: { token: 'token-123', refreshToken: 'refresh-123' } } };
      },
    ],
  });
  stubResolvedModule(t, compiledFile, '../../../utils/formError', {
    setFormikFormErrorFromApollo: (
      _error: unknown,
      setFieldError: (field: string, message: string) => void
    ) => {
      setFieldError('form', 'Невірний логін');
      formErrors.push('mapped');
    },
  });

  const module =
    loadFreshModule<typeof import('../src/components/auth/LoginForm/LoginForm')>(modulePath);
  const tree = module.default({
    onSuccess: (token) => successTokens.push(token),
  });
  const formik = findElement(tree, (element) => getElementName(element) === 'Formik');
  const fieldErrors: Array<[string, string]> = [];

  await formik!.props.onSubmit(
    { email: 'user@example.com', password: 'secret' },
    {
      setFieldError: (field: string, message: string) => fieldErrors.push([field, message]),
    }
  );

  assert.equal(loginCalls[0].variables.email, 'user@example.com');
  assert.equal(loginCalls[0].variables.password, 'secret');
  assert.deepEqual(fieldErrors, [['form', 'Невірний логін']]);
  assert.deepEqual(formErrors, ['mapped']);
  assert.deepEqual(successTokens, [{ token: 'token-123', refreshToken: 'refresh-123' }]);
});

test('RegisterForm submits values and returns the registration session', async (t) => {
  const modulePath = path.resolve(__dirname, '../src/components/auth/RegisterForm/RegisterForm');
  const compiledFile = path.resolve(
    __dirname,
    '../src/components/auth/RegisterForm/RegisterForm.js'
  );
  const registerCalls: any[] = [];
  const successTokens: unknown[] = [];

  stubResolvedModule(t, compiledFile, './graphql', {
    useRegisterMutation: () => [
      async (options: any) => {
        registerCalls.push(options);
        return { data: { register: { token: 'reg-token', refreshToken: 'reg-refresh' } } };
      },
    ],
  });
  stubResolvedModule(t, compiledFile, '../../../utils/formError', {
    setFormikFormErrorFromApollo: () => undefined,
  });

  const module =
    loadFreshModule<typeof import('../src/components/auth/RegisterForm/RegisterForm')>(modulePath);
  const tree = module.default({
    onSuccess: (token) => successTokens.push(token),
  });
  const formik = findElement(tree, (element) => getElementName(element) === 'Formik');

  await formik!.props.onSubmit(
    { name: 'Ivan', email: 'ivan@example.com', password: 'secret' },
    {
      setFieldError: () => undefined,
    }
  );

  assert.equal(registerCalls[0].variables.name, 'Ivan');
  assert.equal(registerCalls[0].variables.email, 'ivan@example.com');
  assert.equal(registerCalls[0].variables.password, 'secret');
  assert.deepEqual(successTokens, [{ token: 'reg-token', refreshToken: 'reg-refresh' }]);
});

test('LoginPage and RegisterPage render auth cards and cross-links', (t) => {
  const loginPagePath = path.resolve(__dirname, '../src/components/pages/LoginPage/LoginPage');
  const loginPageCompiledFile = path.resolve(
    __dirname,
    '../src/components/pages/LoginPage/LoginPage.js'
  );
  const registerPagePath = path.resolve(
    __dirname,
    '../src/components/pages/RegisterPage/RegisterPage'
  );
  const registerPageCompiledFile = path.resolve(
    __dirname,
    '../src/components/pages/RegisterPage/RegisterPage.js'
  );

  stubResolvedModule(t, loginPageCompiledFile, 'react-router-dom', {
    Link: function Link(props: any) {
      return React.createElement('link', props, props.children);
    },
  });
  stubResolvedModule(t, loginPageCompiledFile, '../../auth/LoginForm', {
    LoginForm: function LoginForm(props: any) {
      return React.createElement('login-form', props);
    },
  });
  stubResolvedModule(t, loginPageCompiledFile, '../../../services/tokenService', {
    useSessionExpired: () => false,
  });
  stubResolvedModule(t, registerPageCompiledFile, 'react-router-dom', {
    Link: function Link(props: any) {
      return React.createElement('link', props, props.children);
    },
  });
  stubResolvedModule(t, registerPageCompiledFile, '../../auth/RegisterForm', {
    RegisterForm: function RegisterForm(props: any) {
      return React.createElement('register-form', props);
    },
  });

  const loginPage = loadFreshModule<typeof import('../src/components/pages/LoginPage/LoginPage')>(
    loginPagePath
  ).default({
    onLoginSuccess: () => undefined,
  });
  const registerPage = loadFreshModule<
    typeof import('../src/components/pages/RegisterPage/RegisterPage')
  >(registerPagePath).default({
    onRegisterSuccess: () => undefined,
  });

  assert.equal(
    findElement(loginPage, (element) => getElementName(element) === 'LoginForm')?.props
      .onSuccess !== undefined,
    true
  );
  assert.equal(
    findElement(registerPage, (element) => getElementName(element) === 'RegisterForm')?.props
      .onSuccess !== undefined,
    true
  );
  assert.equal(
    findElements(loginPage, (element) => getElementName(element) === 'Link')[0].props.to,
    '/register'
  );
  assert.equal(
    findElements(registerPage, (element) => getElementName(element) === 'Link')[0].props.to,
    '/login'
  );
  assert.equal(
    findElement(loginPage, (element) => getElementName(element) === 'Alert'),
    null
  );
});

test('LoginPage explains that the session has ended', (t) => {
  const loginPagePath = path.resolve(__dirname, '../src/components/pages/LoginPage/LoginPage');
  const loginPageCompiledFile = path.resolve(
    __dirname,
    '../src/components/pages/LoginPage/LoginPage.js'
  );
  stubResolvedModule(t, loginPageCompiledFile, 'react-router-dom', {
    Link: function Link(props: any) {
      return React.createElement('link', props, props.children);
    },
  });
  stubResolvedModule(t, loginPageCompiledFile, '../../auth/LoginForm', {
    LoginForm: function LoginForm(props: any) {
      return React.createElement('login-form', props);
    },
  });
  stubResolvedModule(t, loginPageCompiledFile, '../../../services/tokenService', {
    useSessionExpired: () => true,
  });

  const loginPage = loadFreshModule<typeof import('../src/components/pages/LoginPage/LoginPage')>(
    loginPagePath
  ).default({ onLoginSuccess: () => undefined });

  const notice = findElement(loginPage, (element) => getElementName(element) === 'Alert');
  assert.equal(notice?.props.children, uk.auth.loginPage.sessionExpired);
});
