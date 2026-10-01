import * as Yup from 'yup';
import { getMessages, localeService } from '../../../../i18n';

export const createLoginSchema = () => {
  const { validation } = getMessages(localeService.getLocale()).auth;
  return Yup.object({
    email: Yup.string().trim().email(validation.invalidEmail).required(validation.required),
    password: Yup.string().min(6, validation.min6).required(validation.required),
  });
};

export const loginSchema = createLoginSchema();
