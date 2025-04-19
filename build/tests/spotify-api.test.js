import axios from 'axios';
import { jest } from '@jest/globals';
// Mock axios
jest.mock('axios', () => {
    return {
        post: jest.fn().mockResolvedValue({ data: { access_token: 'mock-token', expires_in: 3600 } }),
        default: jest.fn().mockImplementation(() => Promise.resolve({ data: {} }))
    };
});
// Define some constants for testing
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const SPOTIFY_AUTH_BASE = "https://accounts.spotify.com";
const CLIENT_ID = "test-client-id";
const CLIENT_SECRET = "test-client-secret";
// Recreate the functions from index.ts for testing
async function ensureToken(refreshToken = null, accessToken = null) {
    const now = Date.now();
    const tokenExpirationTime = now + 3600 * 1000; // Mock expiration
    if (accessToken && now < tokenExpirationTime - 60000) {
        return accessToken;
    }
    if (refreshToken) {
        try {
            const response = await axios.post(`${SPOTIFY_AUTH_BASE}/api/token`, new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: refreshToken,
            }), {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
                },
            });
            return response.data.access_token;
        }
        catch (error) {
            console.error("Error refreshing token:", error.message);
            return null;
        }
    }
    return null;
}
async function spotifyApiRequest(endpoint, method = "GET", data = null, token = "mock-token") {
    try {
        const response = await axios({
            method,
            url: `${SPOTIFY_API_BASE}${endpoint}`,
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            data: data ? data : undefined,
        });
        return response.data;
    }
    catch (error) {
        throw new Error(`Spotify API error: ${error.message}`);
    }
}
describe('Spotify API Functions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('ensureToken', () => {
        it('should return existing token if not expired', async () => {
            const token = await ensureToken(null, 'existing-token');
            expect(token).toBe('existing-token');
            expect(axios.post).not.toHaveBeenCalled();
        });
        it('should refresh token if refresh token is available', async () => {
            // Mock the axios.post response
            axios.post.mockResolvedValueOnce({
                data: {
                    access_token: 'new-token',
                    expires_in: 3600
                }
            });
            const token = await ensureToken('refresh-token', null);
            expect(token).toBe('new-token');
            expect(axios.post).toHaveBeenCalledWith(`${SPOTIFY_AUTH_BASE}/api/token`, expect.any(URLSearchParams), expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: expect.stringContaining('Basic ')
                })
            }));
        });
        it('should return null if no tokens are available', async () => {
            const token = await ensureToken(null, null);
            expect(token).toBeNull();
            expect(axios.post).not.toHaveBeenCalled();
        });
        it('should handle errors when refreshing token', async () => {
            // Mock the axios.post to throw an error
            axios.post.mockRejectedValueOnce(new Error('Network error'));
            const token = await ensureToken('refresh-token', null);
            expect(token).toBeNull();
        });
    });
    describe('spotifyApiRequest', () => {
        it('should make a GET request by default', async () => {
            // Mock the axios response
            axios.default.mockResolvedValueOnce({
                data: { items: [] }
            });
            await spotifyApiRequest('/me/playlists');
            expect(axios.default).toHaveBeenCalledWith({
                method: 'GET',
                url: `${SPOTIFY_API_BASE}/me/playlists`,
                headers: expect.objectContaining({
                    Authorization: 'Bearer mock-token'
                }),
                data: undefined
            });
        });
        it('should make a request with the specified method and data', async () => {
            // Mock the axios response
            axios.default.mockResolvedValueOnce({
                data: { id: 'playlist-id' }
            });
            const data = { name: 'My Playlist' };
            await spotifyApiRequest('/users/user-id/playlists', 'POST', data);
            expect(axios.default).toHaveBeenCalledWith({
                method: 'POST',
                url: `${SPOTIFY_API_BASE}/users/user-id/playlists`,
                headers: expect.objectContaining({
                    Authorization: 'Bearer mock-token',
                    'Content-Type': 'application/json'
                }),
                data
            });
        });
        it('should throw an error when the API request fails', async () => {
            // Mock the axios to throw an error
            axios.default.mockRejectedValueOnce({
                message: 'API error',
                response: {
                    status: 400,
                    data: { error: 'Bad request' }
                }
            });
            await expect(spotifyApiRequest('/test-endpoint')).rejects.toThrow('Spotify API error');
        });
    });
});
