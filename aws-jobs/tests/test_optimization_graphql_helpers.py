import unittest
from unittest.mock import patch

from module_loader import load_graphql_request, load_graphql_wrapper


class OptimizationGraphqlRequestTests(unittest.TestCase):
    def test_graphql_request_raises_on_invalid_response_shapes(self):
        module = load_graphql_request(
            "src/aws_jobs/optimization_handler/graphql/graphqlRequest.py",
            "test_optimization_graphql_request_invalid_module",
        )

        class InvalidClient:
            def __init__(self, endpoint):
                self.endpoint = endpoint

            def execute(self, query, variables=None, headers=None):
                return "invalid-response"

        with patch.object(module, "GraphqlClient", InvalidClient):
            with self.assertRaisesRegex(
                ValueError, "GraphQL client returned unexpected response"
            ):
                module.graphqlRequest("http://backend/graphql", "query Test")

    def test_graphql_request_raises_first_graphql_error_message(self):
        module = load_graphql_request(
            "src/aws_jobs/optimization_handler/graphql/graphqlRequest.py",
            "test_optimization_graphql_request_error_module",
        )

        class ErrorClient:
            def __init__(self, endpoint):
                self.endpoint = endpoint

            def execute(self, query, variables=None, headers=None):
                return {"errors": [{"message": "Backend exploded"}]}

        with patch.object(module, "GraphqlClient", ErrorClient):
            with self.assertRaisesRegex(ValueError, "Backend exploded"):
                module.graphqlRequest("http://backend/graphql", "query Test")


class OptimizationGraphqlWrapperTests(unittest.TestCase):
    def test_optimization_wrappers_forward_expected_payloads(self):
        experiment_progress = load_graphql_wrapper(
            "src/aws_jobs/optimization_handler/graphql/updateExperimentProgress.py",
            "test_update_experiment_progress_module",
        )
        experiment_result = load_graphql_wrapper(
            "src/aws_jobs/optimization_handler/graphql/updateExperimentOptimizationResult.py",
            "test_update_experiment_optimization_result_module",
        )
        pipeline_result = load_graphql_wrapper(
            "src/aws_jobs/optimization_handler/graphql/updatePipelineOptimizationResult.py",
            "test_update_pipeline_optimization_result_module",
        )

        with patch.object(
            experiment_progress, "graphqlRequest", return_value={"ok": True}
        ) as request:
            experiment_progress.updateExperimentProgress(
                backend_url="http://backend/graphql",
                experimentId="exp-1",
                message="Optimizing",
                progress=70,
                status="optimizing",
                token="svc-token",
            )

        request.assert_called_once_with(
            "http://backend/graphql",
            unittest.mock.ANY,
            {
                "input": {
                    "progress": 70,
                    "message": "Optimizing",
                    "experimentId": "exp-1",
                    "status": "optimizing",
                }
            },
            "svc-token",
        )

        with patch.object(
            experiment_result, "graphqlRequest", return_value={"ok": True}
        ) as request:
            experiment_result.updateExperimentOptimizationResult(
                backend_url="http://backend/graphql",
                experimentId="exp-1",
                bestPipelineId="pipe-1",
                score=0.12,
                token="svc-token",
            )

        request.assert_called_once_with(
            "http://backend/graphql",
            unittest.mock.ANY,
            {
                "input": {
                    "experimentId": "exp-1",
                    "bestPipelineId": "pipe-1",
                    "score": 0.12,
                }
            },
            "svc-token",
        )

        with patch.object(
            pipeline_result, "graphqlRequest", return_value={"ok": True}
        ) as request:
            pipeline_result.updatePipelineOptimizationResult(
                backend_url="http://backend/graphql",
                pipelineId="pipe-1",
                score=0.12,
                token="svc-token",
            )

        request.assert_called_once_with(
            "http://backend/graphql",
            unittest.mock.ANY,
            {
                "input": {
                    "pipelineId": "pipe-1",
                    "score": 0.12,
                }
            },
            "svc-token",
        )


if __name__ == "__main__":
    unittest.main()
