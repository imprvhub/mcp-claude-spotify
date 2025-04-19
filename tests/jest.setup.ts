import { jest } from '@jest/globals';

// Set environment variables for tests
process.env.SPOTIFY_CLIENT_ID = 'test-client-id';
process.env.SPOTIFY_CLIENT_SECRET = 'test-client-secret';

// Silence console errors during tests
console.error = jest.fn();