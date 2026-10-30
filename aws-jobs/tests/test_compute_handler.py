import io
import unittest
from types import SimpleNamespace
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

    def test_load_payload_raises_when_missing(self):
        module = load_compute_handler()

        with patch.object(module.sys, "stdin", io.StringIO("")), patch.dict(
            module.os.environ,
            {},
            clear=True,
        ):
            with self.assertRaises(ValueError) as error:
                module._load_payload()

        self.assertEqual(error.exception.args[0], "PAYLOAD_NOT_FOUND")

    def test_format_step_log_falls_back_for_blank_values(self):
        module = load_compute_handler()

        message = module._format_step_log("Початок", "   ", "")

        self.assertEqual(message, 'Початок "Невідомий етап", етап Невідомий етап')

    def test_settings_to_dict_skips_blank_and_empty_values(self):
        module = load_compute_handler()

        result = module._settings_to_dict(
            [
                {"key": " threshold ", "value": " 3 "},
                {"key": "method", "value": " winsor "},
                {"key": "ignored-none", "value": None},
                {"key": "", "value": "5"},
                {"key": "ignored-empty", "value": "   "},
            ]
        )

        self.assertEqual(
            result,
            {
                "threshold": "3",
                "method": "winsor",
            },
        )

    def test_build_classifier_normalizes_svm_and_cnn_settings(self):
        module = load_compute_handler()

        svm = module._build_classifier(
            " SVM ",
            {
                "c": "2.5",
                "kernel": "RBF",
                "degree": "4",
                "gamma": "scale",
                "coef0": "0.75",
                "shrinking": "0",
                "probability": "false",
                "tol": "0.001",
                "max_iter": "150",
                "class_weight": "balanced",
            },
        )
        cnn = module._build_classifier(
            "cnn",
            {
                "epochs": "20",
                "batch_size": "16",
                "learning_rate": "0.05",
                "optimizer": "sgd",
                "random_state": "9",
            },
        )

        self.assertEqual(
            svm.kwargs,
            {
                "C": 2.5,
                "kernel": "rbf",
                "degree": 4,
                "gamma": "scale",
                "coef0": 0.75,
                "shrinking": False,
                "probability": True,
                "tol": 0.001,
                "max_iter": 150,
                "class_weight": "balanced",
            },
        )
        self.assertEqual(
            cnn.kwargs,
            {
                "hidden_layer_sizes": (128, 64),
                "max_iter": 20,
                "batch_size": 16,
                "learning_rate_init": 0.05,
                "solver": "sgd",
                "random_state": 9,
            },
        )

    def test_fetch_path_from_backend_rejects_missing_graph_nodes(self):
        module = load_compute_handler()

        graphql_responses = [
            {
                "pipeline": {
                    "experimentId": "exp-1",
                    "pathNodeIds": ["node-1", "node-2"],
                }
            },
            {
                "experiment": {
                    "fileId": "file-1",
                    "graph": {
                        "settings": {"folds": 3},
                        "nodes": [
                            {
                                "_id": "node-1",
                                "stage": "PREPROCESSING",
                                "technology": "Normalize",
                                "settings": [],
                            }
                        ],
                    },
                }
            },
        ]

        with patch.object(module, "graphqlRequest", side_effect=graphql_responses):
            with self.assertRaises(ValueError) as error:
                module._fetch_path_from_backend(
                    "http://backend/graphql",
                    "pipe-1",
                    "svc-token",
                )

        self.assertEqual(str(error.exception), "Graph path nodes are missing")

    def test_run_compute_builds_report_and_emits_progress(self):
        module = load_compute_handler()
        payload = {
            "pipelineId": "pipe-1",
            "executionId": "3",
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
        load_dataframe.assert_called_once_with(
            payload, "http://backend/graphql", "svc-token"
        )
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
        payload = {"pipelineId": "pipe-1", "executionId": "3", "backend_token": "svc-token"}
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
            executionId="3",
        )
        self.assertIn('"sampleCount": 8', stdout.getvalue())

    def test_emit_reports_progress_for_the_claimed_execution(self):
        module = load_compute_handler()
        module._execution_id = "4"

        with patch.object(module, "updatePipelineProgress") as update_progress:
            module._emit("http://backend/graphql", "pipe-1", message="Working", progress=10)

        update_progress.assert_called_once_with(
            backend_url="http://backend/graphql",
            pipelineId="pipe-1",
            token=None,
            message="Working",
            progress=10,
            executionId="4",
        )

    def test_compute_requires_an_execution_id(self):
        module = load_compute_handler()
        payload = {"pipelineId": "pipe-1", "backend_token": "svc-token"}

        with patch.dict(
            module.os.environ,
            {"COMPUTE_BACKEND_URL": "http://backend/graphql"},
            clear=False,
        ), patch.object(module, "_load_payload", return_value=payload), patch.object(
            module, "completePipeline"
        ) as complete_pipeline:
            with self.assertRaisesRegex(ValueError, "MISSING_PARAMS"):
                module.run_compute(dict(payload))
            with self.assertRaisesRegex(ValueError, "MISSING_PARAMS"):
                module.main()

        complete_pipeline.assert_not_called()

    def test_main_emits_progress_error_and_reraises(self):
        module = load_compute_handler()
        payload = {"pipelineId": "pipe-1", "executionId": "3", "backend_token": "svc-token"}
        emits = []

        with patch.dict(
            module.os.environ,
            {"COMPUTE_BACKEND_URL": "http://backend/graphql"},
            clear=False,
        ), patch.object(module, "_load_payload", return_value=payload), patch.object(
            module, "run_compute", side_effect=RuntimeError("boom")
        ), patch.object(
            module,
            "_emit",
            side_effect=lambda *args, **kwargs: emits.append((args, kwargs)),
        ):
            with self.assertRaises(RuntimeError) as error:
                module.main()

        self.assertEqual(str(error.exception), "boom")
        self.assertEqual(
            emits,
            [
                (
                    ("http://backend/graphql", "pipe-1"),
                    {
                        "message": "RuntimeError: boom",
                        "token": "svc-token",
                    },
                )
            ],
        )


    def test_load_dataframe_forwards_token_to_signed_download_request(self):
        module = load_compute_handler()
        frame = SimpleNamespace(empty=False)

        with patch.object(
            module, "_fetch_signed_download_url", return_value="https://signed/file.csv"
        ) as fetch_url, patch.object(module.pd, "read_csv", create=True, return_value=frame) as read_csv:
            result = module._load_dataframe(
                {"file_id": "file-1"}, "http://backend/graphql", "svc-token"
            )

        self.assertIs(result, frame)
        fetch_url.assert_called_once_with("http://backend/graphql", "file-1", "svc-token")
        read_csv.assert_called_once_with("https://signed/file.csv", sep=";")


if __name__ == "__main__":
    unittest.main()
