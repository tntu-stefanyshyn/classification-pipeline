import io
import unittest
from unittest.mock import patch

from module_loader import load_graphql_request, load_graphql_wrapper


class ComputeGraphqlRequestTests(unittest.TestCase):
    def test_graphql_request_forwards_headers_and_returns_data(self):
        module = load_graphql_request(
            "src/aws_jobs/graphql/graphqlRequest.py",
            "test_compute_graphql_request_module",
        )
        calls = []

        class FakeClient:
            def __init__(self, endpoint):
                calls.append(("init", endpoint))

            def execute(self, query, variables=None, headers=None):
                calls.append(("execute", query, variables, headers))
                return {"data": {"pipeline": {"_id": "pipe-1"}}}

        with patch.object(module, "GraphqlClient", FakeClient):
            result = module.graphqlRequest(
                "http://backend/graphql",
                "query Pipeline { pipeline { _id } }",
                {"pipelineId": "pipe-1"},
                "svc-token",
            )

        self.assertEqual(result, {"pipeline": {"_id": "pipe-1"}})
        self.assertEqual(calls[0], ("init", "http://backend/graphql"))
        self.assertEqual(
            calls[1],
            (
                "execute",
                "query Pipeline { pipeline { _id } }",
                {"pipelineId": "pipe-1"},
                {
                    "content-type": "application/json",
                    "authorization": "Bearer svc-token",
                },
            ),
        )

    def test_graphql_request_raises_on_invalid_response_shapes(self):
        module = load_graphql_request(
            "src/aws_jobs/graphql/graphqlRequest.py",
            "test_compute_graphql_request_invalid_module",
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


class ComputeGraphqlWrapperTests(unittest.TestCase):
    def test_compute_wrappers_forward_expected_payloads(self):
        progress_module = load_graphql_wrapper(
            "src/aws_jobs/graphql/updatePipelineProgress.py",
            "test_update_pipeline_progress_module",
        )
        complete_module = load_graphql_wrapper(
            "src/aws_jobs/graphql/completePipeline.py",
            "test_complete_pipeline_module",
        )

        with patch.object(progress_module, "graphqlRequest", return_value={"ok": True}) as request:
            result = progress_module.updatePipelineProgress(
                backend_url="http://backend/graphql",
                pipelineId="pipe-1",
                message="Working",
                progress=45,
                token="svc-token",
            )

        self.assertEqual(result, {"ok": True})
        request.assert_called_once_with(
            "http://backend/graphql",
            unittest.mock.ANY,
            {
                "input": {
                    "progress": 45,
                    "message": "Working",
                    "pipelineId": "pipe-1",
                }
            },
            "svc-token",
        )

        with patch.object(complete_module, "graphqlRequest", return_value={"done": True}) as request, patch(
            "sys.stdout", new_callable=io.StringIO
        ) as stdout:
            result = complete_module.completePipeline(
                backend_url="http://backend/graphql",
                pipelineId="pipe-2",
                payload={"score": 0.9},
                token="svc-token",
            )

        self.assertEqual(result, {"done": True})
        request.assert_called_once_with(
            "http://backend/graphql",
            unittest.mock.ANY,
            {
                "input": {
                    "payload": {"score": 0.9},
                    "pipelineId": "pipe-2",
                }
            },
            "svc-token",
        )
        self.assertIn("pipe-2", stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
