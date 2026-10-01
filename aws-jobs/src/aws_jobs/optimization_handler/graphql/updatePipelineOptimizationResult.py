from typing import Optional
from graphql.graphqlRequest import graphqlRequest


def updatePipelineOptimizationResult(
  backend_url: str,
  pipelineId: str,
  score: float,
  token: Optional[str] = None,
):
  mutation = """
    mutation UpdatePipelineOptimization($input: UpdatePipelineOptimizationInput!) {
      updatePipelineOptimization(input: $input)
    }
  """
  return graphqlRequest(
    backend_url,
    mutation,
    {
      "input": {
        "pipelineId": pipelineId,
        "score": score,
      }
    },
    token,
  )
