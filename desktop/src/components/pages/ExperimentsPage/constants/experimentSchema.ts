import * as Yup from 'yup';
import { getMessages, localeService } from '../../../../i18n';

export const createExperimentSchema = () => {
  const { validation } = getMessages(localeService.getLocale()).experimentsPage;
  return Yup.object({
    name: Yup.string().trim().required(validation.nameRequired),
    description: Yup.string().trim().max(400, validation.descriptionMax).optional(),
    fileId: Yup.string().optional(),
  });
};

export const experimentSchema = createExperimentSchema();
