import * as Yup from 'yup';

export const experimentSchema = Yup.object({
  name: Yup.string().trim().required('Вкажіть назву'),
  description: Yup.string().trim().max(400, 'Максимум 400 символів').optional(),
  fileId: Yup.string().optional(),
});
