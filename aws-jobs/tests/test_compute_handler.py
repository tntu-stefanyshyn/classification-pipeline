import io
import unittest
from unittest.mock import patch

from module_loader import load_compute_handler


class _FakeDataset:
    def __len__(self):
        return 12


class ComputeHandlerTests(unittest.TestCase):
    def test_load_payload_uses_environment_fallback(self):
        module = load_compute_handler()

        with patch.object(module.sys, "stdin", io.StringIO("")), patch.dict(
            module.os.environ,
            {"COMPUTE_PAYLOAD_JSON": '{"pipelineId":"pipe-1","backend_token":"svc"}'},
            clear=False,
        ):
            payload = module._load_payload()

        self.assertEqual(
            payload,
            {
                "pipelineId": "pipe-1",
                "backend_token": "svc",
            },
        )

    def test_run_compute_builds_report_and_emits_progress(self):
        module = load_compute_handler()
        payload = {
            "pipelineId": "pipe-1",
            "backend_token": "svc-token",
        }
        path = [
            {
                "stage": "PREPROCESSING",
                "technology": "Normalize",
                "settings": [{"key": "log", "value": "true"}],
            },
            {
                "stage": "CLASSIFICATION",
                "technology": "SVM",
                "settings": [],
            },
        ]
        emits = []

        with patch.dict(
            module.os.environ,
            {"COMPUTE_BACKEND_URL": "http://backend/graphql"},
            clear=False,
        ), patch.object(
            module,
            "_fetch_path_from_backend",
            return_value=(path, "file-1", {"folds": 4}),
        ), patch.object(
            module,
            "_emit",
            side_effect=lambda *args, **kwargs: emits.append((args, kwargs)),
        ), patch.object(
            module,
            "_load_dataframe",
            return_value=_FakeDataset(),
        ) as load_dataframe, patch.object(
            module,
            "_prepare_features",
            return_value=("raw-x", "labels"),
        ), patch.object(
            module,
            "_apply_preprocessing",
            return_value="normalized-x",
        ) as apply_preprocessing, patch.object(
            module,
            "_run_classifier",
            return_value=(
                [0.9],
                [0.85],
                [0.8],
                [1.47],
                [[[2, 0], [0, 1]]],
                ["A", "B"],
                3,
                [3],
                25.0,
            ),
        ) as run_classifier, patch.object(
            module.time,
            "time",
            side_effect=[100.0, 112.5],
        ):
            result = module.run_compute(payload)

        self.assertEqual(payload["file_id"], "file-1")
        self.assertEqual(payload["path"], path)
        load_dataframe.assert_called_once_with(payload, "http://backend/graphql")
        apply_preprocessing.assert_called_once_with("raw-x", {"log": "true"})
        run_classifier.assert_called_once_with(
            "normalized-x",
            "labels",
            "SVM",
            {},
            {"folds": 4},
            45.0,
            "http://backend/graphql",
            "pipe-1",
        )
        self.assertEqual(
            result,
            {
                "accuracyScores": [0.9],
                "f1Scores": [0.85],
                "rocAucScores": [0.8],
                "optimizationIntermediateScores": [1.47],
                "confusionMatrixes": [[[2, 0], [0, 1]]],
                "channelNames": ["A", "B"],
                "predictionSampleCount": 3,
                "predictionSampleCounts": [3],
                "predictionDataPercent": 25.0,
                "sampleCount": 12,
                "duration": 12.5,
            },
        )
        messages = [kwargs["message"] for _, kwargs in emits]
        self.assertEqual(messages[0], "Початок обчислення")
        self.assertIn('Початок кроку "Normalize", етап Попередня обробка', messages)
        self.assertIn('Початок кроку "SVM", етап Класифікація', messages)
        self.assertEqual(messages[-1], "Обчислення завершено")

    def test_main_completes_pipeline_with_result(self):
        module = load_compute_handler()
        payload = {"pipelineId": "pipe-1", "backend_token": "svc-token"}
        result = {"accuracyScores": [0.9], "sampleCount": 8, "duration": 1.5}

        with patch.dict(
            module.os.environ,
            {"COMPUTE_BACKEND_URL": "http://backend/graphql"},
            clear=False,
        ), patch.object(module, "_load_payload", return_value=payload), patch.object(
            module, "run_compute", return_value=result
        ), patch.object(module, "completePipeline") as complete_pipeline, patch(
            "sys.stdout", new_callable=io.StringIO
        ) as stdout:
            module.main()

        complete_pipeline.assert_called_once_with(
            backend_url="http://backend/graphql",
            payload=result,
            pipelineId="pipe-1",
            token="svc-token",
        )
        self.assertIn('"sampleCount": 8', stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
