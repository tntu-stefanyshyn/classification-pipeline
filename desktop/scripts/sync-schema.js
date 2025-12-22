/* eslint-disable @typescript-eslint/no-var-requires */
const { copyFileSync, existsSync } = require('fs');
const { resolve } = require('path');

const backendSchema = resolve(__dirname, '..', '..', 'backend', 'schema.gql');
const desktopSchema = resolve(__dirname, '..', 'schema.graphql');

if (!existsSync(backendSchema)) {
  console.error(`Backend schema not found at ${backendSchema}`);
  process.exit(1);
}

copyFileSync(backendSchema, desktopSchema);
console.log(`Schema synced: ${desktopSchema}`);
