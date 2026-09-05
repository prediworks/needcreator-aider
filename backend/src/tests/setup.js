import { jest } from '@jest/globals';

// Increase timeout for all tests
jest.setTimeout(10000);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Setup global test utilities
global.testUtils = {
  generateMockFirebaseUid: () => `test-uid-${Date.now()}-${Math.random()}`,
  generateMockEmail: () => `test-${Date.now()}@test.com`,
};
