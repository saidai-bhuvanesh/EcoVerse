import '@testing-library/jest-dom';

// Mock environment variables that might be missing in test environment
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.FIREBASE_API_KEY = 'test-api-key';
process.env.FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_APP_ID = 'test-app-id';
process.env.NEXTAUTH_SECRET = 'test-nextauth-secret';
process.env.NEXTAUTH_URL = 'http://localhost:3000';
process.env.CLIMATIQ_API_KEY = 'test_climatiq_key';

// Suppress console output during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
