from typing import Any, Dict, Optional
from graphql.graphqlRequest import graphqlRequest

def completePipeline(
  backend_url: str,
  pipelineId: str,
  payload: Dict[str, Any],
  executionId: str,
  token: Optional[str] = None,
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
      "executionId": executionId,
    }
  }
  print(
    {
      "backend_url": backend_url,
      "mutation": mutation,
      "data": variables,
      "token": token,
    }
  )
  return graphqlRequest(backend_url, mutation, variables, token)
