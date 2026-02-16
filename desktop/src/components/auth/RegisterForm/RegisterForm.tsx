import { Form, Formik } from 'formik';
import type { FC } from 'react';
import { InputField } from '../../inputs/InputField';
import { SubmitButton } from '../../inputs/SubmitButton';
import { FormError } from '../../inputs/FormError';
import { setFormikFormErrorFromApollo } from '../../../utils/formError';
import { registerSchema } from './constants/registerSchema';
import { useRegisterMutation } from './graphql';
import type { RegisterFormProps } from './RegisterForm.types';

const RegisterForm: FC<RegisterFormProps> = ({ onSuccess }) => {
  const [registerMutation] = useRegisterMutation();

  return (
    <Formik
      initialValues={{ name: '', email: '', password: '' }}
      validationSchema={registerSchema}
      validateOnMount
      onSubmit={async (values, { setFieldError }) => {
        const result = await registerMutation({
          variables: values,
          onError: (apolloError) => setFormikFormErrorFromApollo(apolloError, setFieldError),
        });

        const token = result.data?.register.token;
        if (token) onSuccess(token);
      }}
    >
      <Form className="auth-form" noValidate>
        <InputField
          name="name"
          label="Повне імʼя"
          placeholder="Ivan Petrenko"
          autoComplete="name"
        />
        <InputField
          name="email"
          label="Електронна пошта"
          type="email"
          placeholder="novykorystuvach@example.com"
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
        <FormError />
        <SubmitButton label="Створити обліковий запис" loadingLabel="Реєстрація..." />
      </Form>
    </Formik>
  );
};

export default RegisterForm;
