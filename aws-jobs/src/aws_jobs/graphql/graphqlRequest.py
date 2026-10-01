from python_graphql_client import GraphqlClient # type: ignore
from typing import Any,  Dict,  Optional

def graphqlRequest(
    url: str, query: str, variables: Optional[Dict[str, Any]] = None, token: Optional[str] = None
) -> Dict[str, Any]:
    client = GraphqlClient(endpoint=url)
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"

    body = query
    response = client.execute(query=body, variables=variables or {}, headers=headers)
    if not isinstance(response, dict):
        raise ValueError("GraphQL client returned unexpected response")
    if response.get("errors"):
        message = response["errors"][0].get("message") or "GraphQL request failed"
        raise ValueError(message)
    if "data" not in response:
        raise ValueError("GraphQL response is empty")
    return response["data"]
