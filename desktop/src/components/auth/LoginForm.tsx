import { Form, Formik } from 'formik';
import * as Yup from 'yup';
import { useLoginMutation } from '../../graphql/mutations/generated/login';
import { InputField } from '../inputs/InputField';
import { SubmitButton } from '../inputs/SubmitButton';
import { FormError } from '../inputs/FormError';
import { setFormikFormErrorFromApollo } from '../../utils/formError';

type LoginFormProps = {
  onSuccess: (token: string) => void;
};

const loginSchema = Yup.object({
  email: Yup.string().trim().email('Некоректна пошта').required('Обовʼязково'),
  password: Yup.string().min(6, 'Мінімум 6 символів').required('Обовʼязково'),
});

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
