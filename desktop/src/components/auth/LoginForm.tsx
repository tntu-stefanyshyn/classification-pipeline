import { Form, Formik } from 'formik';
import * as Yup from 'yup';
import { useLoginMutation } from '../../graphql/mutations/generated/login';
import { InputField } from '../inputs/InputField';
import { SubmitButton } from '../inputs/SubmitButton';

type LoginFormProps = {
  onSuccess: (token: string) => void;
};

const loginSchema = Yup.object({
  email: Yup.string().trim().email('Некоректна пошта').required('Обовʼязково'),
  password: Yup.string().min(6, 'Мінімум 6 символів').required('Обовʼязково'),
});

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [loginMutation, { loading, error }] = useLoginMutation();

  return (
    <Formik
      initialValues={{ email: '', password: '' }}
      validationSchema={loginSchema}
      onSubmit={async (values, { setSubmitting }) => {
        const result = await loginMutation({
          variables: values,
        });

        const token = result.data?.login.token;
        if (token) {
          onSuccess(token);
        }

        setSubmitting(false);
      }}
    >
      {({ isSubmitting, isValid }) => (
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
          {error && <p className="error">Помилка: {error.message}</p>}
          <SubmitButton
            label="Увійти"
            loadingLabel="Вхід..."
            loading={loading || isSubmitting}
            disabled={!isValid}
          />
        </Form>
      )}
    </Formik>
  );
}

export default LoginForm;
