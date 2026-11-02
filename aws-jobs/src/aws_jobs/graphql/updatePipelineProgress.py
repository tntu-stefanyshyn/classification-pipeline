from typing import Any, Dict, Optional
from graphql.graphqlRequest import graphqlRequest

def updatePipelineProgress(
  backend_url: str,
  pipelineId: str,
  executionId: str,
  message: Optional[str] = None,
  progress: Optional[float] = None,
  token: Optional[str] = None,
):
  mutation = """
    mutation UpdatePipelineProgress($input: UpdatePipelineProgressInput!) {
      updatePipelineProgress(input: $input) {
        _id
      }
    }
  """
  variables: Dict[str, Any] = {
    "input": {
      "progress": progress,
      "message": message,
      "pipelineId": pipelineId,
      "executionId": executionId,
    }
  }
  return graphqlRequest(backend_url, mutation, variables, token)