import * as Yup from 'yup';

export const registerSchema = Yup.object({
  name: Yup.string().trim().min(2, 'Мінімум 2 символи').required('Обовʼязково'),
  email: Yup.string().trim().email('Некоректна пошта').required('Обовʼязково'),
  password: Yup.string().min(6, 'Мінімум 6 символів').required('Обовʼязково'),
});
