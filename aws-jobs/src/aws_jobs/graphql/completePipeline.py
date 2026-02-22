from typing import Any, Dict, Optional
from graphql.graphqlRequest import graphqlRequest

def completePipeline(
  backend_url: str,
  pipelineId: str,
  payload: Dict[str, Any],
  token: Optional[str] = None,
):
  mutation = """
  mutation CompletePipeline($input: CompletePipelineInput!) {
    completePipeline(input: $input)
  }
  """

  print(
    {
      "backend_url": backend_url,
      "mutation": mutation,
      "data": {
        "input": {
          "payload": payload,
          "pipelineId": pipelineId,
        }
      },
      "token": token,
    }
  )
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
