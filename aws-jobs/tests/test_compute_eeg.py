import unittest

try:
    import numpy as np
    import pandas as pd
    import mne
    import asrpy
except ImportError as exc:
    raise unittest.SkipTest("Install aws-jobs/requirements.txt for EEG tests") from exc

from aws_jobs.eeg import Epochs, apply_asr, apply_csp


class EEGTests(unittest.TestCase):
    def test_csp_discriminates_labelled_training_epochs(self):
        rng = np.random.default_rng(4)
        labels = np.tile([0, 1], 8)
        signal = rng.normal(size=(16, 2, 256))
        signal[np.arange(16), labels] *= 5
        train, validation, metadata = apply_csp(signal[:12], labels[:12], signal[12:], {})
        self.assertEqual(train.shape, (12, 2))
        self.assertEqual(validation.shape, (4, 2))
        self.assertGreater(np.abs(validation[0] - validation[1]).sum(), 1)
        self.assertEqual(metadata["algorithm"], "mne.decoding.CSP")

    def test_asr_reconstructs_burst_and_preserves_epoch_shape(self):
        rng = np.random.default_rng(8)
        clean = rng.normal(size=(2, 2048)) * 1e-6
        epoch = rng.normal(size=(2, 512)) * 1e-6
        epoch[:, 150:300] += rng.normal(size=150) * 80e-6
        reconstructed, metadata = apply_asr(
            epoch[None], clean, ["C3", "C4"], 128, {"cutoff": "5"}
        )
        self.assertEqual(reconstructed.shape, (1, 2, 512))
        self.assertTrue(np.isfinite(reconstructed).all())
        self.assertLess(np.linalg.norm(reconstructed[0, :, 150:300]),
                        np.linalg.norm(epoch[:, 150:300]) / 2)
        self.assertEqual(metadata["algorithm"], "asrpy.ASR")

    def test_epoch_schema_rejects_missing_samples_and_mixed_labels(self):
        frame = pd.DataFrame({
            "class": ["left", "left", "right", "right"],
            "epoch_id": ["a", "a", "b", "b"], "sample": [0, 1, 0, 1],
            "sampling_rate_hz": [128] * 4, "C3": [1, 2, 3, 4], "C4": [2, 3, 4, 5],
        })
        epochs = Epochs.from_dataframe(frame.iloc[::-1])
        np.testing.assert_array_equal(epochs.signal[1], [[1, 2], [2, 3]])
        with self.assertRaisesRegex(ValueError, "sample"):
            Epochs.from_dataframe(frame.assign(sample=[0, 2, 0, 1]))
        with self.assertRaisesRegex(ValueError, "class"):
            Epochs.from_dataframe(frame.assign(**{"class": ["left", "right", "right", "right"]}))

    def test_calibration_and_labels_come_from_training_indices(self):
        from unittest.mock import patch
        from module_loader import _base_graphql_stubs, _load_module

        worker = _load_module(
            "aws_jobs._test_eeg_worker", "src/aws_jobs/compute_handler.py", _base_graphql_stubs()
        )
        frame = pd.DataFrame({
            "class": ["a", "a", "b", "b", "a", "a"],
            "epoch_id": ["validation"] * 2 + ["clean-train"] * 2 + ["other-train"] * 2,
            "sample": [0, 1] * 3, "sampling_rate_hz": [128] * 6,
            "asr_clean": [1, 1, 1, 1, 0, 0],
            "C3": [20, 21, 2, 3, 4, 5], "C4": [30, 31, 6, 7, 8, 9],
        })
        path = [
            {"stage": "PREPROCESSING", "technology": "CSP"},
            {"stage": "DATA_ENHANCEMENT", "technology": "ASR"},
            {"stage": "CLASSIFICATION", "technology": "SVM"},
        ]

        with patch("aws_jobs.eeg.apply_asr", side_effect=lambda x, *_: (x, {})) as asr, \
             patch("aws_jobs.eeg.apply_csp", side_effect=lambda x, _, z, s: (x, z, {})) as csp:
            labels, features, metadata = worker._prepare_eeg_run(frame, path)
            features(np.array([1, 2]), np.array([0]), labels.iloc[[1, 2]])
            np.testing.assert_array_equal(asr.call_args.args[1], [[2, 3], [6, 7]])
            np.testing.assert_array_equal(csp.call_args.args[0][:, 0], [[2, 3], [4, 5]])
            self.assertEqual(list(csp.call_args.args[1]), ["b", "a"])
            self.assertEqual(metadata["folds"][0]["steps"][0]["calibration"]["epoch_id"], "clean-train")
            with self.assertRaisesRegex(ValueError, "no training epoch"):
                features(np.array([2]), np.array([0, 1]), labels.iloc[[2]])
