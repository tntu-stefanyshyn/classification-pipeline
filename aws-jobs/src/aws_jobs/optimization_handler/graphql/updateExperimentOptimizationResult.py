from typing import Optional
from graphql.graphqlRequest import graphqlRequest


def updateExperimentOptimizationResult(
  backend_url: str,
  experimentId: str,
  bestPipelineId: str,
  score: float,
  token: Optional[str] = None,
):
  mutation = """
    mutation UpdateExperimentOptimizationResult($input: UpdateExperimentOptimizationResultInput!) {
      updateExperimentOptimizationResult(input: $input)
    }
  """
  return graphqlRequest(
    backend_url,
    mutation,
    {
      "input": {
        "experimentId": experimentId,
        "bestPipelineId": bestPipelineId,
        "score": score,
      }
    },
    token,
  )
