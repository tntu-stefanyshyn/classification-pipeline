from typing import Optional
from graphql.graphqlRequest import graphqlRequest

def updateExperimentProgress(
  backend_url: str,
  experimentId: str,
  message: Optional[str] = None,
  progress: Optional[float] = None,
  status: Optional[str] = None,
  token: Optional[str] = None,
):
  mutation = """
    mutation UpdateExperimentProgress($input: UpdateExperimentProgressInput!) {
      updateExperimentProgress(input: $input)
    }
  """
  return graphqlRequest(
    backend_url,
    mutation,
      {
      "input": {
        "progress": progress,
        "message": message,
        "experimentId": experimentId,
        "status": status,
      }
    },
    token,
  )
