import { gql } from '@apollo/client';

export const SERVER_INFO_QUERY = gql`
  query ServerInfo {
    serverInfo {
      version
      status
      uptimeSeconds
    }
  }
`;
