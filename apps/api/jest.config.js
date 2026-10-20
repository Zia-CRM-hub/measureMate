module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testTimeout: 60000,
  globalSetup: '<rootDir>/test/global-setup.ts',
  globalTeardown: '<rootDir>/test/global-teardown.ts',
  transform: { '^.+\\.ts$': ['ts-jest', { diagnostics: false }] },
};
