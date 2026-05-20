import * as Yup from 'yup';
import { getMessages, localeService } from '../../../../i18n';

export const createRegisterSchema = () => {
  const { validation } = getMessages(localeService.getLocale()).auth;
  return Yup.object({
    name: Yup.string().trim().min(2, validation.min2).required(validation.required),
    email: Yup.string().trim().email(validation.invalidEmail).required(validation.required),
    password: Yup.string().min(6, validation.min6).required(validation.required),
  });
};

export const registerSchema = createRegisterSchema();
