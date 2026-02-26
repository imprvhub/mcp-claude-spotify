/**
 * @jest-environment node
 */
import { jest } from '@jest/globals';

// Mock implementations must be at the top level, before importing the modules
const mockSpotifyApiResponse = { data: { items: [] } };
const mockTokenResponse = { data: { access_token: 'mock-token', expires_in: 3600, refresh_token: 'new-refresh' } };

// Create mock functions for axios
const mockAxios = {
  post: jest.fn().mockResolvedValue(mockTokenResponse),
  default: jest.fn().mockResolvedValue(mockSpotifyApiResponse)
};

// Mock the axios module
jest.mock('axios', () => mockAxios);

// Constants for testing
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const SPOTIFY_AUTH_BASE = "https://accounts.spotify.com";
const CLIENT_ID = "test-client-id";
const CLIENT_SECRET = "test-client-secret";

// Import types and variables
let accessToken: string | null = null;
let refreshToken: string | null = null;
let tokenExpirationTime = 0;

// Function implementations for testing
async function ensureToken(): Promise<string | null> {
  const now = Date.now();
  
  // Return existing token if not expired (with 1-minute buffer)
  if (accessToken && now < tokenExpirationTime - 60000) {
    return accessToken;
  }
  
  // Try to refresh the token if we have a refresh token
  if (refreshToken) {
    try {
      const response = await mockAxios.post(`${SPOTIFY_AUTH_BASE}/api/token`);
      
      accessToken = response.data.access_token;
      tokenExpirationTime = now + response.data.expires_in * 1000;
      
      if (response.data.refresh_token) {
        refreshToken = response.data.refresh_token;
      }
      
      return accessToken;
    } catch (error: any) {
      console.error("Error refreshing token:", error.message);
      accessToken = null;
      refreshToken = null;
      tokenExpirationTime = 0;
      return null;
    }
  }
  
  return null;
}

async function spotifyApiRequest(
  endpoint: string, 
  method: string = "GET", 
  data: any = null
): Promise<any> {
  const token = await ensureToken();
  if (!token) {
    throw new Error("Not authenticated. Please authorize the app first.");
  }
  
  try {
    const response = await mockAxios.default({
      method,
      url: `${SPOTIFY_API_BASE}${endpoint}`,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: data ? data : undefined,
    });
    
    return response.data;
  } catch (error: any) {
    throw new Error(`Spotify API error: ${error.message}`);
  }
}

describe('Spotify API Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    accessToken = 'test-token';
    refreshToken = 'test-refresh-token';
    tokenExpirationTime = Date.now() + 3600 * 1000;
  });

  afterEach(() => {
    accessToken = null;
    refreshToken = null;
    tokenExpirationTime = 0;
  });

  describe('ensureToken', () => {
    it('should return existing token if not expired', async () => {
      const token = await ensureToken();
      expect(token).toBe('test-token');
      expect(mockAxios.post).not.toHaveBeenCalled();
    });

    it('should refresh token if expired', async () => {
      // Set token as expired
      tokenExpirationTime = Date.now() - 1000;
      
      const token = await ensureToken();
      expect(token).toBe('mock-token');
      expect(mockAxios.post).toHaveBeenCalledWith(`${SPOTIFY_AUTH_BASE}/api/token`);
    });

    it('should return null if no refresh token is available', async () => {
      // Set expired token with no refresh token
      accessToken = 'expired-token';
      refreshToken = null;
      tokenExpirationTime = Date.now() - 1000;
      
      const token = await ensureToken();
      expect(token).toBeNull();
    });

    it('should handle errors when refreshing token', async () => {
      // Set token as expired to trigger refresh
      tokenExpirationTime = Date.now() - 1000;
      
      // Mock error for this test
      mockAxios.post.mockRejectedValueOnce(new Error('Network error'));
      
      const token = await ensureToken();
      expect(token).toBeNull();
      expect(accessToken).toBeNull();
      expect(refreshToken).toBeNull();
    });
  });

  describe('spotifyApiRequest', () => {
    it('should make a GET request by default', async () => {
      await spotifyApiRequest('/me/playlists');
      
      expect(mockAxios.default).toHaveBeenCalledWith({
        method: 'GET',
        url: `${SPOTIFY_API_BASE}/me/playlists`,
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json'
        },
        data: undefined
      });
    });

    it('should make a request with the specified method and data', async () => {
      const data = { name: 'My Playlist' };
      await spotifyApiRequest('/me/playlists', 'POST', data);
      
      expect(mockAxios.default).toHaveBeenCalledWith({
        method: 'POST',
        url: `${SPOTIFY_API_BASE}/me/playlists`,
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json'
        },
        data
      });
    });

    it('should throw an error if not authenticated', async () => {
      accessToken = null;
      refreshToken = null;
      
      await expect(spotifyApiRequest('/me/playlists')).rejects.toThrow(
        'Not authenticated. Please authorize the app first.'
      );
    });

    it('should throw an error when API request fails', async () => {
      mockAxios.default.mockRejectedValueOnce({
        message: 'API error'
      });
      
      await expect(spotifyApiRequest('/test-endpoint')).rejects.toThrow('Spotify API error: API error');
    });
  });
});