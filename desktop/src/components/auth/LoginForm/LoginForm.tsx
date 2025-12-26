import { Form, Formik } from 'formik';
import { InputField } from '../../inputs/InputField/InputField';
import { SubmitButton } from '../../inputs/SubmitButton/SubmitButton';
import { FormError } from '../../inputs/FormError/FormError';
import { setFormikFormErrorFromApollo } from '../../../utils/formError';
import { loginSchema } from './constants/loginSchema';
import { useLoginMutation } from './graphql';
import type { LoginFormProps } from './LoginForm.types';

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [loginMutation] = useLoginMutation();

  return (
    <Formik
      initialValues={{ email: '', password: '' }}
      validationSchema={loginSchema}
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
          label="Email"
          type="email"
          placeholder="user@example.com"
          autoComplete="email"
        />
        <InputField
          name="password"
          label="Пароль"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
        />
        <FormError />
        <SubmitButton label="Увійти" loadingLabel="Вхід..." />
      </Form>
    </Formik>
  );
}

export default LoginForm;
