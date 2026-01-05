from typing import Any, Dict, Optional
from graphql.graphqlRequest import graphqlRequest

def completePipeline(
  backend_url: str,
  pipelineId: str,
  payload: Dict[str, Any],
  token: Optional[str] = None,
):
  mutation = """
  mutation ChangePipelineStatus($input: ChangePipelineStatusInput!) {
    changePipelineStatus(input: $input)
  }
  """
  // TODO
  return graphqlRequest(
    backend_url,
    mutation,
    {
      "input": {
        "payload": payload,
        "pipelineId": pipelineId,
      }
    },
    token,
  )