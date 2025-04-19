/**
 * Custom error classes for better error handling
 * 
 * This file defines custom error classes for the application
 * to provide more context and better error handling.
 */

/**
 * Base error class for the application
 */
export class SpotifyMCPError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpotifyMCPError';
  }
}

/**
 * Error thrown when authentication fails
 */
export class AuthenticationError extends SpotifyMCPError {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when an API request fails
 */
export class APIError extends SpotifyMCPError {
  status?: number;
  data?: any;

  constructor(message: string, status?: number, data?: any) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends SpotifyMCPError {
  errors: any[];

  constructor(message: string, errors: any[] = []) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

/**
 * Error thrown when a tool is not found
 */
export class ToolNotFoundError extends SpotifyMCPError {
  toolName: string;

  constructor(toolName: string) {
    super(`Unknown tool: ${toolName}`);
    this.name = 'ToolNotFoundError';
    this.toolName = toolName;
  }
}

/**
 * Error thrown when a playback command fails
 */
export class PlaybackError extends SpotifyMCPError {
  constructor(message: string) {
    super(message);
    this.name = 'PlaybackError';
  }
}

/**
 * Error thrown when the auth server port is already in use
 */
export class ServerAlreadyRunningError extends SpotifyMCPError {
  port: number;
  
  constructor(port: number) {
    super(`Server already running on port ${port}`);
    this.name = 'ServerAlreadyRunningError';
    this.port = port;
  }
}

/**
 * Helper to format error messages
 */
export function formatError(error: any): string {
  if (error instanceof ValidationError && error.errors.length > 0) {
    return `${error.message}: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
  }
  
  if (error instanceof APIError && error.status) {
    return `API Error (${error.status}): ${error.message}`;
  }
  
  return error.message || String(error);
}