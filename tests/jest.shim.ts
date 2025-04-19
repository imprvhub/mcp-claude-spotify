// @ts-nocheck
// This file is used to shim global Jest functionality and mock types

// Set environment variables for tests
process.env.SPOTIFY_CLIENT_ID = 'test-client-id';
process.env.SPOTIFY_CLIENT_SECRET = 'test-client-secret';

// Silence console errors during tests
console.error = jest.fn();

// No need to explicitly mock modules here as they are mocked in the test files