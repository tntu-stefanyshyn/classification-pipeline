import type { RequestHandler } from 'express';
import { Types } from 'mongoose';

import { AuthenticationError } from '../../auth/classes/AuthenticationError';
import { AuthFlow } from '../../auth/services/AuthFlow';
import { ExperimentReportService } from '../services/ExperimentReportService';

/**
 * `GET /experiments/:experimentId/report`: the PDF report, for the owner of the experiment only.
 * The request needs the owner's JWT in `Authorization: Bearer`, like a GraphQL request; without a
 * valid one the answer is 401. A failure to check it (the database is unavailable) is a 500, so a
 * valid user is not sent to sign in again. An experiment of another user gets the same 404 as a
 * missing one.
 */
export const createExperimentReportHandler =
  (auth = new AuthFlow(), reports = new ExperimentReportService()): RequestHandler =>
  async (req, res) => {
    let userId: Types.ObjectId;
    try {
      userId = (await auth.me(req))._id;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        res.setHeader('WWW-Authenticate', 'Bearer');
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      // The credential may be valid (the user could not be loaded): signing in again would not help.
      console.error('Failed to authenticate the report request', error);
      res.status(500).json({ error: 'Failed to authenticate the request' });
      return;
    }

    const experimentId = (req.params.experimentId ?? '').trim();
    if (!experimentId) {
      res.status(400).json({ error: 'Experiment _id is required' });
      return;
    }
    if (!Types.ObjectId.isValid(experimentId)) {
      res.status(400).json({ error: 'Experiment _id is invalid' });
      return;
    }

    try {
      const report = await reports.buildForOwner(userId, experimentId);
      if (!report) {
        res.status(404).json({ error: 'Experiment not found' });
        return;
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="experiment-${experimentId}-report.pdf"`
      );
      res.status(200).send(report);
    } catch (error) {
      console.error('Failed to generate experiment report', error);
      res.status(500).json({ error: 'Failed to generate experiment report' });
    }
  };
