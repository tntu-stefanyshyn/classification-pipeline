import { ClassificationStage } from '../graphql';
import { getMessages, localeService } from '../../../../i18n';

export const ROOT_NODE_ID = 'graph-root';
export const ROOT_NODE_LABEL = getMessages(localeService.getLocale()).graph.rootNode;
export const DEFAULT_STAGE = ClassificationStage.PREPROCESSING;
export const DEFAULT_NODE_TYPE = 'technology';
export const FLOW_HORIZONTAL_GAP = 340;
export const FLOW_VERTICAL_GAP = 32;
