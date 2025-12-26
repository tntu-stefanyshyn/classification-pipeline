import * as Yup from 'yup';

export const validationSchema = Yup.object({
  name: Yup.string().trim().min(3, 'Мінімум 3 символи').required('Вкажіть назву'),
  description: Yup.string().trim().max(400, 'Максимум 400 символів').optional(),
  fileId: Yup.string().optional(),
});
