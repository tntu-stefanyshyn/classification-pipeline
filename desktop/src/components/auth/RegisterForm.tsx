import { Form, Formik } from 'formik';
import * as Yup from 'yup';
import { useRegisterMutation } from '../../graphql/mutations/generated/register';
import { InputField } from '../inputs/InputField';
import { SubmitButton } from '../inputs/SubmitButton';

type RegisterFormProps = {
  onSuccess: (token: string) => void;
};

const registerSchema = Yup.object({
  name: Yup.string().trim().min(2, 'Мінімум 2 символи').required('Обовʼязково'),
  email: Yup.string().trim().email('Некоректна пошта').required('Обовʼязково'),
  password: Yup.string().min(6, 'Мінімум 6 символів').required('Обовʼязково'),
});

export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const [registerMutation, { loading, error }] = useRegisterMutation();

  return (
    <Formik
      initialValues={{ name: '', email: '', password: '' }}
      validationSchema={registerSchema}
      validateOnMount
      onSubmit={async (values, { setSubmitting }) => {
        const result = await registerMutation({
          variables: values,
        });

        const token = result.data?.register.token;
        if (token) {
          onSuccess(token);
        }

        setSubmitting(false);
      }}
    >
      {({ isSubmitting, isValid }) => (
        <Form className="auth-form" noValidate>
          <InputField name="name" label="Імʼя" placeholder="Ivan Petrenko" autoComplete="name" />
          <InputField
            name="email"
            label="Email"
            type="email"
            placeholder="newuser@example.com"
            autoComplete="email"
            id="register-email"
          />
          <InputField
            name="password"
            label="Пароль"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            id="register-password"
          />
          {error && <p className="error">Помилка: {error.message}</p>}
          <SubmitButton
            label="Створити акаунт"
            loadingLabel="Реєстрація..."
            loading={loading || isSubmitting}
            disabled={!isValid}
          />
        </Form>
      )}
    </Formik>
  );
}

export default RegisterForm;
