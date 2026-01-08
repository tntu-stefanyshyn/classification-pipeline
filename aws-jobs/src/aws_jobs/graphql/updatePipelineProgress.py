from typing import Optional
from graphql.graphqlRequest import graphqlRequest

def updatePipelineProgress(
  backend_url: str,
  pipelineId: str,
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
  return graphqlRequest(
    backend_url,
    mutation,
      {
      "input": {
        "progress": progress,
        "message": message,
        "pipelineId": pipelineId
      }
    },
    token,
  )