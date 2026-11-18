import cors from 'cors';

import { config } from '../config/config';

/**
 * CORS for the configured origins only. A request from another origin gets no
 * `Access-Control-Allow-Origin`, so a page there cannot read the answer; requests without an
 * Origin (workers, curl) are not affected.
 */
export const createCors = (origins: string[] = config.cors.origins) => cors({ origin: origins });
