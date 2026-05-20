import { Form, Formik } from 'formik';
import type { FC } from 'react';
import { InputField } from '../../inputs/InputField';
import { SubmitButton } from '../../inputs/SubmitButton';
import { FormError } from '../../inputs/FormError';
import { setFormikFormErrorFromApollo } from '../../../utils/formError';
import { createRegisterSchema } from './constants/registerSchema';
import { useRegisterMutation } from './graphql';
import type { RegisterFormProps } from './RegisterForm.types';
import { useI18n } from '../../../i18n';

const RegisterForm: FC<RegisterFormProps> = ({ onSuccess }) => {
  const { messages } = useI18n();
  const [registerMutation] = useRegisterMutation();
  const validationSchema = createRegisterSchema();

  return (
    <Formik
      initialValues={{ name: '', email: '', password: '' }}
      validationSchema={validationSchema}
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
          label={messages.auth.registerForm.name}
          placeholder="Ivan Petrenko"
          autoComplete="name"
        />
        <InputField
          name="email"
          label={messages.auth.registerForm.email}
          type="email"
          placeholder="novykorystuvach@example.com"
          autoComplete="email"
          id="register-email"
        />
        <InputField
          name="password"
          label={messages.auth.registerForm.password}
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
          id="register-password"
        />
        <FormError />
        <SubmitButton
          label={messages.auth.registerForm.submit}
          loadingLabel={messages.auth.registerForm.loading}
        />
      </Form>
    </Formik>
  );
};

export default RegisterForm;
