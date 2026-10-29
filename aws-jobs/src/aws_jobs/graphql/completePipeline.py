from typing import Any, Dict, Optional
from graphql.graphqlRequest import graphqlRequest

def completePipeline(
  backend_url: str,
  pipelineId: str,
  payload: Dict[str, Any],
  token: Optional[str] = None,
  executionId: Optional[str] = None,
):
  mutation = """
  mutation CompletePipeline($input: CompletePipelineInput!) {
    completePipeline(input: $input)
  }
  """

  variables: Dict[str, Any] = {
    "input": {
      "payload": payload,
      "pipelineId": pipelineId,
    }
  }
  # Sent only when the backend gave one, so payloads from older backends keep working.
  if executionId:
    variables["input"]["executionId"] = executionId
  print(
    {
      "backend_url": backend_url,
      "mutation": mutation,
      "data": variables,
      "token": token,
    }
  )
  return graphqlRequest(backend_url, mutation, variables, token)
