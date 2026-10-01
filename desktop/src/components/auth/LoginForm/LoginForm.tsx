import { Form, Formik } from 'formik';
import type { FC } from 'react';
import { InputField } from '../../inputs/InputField';
import { SubmitButton } from '../../inputs/SubmitButton';
import { FormError } from '../../inputs/FormError';
import { setFormikFormErrorFromApollo } from '../../../utils/formError';
import { createLoginSchema } from './constants/loginSchema';
import { useLoginMutation } from './graphql';
import type { LoginFormProps } from './LoginForm.types';
import { useI18n } from '../../../i18n';

const LoginForm: FC<LoginFormProps> = ({ onSuccess }) => {
  const { messages } = useI18n();
  const [loginMutation] = useLoginMutation();
  const validationSchema = createLoginSchema();

  return (
    <Formik
      initialValues={{ email: '', password: '' }}
      validationSchema={validationSchema}
      onSubmit={async (values, { setFieldError }) => {
        const result = await loginMutation({
          variables: values,
          onError: (apolloError) => setFormikFormErrorFromApollo(apolloError, setFieldError),
        });

        const token = result.data?.login.token;
        if (token) onSuccess(token);
      }}
    >
      <Form className="auth-form" noValidate>
        <InputField
          name="email"
          label={messages.auth.loginForm.email}
          type="email"
          placeholder="korystuvach@example.com"
          autoComplete="email"
        />
        <InputField
          name="password"
          label={messages.auth.loginForm.password}
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
        />
        <FormError />
        <SubmitButton
          label={messages.auth.loginForm.submit}
          loadingLabel={messages.auth.loginForm.loading}
        />
      </Form>
    </Formik>
  );
};

export default LoginForm;
