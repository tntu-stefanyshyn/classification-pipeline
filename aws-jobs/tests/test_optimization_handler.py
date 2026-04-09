import io
import unittest
from unittest.mock import patch

from module_loader import load_optimization_handler


class OptimizationHandlerTests(unittest.TestCase):
    def test_load_payload_normalizes_required_fields(self):
        module = load_optimization_handler()

        with patch.object(module.sys, "stdin", io.StringIO("")), patch.dict(
            module.os.environ,
            {
                "OPTIMIZATION_PAYLOAD_JSON": (
                    '{"backend_url":" http://backend/graphql ",'
                    '"experimentId":" exp-1 ",'
                    '"backend_token":" svc-token ",'
                    '"hyper_optimization_minutes_per_pipeline":"0"}'
                )
            },
            clear=False,
        ):
            payload = module._load_payload()

        self.assertEqual(
            payload,
            {
                "backend_url": "http://backend/graphql",
                "experimentId": "exp-1",
                "backend_token": "svc-token",
                "hyper_optimization_minutes_per_pipeline": 30,
            },
        )

    def test_optimize_updates_pipeline_scores_and_best_pipeline(self):
        module = load_optimization_handler()
        payload = {
            "backend_url": "http://backend/graphql",
            "experimentId": "exp-1",
            "backend_token": "svc-token",
            "hyper_optimization_minutes_per_pipeline": 7,
        }
        emits = []
        pipeline_updates = []
        experiment_updates = []

        graphql_responses = [
            {
                "experiment": {
                    "graph": {
                        "settings": {
                            "metrics": {
                                "accuracy": 1,
                                "f1": 0,
                                "rocAuc": 0,
                                "ntps": 0,
                            }
                        }
                    }
                }
            },
            {
                "pipelines": [
                    {
                        "_id": "pipe-best",
                        "status": "completed",
                        "pathNodeIds": ["a"],
                        "computingResult": {
                            "accuracyScores": [0.9],
                            "f1Scores": [0.5],
                            "rocAucScores": [0.6],
                            "sampleCount": 4,
                            "duration": 12,
                        },
                    },
                    {
                        "_id": "pipe-worse",
                        "status": "completed",
                        "pathNodeIds": ["b"],
                        "computingResult": {
                            "accuracyScores": [0.5],
                            "f1Scores": [0.9],
                            "rocAucScores": [0.8],
                            "sampleCount": 4,
                            "duration": 8,
                        },
                    },
                    {
                        "_id": "pipe-running",
                        "status": "running",
                        "computingResult": {},
                    },
                ]
            },
        ]

        with patch.object(
            module,
            "graphqlRequest",
            side_effect=graphql_responses,
        ), patch.object(
            module,
            "_emit",
            side_effect=lambda *args, **kwargs: emits.append((args, kwargs)),
        ), patch.object(
            module,
            "_update_pipeline_optimization",
            side_effect=lambda *args, **kwargs: pipeline_updates.append((args, kwargs)),
        ), patch.object(
            module,
            "_update_experiment_optimization",
            side_effect=lambda *args, **kwargs: experiment_updates.append((args, kwargs)),
        ):
            module.optimize(payload)

        self.assertEqual(len(pipeline_updates), 2)
        self.assertEqual(pipeline_updates[0][0][1], "pipe-best")
        self.assertEqual(pipeline_updates[0][0][2], 0.0)
        self.assertEqual(pipeline_updates[1][0][1], "pipe-worse")
        self.assertEqual(pipeline_updates[1][0][2], 1.0)
        self.assertEqual(
            experiment_updates,
            [
                (
                    (
                        "http://backend/graphql",
                        "exp-1",
                        "pipe-best",
                        0.0,
                    ),
                    {"token": "svc-token"},
                )
            ],
        )
        last_emit = emits[-1]
        self.assertEqual(last_emit[1]["status"], "completed")
        self.assertEqual(last_emit[1]["progress"], 100)

    def test_main_emits_failed_status_and_exits(self):
        module = load_optimization_handler()
        payload = {
            "backend_url": "http://backend/graphql",
            "experimentId": "exp-1",
            "backend_token": "svc-token",
            "hyper_optimization_minutes_per_pipeline": 5,
        }
        emits = []

        with patch.object(module, "_load_payload", return_value=payload), patch.object(
            module, "optimize", side_effect=ValueError("broken optimization")
        ), patch.object(
            module,
            "_emit",
            side_effect=lambda *args, **kwargs: emits.append((args, kwargs)),
        ):
            with self.assertRaises(SystemExit) as error:
                module.main()

        self.assertEqual(error.exception.code, 1)
        self.assertEqual(len(emits), 1)
        self.assertEqual(emits[0][0][0], "http://backend/graphql")
        self.assertEqual(emits[0][0][1], "exp-1")
        self.assertEqual(emits[0][1]["status"], "failed")
        self.assertIn("broken optimization", emits[0][1]["message"])


if __name__ == "__main__":
    unittest.main()
