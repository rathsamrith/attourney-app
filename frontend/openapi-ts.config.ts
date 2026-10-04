import { defineConfig } from '@hey-api/openapi-ts'

// openapi.json is written by the Nest API on startup in development (backend/src/main.ts).
export default defineConfig({
  input: './openapi.json',
  output: 'src/api/generated',
  plugins: ['@hey-api/client-fetch', '@hey-api/typescript', '@hey-api/sdk'],
})
