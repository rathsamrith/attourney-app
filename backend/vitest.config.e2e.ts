import 'dotenv/config';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// E2E tests write fixtures that can never be deleted (by design), so they get their own
// database next to the dev one: .../attest -> .../attest_test. test/global-setup.ts
// creates, migrates and seeds it.
const testUrl = new URL(process.env.DATABASE_URL!);
testUrl.pathname = `${testUrl.pathname}_test`;
process.env.E2E_DATABASE_URL = testUrl.toString();

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    env: { DATABASE_URL: testUrl.toString() },
    globalSetup: ['./test/global-setup.ts'],
  },
});
