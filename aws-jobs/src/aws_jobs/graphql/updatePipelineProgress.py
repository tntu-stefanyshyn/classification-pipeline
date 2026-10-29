from typing import Any, Dict, Optional
from graphql.graphqlRequest import graphqlRequest

def updatePipelineProgress(
  backend_url: str,
  pipelineId: str,
  message: Optional[str] = None,
  progress: Optional[float] = None,
  token: Optional[str] = None,
  executionId: Optional[str] = None,
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
    }
  }
  # Sent only when the backend gave one, so payloads from older backends keep working.
  if executionId:
    variables["input"]["executionId"] = executionId
  return graphqlRequest(backend_url, mutation, variables, token)