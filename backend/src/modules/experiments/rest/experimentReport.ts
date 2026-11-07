import type { RequestHandler } from 'express';
import { Types } from 'mongoose';

import { AuthFlow } from '../../auth/services/AuthFlow';
import { ExperimentReportService } from '../services/ExperimentReportService';

/**
 * `GET /experiments/:experimentId/report`: the PDF report, for the owner of the experiment only.
 * The request needs the owner's JWT in `Authorization: Bearer`, like a GraphQL request; without a
 * valid one the answer is 401. An experiment of another user gets the same 404 as a missing one.
 */
export const createExperimentReportHandler =
  (auth = new AuthFlow(), reports = new ExperimentReportService()): RequestHandler =>
  async (req, res) => {
    let userId: Types.ObjectId;
    try {
      userId = (await auth.me(req))._id;
    } catch {
      res.setHeader('WWW-Authenticate', 'Bearer');
      res.status(401).json({ error: 'Not authenticated' });
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
