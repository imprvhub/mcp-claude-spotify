import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import { z } from "zod";
import express from "express";
import axios from "axios";
import querystring from "querystring";
import open from "open";
import net from "net";
import fs from "fs";
import path from "path";
import os from "os";
import { promisify } from "util";
import { exec } from "child_process";
import { ServerAlreadyRunningError } from "./errors.js";
dotenv.config();
const execAsync = promisify(exec);
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const SPOTIFY_AUTH_BASE = "https://accounts.spotify.com";
const PORT = 8888;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const TOKEN_DIR = path.join(os.homedir(), '.spotify-mcp');
const TOKEN_PATH = path.join(TOKEN_DIR, 'tokens.json');
/**
 * Check if a port is already in use
 *
 * @param {number} port - The port to check
 * @returns {Promise<boolean>} - True if the port is in use, false otherwise
 */
function isPortInUse(port) {
    return new Promise((resolve) => {
        const server = net.createServer()
            .once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(true);
            }
            else {
                resolve(false);
            }
        })
            .once('listening', () => {
            server.close();
            resolve(false);
        })
            .listen(port);
    });
}
let accessToken = null;
let refreshToken = null;
let tokenExpirationTime = 0;
let authServer = null;
/**
 * Ensures the token storage directory exists
 */
function ensureTokenDirExists() {
    try {
        if (!fs.existsSync(TOKEN_DIR)) {
            fs.mkdirSync(TOKEN_DIR, { recursive: true });
        }
    }
    catch (error) {
        console.error(`Error creating token directory: ${error}`);
    }
}
/**
 * Saves the tokens to a file
 * This allows tokens to be shared between different instances of the application
 */
function saveTokens() {
    try {
        console.error(`Attempting to save tokens to ${TOKEN_PATH}`);
        ensureTokenDirExists();
        const tokenData = {
            accessToken,
            refreshToken,
            tokenExpirationTime
        };
        console.error(`Token data to save: {
      accessToken: ${accessToken ? '***token exists***' : 'null'},
      refreshToken: ${refreshToken ? '***token exists***' : 'null'},
      tokenExpirationTime: ${tokenExpirationTime}
    }`);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData, null, 2));
        console.error(`Tokens successfully saved to ${TOKEN_PATH}`);
    }
    catch (error) {
        console.error(`Error saving tokens: ${error}`);
        // Print the full error stack for debugging
        if (error instanceof Error && error.stack) {
            console.error(error.stack);
        }
    }
}
/**
 * Loads tokens from the tokens file
 * Returns true if tokens were successfully loaded, false otherwise
 */
function loadTokens() {
    try {
        console.error(`Attempting to load tokens from ${TOKEN_PATH}`);
        if (!fs.existsSync(TOKEN_PATH)) {
            console.error(`Token file does not exist: ${TOKEN_PATH}`);
            return false;
        }
        const rawData = fs.readFileSync(TOKEN_PATH, 'utf-8');
        console.error(`Raw token data loaded (${rawData.length} bytes)`);
        if (rawData.trim() === '') {
            console.error(`Token file is empty`);
            return false;
        }
        const tokenData = JSON.parse(rawData);
        if (!tokenData.accessToken || !tokenData.refreshToken) {
            console.error(`Token data is incomplete in file`);
            return false;
        }
        accessToken = tokenData.accessToken;
        refreshToken = tokenData.refreshToken;
        tokenExpirationTime = tokenData.tokenExpirationTime;
        console.error(`Tokens loaded successfully: {
      accessToken: ***token masked***,
      refreshToken: ***token masked***,
      tokenExpirationTime: ${tokenExpirationTime} (expires ${new Date(tokenExpirationTime).toISOString()})
    }`);
        return true;
    }
    catch (error) {
        console.error(`Error loading tokens: ${error}`);
        if (error instanceof Error && error.stack) {
            console.error(error.stack);
        }
        return false;
    }
}
const tokensLoaded = loadTokens();
console.error(tokensLoaded ?
    `Tokens loaded successfully from ${TOKEN_PATH}` :
    `No tokens found at ${TOKEN_PATH}, will need to authenticate`);
/**
 * Checks if a port is in use
 *
 * @param {number} port - The port number to check
 * @returns {Promise<boolean>} - True if the port is in use, false otherwise
 */
// Second isPortInUse definition removed to fix duplicate function error
const SearchSchema = z.object({
    query: z.string(),
    type: z.enum(["track", "album", "artist", "playlist"]).default("track"),
    limit: z.number().min(1).max(50).default(10),
});
const PlayTrackSchema = z.object({
    trackId: z.string(),
    deviceId: z.string().optional(),
});
const CreatePlaylistSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    public: z.boolean().default(false),
});
const AddTracksSchema = z.object({
    playlistId: z.string(),
    trackIds: z.array(z.string()),
});
const GetRecommendationsSchema = z.object({
    seedTracks: z.array(z.string()).optional(),
    seedArtists: z.array(z.string()).optional(),
    seedGenres: z.array(z.string()).optional(),
    limit: z.number().min(1).max(100).default(20),
});
const GetTopTracksSchema = z.object({
    limit: z.number().min(1).max(50).default(20),
    offset: z.number().min(0).default(0),
    time_range: z.enum(["short_term", "medium_term", "long_term"]).default("medium_term"),
});
const GetUserPlaylistsSchema = z.object({
    limit: z.number().min(1).max(50).default(20),
    offset: z.number().min(0).default(0),
});
const server = new Server({
    name: "spotify-mcp",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
/**
 * Ensures a valid access token is available
 *
 * This function checks if the current access token is valid, and if not,
 * attempts to refresh it using the refresh token. If refresh fails or no
 * refresh token is available, it returns null indicating authentication
 * is required.
 *
 * @returns {Promise<string|null>} The valid access token or null if authentication is needed
 */
async function ensureToken() {
    const now = Date.now();
    if (!accessToken && !refreshToken) {
        loadTokens();
    }
    if (accessToken && now < tokenExpirationTime - 60000) {
        console.error(`Using existing valid token, expires in ${Math.floor((tokenExpirationTime - now) / 1000)} seconds`);
        return accessToken;
    }
    if (refreshToken) {
        try {
            const response = await axios.post(`${SPOTIFY_AUTH_BASE}/api/token`, querystring.stringify({
                grant_type: "refresh_token",
                refresh_token: refreshToken,
            }), {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
                },
            });
            accessToken = response.data.access_token;
            tokenExpirationTime = now + response.data.expires_in * 1000;
            if (response.data.refresh_token) {
                refreshToken = response.data.refresh_token;
            }
            saveTokens();
            console.error(`Token refreshed successfully, new token expires in ${response.data.expires_in} seconds`);
            return accessToken;
        }
        catch (error) {
            console.error("Error refreshing token:", error.message);
            accessToken = null;
            refreshToken = null;
            tokenExpirationTime = 0;
            saveTokens();
        }
    }
    return null;
}
/**
 * Makes an authenticated request to the Spotify API
 *
 * Handles token management and formats requests/responses appropriately.
 * Throws appropriate errors when authentication fails or API requests fail.
 *
 * @param {string} endpoint - The Spotify API endpoint (e.g., "/me/playlists")
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
 * @param {any} data - Optional request body data for POST/PUT requests
 * @returns {Promise<any>} The API response data
 * @throws {Error} If authentication is missing or API request fails
 */
async function spotifyApiRequest(endpoint, method = "GET", data = null) {
    console.error(`Starting API request to ${endpoint}`);
    if (!accessToken || !refreshToken) {
        console.error(`No tokens in memory, trying to load from file...`);
        try {
            if (fs.existsSync(TOKEN_PATH)) {
                const fileContent = fs.readFileSync(TOKEN_PATH, 'utf8');
                console.error(`Read ${fileContent.length} bytes from token file`);
                if (fileContent.trim() !== '') {
                    const tokenData = JSON.parse(fileContent);
                    accessToken = tokenData.accessToken;
                    refreshToken = tokenData.refreshToken;
                    tokenExpirationTime = tokenData.tokenExpirationTime;
                    console.error(`Tokens loaded successfully`);
                }
                else {
                    console.error(`Token file is empty, cannot load tokens`);
                }
            }
            else {
                console.error(`Token file does not exist: ${TOKEN_PATH}`);
            }
        }
        catch (err) {
            console.error(`Error loading tokens from file: ${err}`);
        }
    }
    if (!accessToken) {
        console.error(`No access token available for request to ${endpoint}`);
        throw new Error("Not authenticated. Please authorize the app first.");
    }
    const now = Date.now();
    if (now >= tokenExpirationTime - 60000) {
        if (refreshToken) {
            try {
                console.error(`Token expired, attempting to refresh...`);
                const response = await axios.post(`${SPOTIFY_AUTH_BASE}/api/token`, querystring.stringify({
                    grant_type: "refresh_token",
                    refresh_token: refreshToken,
                }), {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
                    },
                });
                accessToken = response.data.access_token;
                tokenExpirationTime = now + response.data.expires_in * 1000;
                if (response.data.refresh_token) {
                    refreshToken = response.data.refresh_token;
                }
                console.error(`Token refreshed successfully, expires at ${new Date(tokenExpirationTime).toISOString()}`);
                try {
                    if (!fs.existsSync(TOKEN_DIR)) {
                        fs.mkdirSync(TOKEN_DIR, { recursive: true });
                    }
                    const tokenData = JSON.stringify({
                        accessToken,
                        refreshToken,
                        tokenExpirationTime
                    }, null, 2);
                    fs.writeFileSync(TOKEN_PATH, tokenData);
                    console.error(`Refreshed tokens saved to file`);
                }
                catch (saveError) {
                    console.error(`Failed to save refreshed tokens: ${saveError}`);
                }
            }
            catch (refreshError) {
                console.error(`Failed to refresh token: ${refreshError}`);
                accessToken = null;
                refreshToken = null;
                tokenExpirationTime = 0;
                throw new Error("Authentication expired. Please authenticate again.");
            }
        }
        else {
            console.error(`Token expired but no refresh token available`);
            accessToken = null;
            tokenExpirationTime = 0;
            throw new Error("Authentication expired. Please authenticate again.");
        }
    }
    console.error(`Making authenticated request to ${endpoint}`);
    try {
        const response = await axios({
            method,
            url: `${SPOTIFY_API_BASE}${endpoint}`,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            data: data ? data : undefined,
        });
        console.error(`Request to ${endpoint} succeeded`);
        return response.data;
    }
    catch (error) {
        console.error(`Spotify API error: ${error.message}`);
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Data:`, error.response.data);
            if (error.response.status === 401) {
                console.error(`Token appears to be invalid, clearing tokens`);
                accessToken = null;
                refreshToken = null;
                tokenExpirationTime = 0;
                throw new Error("Authorization expired. Please authenticate again.");
            }
        }
        throw new Error(`Spotify API error: ${error.message}`);
    }
}
/**
 * Starts an authentication server for Spotify OAuth flow
 *
 * Creates an Express server to handle the OAuth authentication flow with Spotify.
 * Provides login and callback endpoints, handles the exchange of authorization code
 * for access and refresh tokens, and opens the browser for the user to authenticate.
 *
 * Handles the case where the server is already running by checking if the port
 * is already in use. If it is, it attempts to use the existing server by
 * opening the login page directly.
 *
 * @returns {Promise<void>} Resolves when authentication is successful, rejects on failure
 */
async function startAuthServer() {
    if (authServer) {
        console.error("Auth server is already running, opening login page");
        await open(`http://127.0.0.1:${PORT}/login`);
        return Promise.resolve();
    }
    const portInUse = await isPortInUse(PORT);
    if (portInUse) {
        console.error(`Port ${PORT} is already in use, attempting to use existing server`);
        console.error(`Attempting to kill any process on port ${PORT}...`);
        try {
            if (process.platform === 'win32') {
                await execAsync(`FOR /F "tokens=5" %P IN ('netstat -ano ^| findstr :${PORT} ^| findstr LISTENING') DO taskkill /F /PID %P`);
            }
            else {
                await execAsync(`lsof -i:${PORT} -t | xargs kill -9`);
            }
            console.error(`Successfully killed process on port ${PORT}`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            const stillInUse = await isPortInUse(PORT);
            if (stillInUse) {
                console.error(`Port ${PORT} is still in use after kill attempt`);
                throw new ServerAlreadyRunningError(PORT);
            }
        }
        catch (killError) {
            console.error(`Failed to kill process on port ${PORT}: ${killError}`);
            try {
                await open(`http://127.0.0.1:${PORT}/login`);
                return Promise.resolve();
            }
            catch (error) {
                throw new ServerAlreadyRunningError(PORT);
            }
        }
    }
    return new Promise((resolve, reject) => {
        const app = express();
        // Login endpoint redirects to Spotify authorization page
        app.get("/login", (req, res) => {
            const scopes = [
                "user-read-private",
                "user-read-email",
                "user-read-playback-state",
                "user-modify-playback-state",
                "user-read-currently-playing",
                "playlist-read-private",
                "playlist-modify-private",
                "playlist-modify-public",
                "user-library-read",
                "user-top-read",
            ];
            res.redirect(`${SPOTIFY_AUTH_BASE}/authorize?${querystring.stringify({
                response_type: "code",
                client_id: CLIENT_ID,
                scope: scopes.join(" "),
                redirect_uri: REDIRECT_URI,
            })}`);
        });
        // Callback endpoint receives authorization code and exchanges it for tokens
        app.get("/callback", async (req, res) => {
            const code = req.query.code || null;
            if (!code) {
                res.send("Authentication failed: No code provided");
                reject(new Error("Authentication failed: No code provided"));
                return;
            }
            try {
                console.error(`Received authorization code, exchanging for tokens...`);
                const response = await axios.post(`${SPOTIFY_AUTH_BASE}/api/token`, querystring.stringify({
                    code: code,
                    redirect_uri: REDIRECT_URI,
                    grant_type: "authorization_code",
                }), {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
                    },
                });
                console.error(`Token exchange successful, got access_token and refresh_token`);
                accessToken = response.data.access_token;
                refreshToken = response.data.refresh_token;
                tokenExpirationTime = Date.now() + response.data.expires_in * 1000;
                try {
                    if (!fs.existsSync(TOKEN_DIR)) {
                        console.error(`Creating token directory: ${TOKEN_DIR}`);
                        fs.mkdirSync(TOKEN_DIR, { recursive: true });
                    }
                }
                catch (dirError) {
                    console.error(`CRITICAL ERROR creating token directory: ${dirError}`);
                }
                try {
                    const tokenData = JSON.stringify({
                        accessToken,
                        refreshToken,
                        tokenExpirationTime
                    }, null, 2);
                    console.error(`Writing ${tokenData.length} bytes to ${TOKEN_PATH}`);
                    fs.writeFileSync(TOKEN_PATH, tokenData);
                    if (fs.existsSync(TOKEN_PATH)) {
                        const stats = fs.statSync(TOKEN_PATH);
                        console.error(`Token file successfully written: ${stats.size} bytes`);
                    }
                    else {
                        console.error(`CRITICAL ERROR: Token file not found after writing`);
                    }
                }
                catch (fileError) {
                    console.error(`CRITICAL ERROR writing token file: ${fileError}`);
                }
                try {
                    console.error(`Verifying tokens with a test API call...`);
                    const verifyResponse = await axios({
                        method: 'GET',
                        url: `${SPOTIFY_API_BASE}/me`,
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            "Content-Type": "application/json",
                        },
                    });
                    console.error(`Token verification successful! Authenticated as: ${verifyResponse.data.display_name}`);
                }
                catch (verifyError) {
                    console.error(`Token verification failed: ${verifyError}`);
                }
                res.send("Authentication successful! You can close this window now.");
                resolve();
            }
            catch (error) {
                console.error("Error getting tokens:", error.message);
                if (error.response) {
                    console.error("Error response:", error.response.data);
                }
                res.send("Authentication failed: " + error.message);
                reject(error);
            }
        });
        try {
            authServer = app.listen(PORT, () => {
                console.error(`Auth server listening at http://127.0.0.1:${PORT}`);
                open(`http://127.0.0.1:${PORT}/login`);
            });
            // Handle server errors
            authServer.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    console.error(`Port ${PORT} is already in use`);
                    reject(new ServerAlreadyRunningError(PORT));
                }
                else {
                    console.error(`Server error: ${error.message}`);
                    reject(error);
                }
            });
            // Clean up server when process is about to exit
            process.on('beforeExit', () => {
                if (authServer) {
                    console.error('Closing auth server');
                    authServer.close();
                    authServer = null;
                }
            });
        }
        catch (error) {
            console.error(`Error starting auth server: ${error.message}`);
            reject(error);
        }
    });
}
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "auth-spotify",
                description: "Authenticate with Spotify",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "search-spotify",
                description: "Search for tracks, albums, artists, or playlists on Spotify",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "Search query",
                        },
                        type: {
                            type: "string",
                            enum: ["track", "album", "artist", "playlist"],
                            description: "Type of item to search for (default: track)",
                        },
                        limit: {
                            type: "number",
                            description: "Maximum number of results to return (1-50, default: 10)",
                        },
                    },
                    required: ["query"],
                },
            },
            {
                name: "get-current-playback",
                description: "Get information about the user's current playback state",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "play-track",
                description: "Play a specific track on an active device",
                inputSchema: {
                    type: "object",
                    properties: {
                        trackId: {
                            type: "string",
                            description: "Spotify ID of the track to play",
                        },
                        deviceId: {
                            type: "string",
                            description: "Spotify ID of the device to play on (optional)",
                        },
                    },
                    required: ["trackId"],
                },
            },
            {
                name: "pause-playback",
                description: "Pause the user's playback",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "next-track",
                description: "Skip to the next track",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "previous-track",
                description: "Skip to the previous track",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "get-user-playlists",
                description: "Get a list of the user's playlists",
                inputSchema: {
                    type: "object",
                    properties: {
                        limit: {
                            type: "number",
                            description: "Maximum number of playlists to return (1-50, default: 20)",
                        },
                        offset: {
                            type: "number",
                            description: "The index of the first playlist to return (default: 0)",
                        },
                    },
                },
            },
            {
                name: "create-playlist",
                description: "Create a new playlist for the current user",
                inputSchema: {
                    type: "object",
                    properties: {
                        name: {
                            type: "string",
                            description: "Name of the playlist",
                        },
                        description: {
                            type: "string",
                            description: "Description of the playlist (optional)",
                        },
                        public: {
                            type: "boolean",
                            description: "Whether the playlist should be public (default: false)",
                        },
                    },
                    required: ["name"],
                },
            },
            {
                name: "add-tracks-to-playlist",
                description: "Add tracks to a playlist",
                inputSchema: {
                    type: "object",
                    properties: {
                        playlistId: {
                            type: "string",
                            description: "Spotify ID of the playlist",
                        },
                        trackIds: {
                            type: "array",
                            items: {
                                type: "string",
                            },
                            description: "Array of Spotify track IDs to add",
                        },
                    },
                    required: ["playlistId", "trackIds"],
                },
            },
            {
                name: "get-recommendations",
                description: "Get track recommendations based on seeds",
                inputSchema: {
                    type: "object",
                    properties: {
                        seedTracks: {
                            type: "array",
                            items: {
                                type: "string",
                            },
                            description: "Array of Spotify track IDs to use as seeds (optional)",
                        },
                        seedArtists: {
                            type: "array",
                            items: {
                                type: "string",
                            },
                            description: "Array of Spotify artist IDs to use as seeds (optional)",
                        },
                        seedGenres: {
                            type: "array",
                            items: {
                                type: "string",
                            },
                            description: "Array of genre names to use as seeds (optional)",
                        },
                        limit: {
                            type: "number",
                            description: "Maximum number of tracks to return (1-100, default: 20)",
                        },
                    },
                },
            },
            {
                name: "get-top-tracks",
                description: "Get the user's top played tracks over a specified time range",
                inputSchema: {
                    type: "object",
                    properties: {
                        limit: {
                            type: "number",
                            description: "The number of tracks to return (1-50, default: 20)",
                        },
                        offset: {
                            type: "number",
                            description: "The index of the first track to return (default: 0)",
                        },
                        time_range: {
                            type: "string",
                            enum: ["short_term", "medium_term", "long_term"],
                            description: "Over what time frame the affinities are computed. short_term = ~4 weeks, medium_term = ~6 months, long_term = several years (default: medium_term)",
                        }
                    }
                }
            },
        ],
    };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        if (name === "auth-spotify") {
            try {
                console.error(`Checking current authentication status...`);
                try {
                    if (accessToken) {
                        console.error(`We have an access token in memory, testing it...`);
                        try {
                            const testResponse = await axios({
                                method: 'GET',
                                url: `${SPOTIFY_API_BASE}/me`,
                                headers: {
                                    Authorization: `Bearer ${accessToken}`,
                                    "Content-Type": "application/json",
                                },
                            });
                            console.error(`Current token is valid! Already authenticated as: ${testResponse.data.display_name}`);
                            return {
                                content: [
                                    {
                                        type: "text",
                                        text: `Already authenticated with Spotify as ${testResponse.data.display_name}!`,
                                    },
                                ],
                            };
                        }
                        catch (testError) {
                            console.error(`Current token is invalid, proceeding with authentication flow`);
                        }
                    }
                    else {
                        console.error(`No access token in memory, checking token file...`);
                        try {
                            if (fs.existsSync(TOKEN_PATH)) {
                                console.error(`Token file exists, attempting to load...`);
                                const fileContent = fs.readFileSync(TOKEN_PATH, 'utf8');
                                if (fileContent && fileContent.trim() !== '') {
                                    console.error(`Found token file with content, parsing...`);
                                    const tokenData = JSON.parse(fileContent);
                                    accessToken = tokenData.accessToken;
                                    refreshToken = tokenData.refreshToken;
                                    tokenExpirationTime = tokenData.tokenExpirationTime;
                                    try {
                                        console.error(`Testing loaded token...`);
                                        const testResponse = await axios({
                                            method: 'GET',
                                            url: `${SPOTIFY_API_BASE}/me`,
                                            headers: {
                                                Authorization: `Bearer ${accessToken}`,
                                                "Content-Type": "application/json",
                                            },
                                        });
                                        console.error(`Loaded token is valid! Authenticated as: ${testResponse.data.display_name}`);
                                        return {
                                            content: [
                                                {
                                                    type: "text",
                                                    text: `Already authenticated with Spotify as ${testResponse.data.display_name}!`,
                                                },
                                            ],
                                        };
                                    }
                                    catch (loadedTokenError) {
                                        console.error(`Loaded token is invalid, continuing with auth flow...`);
                                    }
                                }
                            }
                        }
                        catch (fileError) {
                            console.error(`Error handling token file: ${fileError}`);
                        }
                    }
                }
                catch (testError) {
                    console.error(`Error testing current authentication: ${testError}`);
                }
                console.error('Starting authentication process...');
                await startAuthServer();
                if (!accessToken || !refreshToken) {
                    throw new Error("Authentication failed: No tokens received");
                }
                console.error(`Authentication successful, received tokens`);
                try {
                    console.error(`Testing new tokens...`);
                    const testResponse = await axios({
                        method: 'GET',
                        url: `${SPOTIFY_API_BASE}/me`,
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            "Content-Type": "application/json",
                        },
                    });
                    console.error(`New tokens are valid! Authenticated as: ${testResponse.data.display_name}`);
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Successfully authenticated with Spotify as ${testResponse.data.display_name}!`,
                            },
                        ],
                    };
                }
                catch (newTokenError) {
                    console.error(`New tokens failed verification: ${newTokenError}`);
                    throw new Error("Authentication succeeded but tokens are invalid");
                }
            }
            catch (error) {
                if (error instanceof ServerAlreadyRunningError) {
                    console.error(`Server already running error: ${error.message}`);
                    try {
                        if (accessToken) {
                            const testResponse = await axios({
                                method: 'GET',
                                url: `${SPOTIFY_API_BASE}/me`,
                                headers: {
                                    Authorization: `Bearer ${accessToken}`,
                                    "Content-Type": "application/json",
                                },
                            });
                            return {
                                content: [
                                    {
                                        type: "text",
                                        text: `Successfully authenticated with Spotify as ${testResponse.data.display_name}!`,
                                    },
                                ],
                            };
                        }
                    }
                    catch (testError) {
                    }
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Another instance is already running on port ${error.port}. If you're having authentication issues, please restart Claude or close any other applications using port ${error.port}.`,
                            },
                        ],
                    };
                }
                console.error(`Authentication error: ${error.message}`);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Authentication failed: ${error.message}`,
                        },
                    ],
                };
            }
        }
        if (name === "search-spotify") {
            const { query, type, limit } = SearchSchema.parse(args);
            const results = await spotifyApiRequest(`/search?${querystring.stringify({
                q: query,
                type,
                limit,
            })}`);
            let formattedResults = "";
            if (type === "track" && results.tracks) {
                formattedResults = results.tracks.items
                    .map((track) => `
Track: ${track.name}
Artist: ${track.artists.map((a) => a.name).join(", ")}
Album: ${track.album.name}
ID: ${track.id}
Duration: ${Math.floor(track.duration_ms / 1000 / 60)}:${(Math.floor(track.duration_ms / 1000) % 60)
                    .toString()
                    .padStart(2, "0")}
URL: ${track.external_urls.spotify}
---`)
                    .join("\n");
            }
            else if (type === "album" && results.albums) {
                formattedResults = results.albums.items
                    .map((album) => `
Album: ${album.name}
Artist: ${album.artists.map((a) => a.name).join(", ")}
ID: ${album.id}
Release Date: ${album.release_date}
Tracks: ${album.total_tracks}
URL: ${album.external_urls.spotify}
---`)
                    .join("\n");
            }
            else if (type === "artist" && results.artists) {
                formattedResults = results.artists.items
                    .map((artist) => `
Artist: ${artist.name}
ID: ${artist.id}
Popularity: ${artist.popularity}/100
Followers: ${artist.followers?.total || "N/A"}
Genres: ${artist.genres?.join(", ") || "None"}
URL: ${artist.external_urls.spotify}
---`)
                    .join("\n");
            }
            else if (type === "playlist" && results.playlists) {
                formattedResults = results.playlists.items
                    .map((playlist) => `
Playlist: ${playlist.name}
Creator: ${playlist.owner.display_name}
ID: ${playlist.id}
Tracks: ${playlist.tracks.total}
Description: ${playlist.description || "None"}
URL: ${playlist.external_urls.spotify}
---`)
                    .join("\n");
            }
            return {
                content: [
                    {
                        type: "text",
                        text: formattedResults ||
                            `No ${type}s found matching your search.`,
                    },
                ],
            };
        }
        if (name === "get-current-playback") {
            const playback = await spotifyApiRequest("/me/player");
            if (!playback) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "No active playback found. Make sure you have an active Spotify session.",
                        },
                    ],
                };
            }
            let responseText = "";
            if (playback.item) {
                responseText = `
Currently ${playback.is_playing ? "Playing" : "Paused"}:
Track: ${playback.item.name}
Artist: ${playback.item.artists.map((a) => a.name).join(", ")}
Album: ${playback.item.album.name}
Progress: ${Math.floor(playback.progress_ms / 1000 / 60)}:${(Math.floor(playback.progress_ms / 1000) % 60)
                    .toString()
                    .padStart(2, "0")} / ${Math.floor(playback.item.duration_ms / 1000 / 60)}:${(Math.floor(playback.item.duration_ms / 1000) % 60)
                    .toString()
                    .padStart(2, "0")}
Device: ${playback.device.name}
Volume: ${playback.device.volume_percent}%
Shuffle: ${playback.shuffle_state ? "On" : "Off"}
Repeat: ${playback.repeat_state === "off"
                    ? "Off"
                    : playback.repeat_state === "context"
                        ? "Context"
                        : "Track"}`;
            }
            else {
                responseText = `
No track currently playing.
Device: ${playback.device.name}
Volume: ${playback.device.volume_percent}%
Shuffle: ${playback.shuffle_state ? "On" : "Off"}
Repeat: ${playback.repeat_state === "off"
                    ? "Off"
                    : playback.repeat_state === "context"
                        ? "Context"
                        : "Track"}`;
            }
            return {
                content: [
                    {
                        type: "text",
                        text: responseText,
                    },
                ],
            };
        }
        if (name === "play-track") {
            const { trackId, deviceId } = PlayTrackSchema.parse(args);
            const endpoint = deviceId ? `/me/player/play?device_id=${deviceId}` : "/me/player/play";
            await spotifyApiRequest(endpoint, "PUT", {
                uris: [`spotify:track:${trackId}`],
            });
            return {
                content: [
                    {
                        type: "text",
                        text: `Started playing track with ID: ${trackId}`,
                    },
                ],
            };
        }
        if (name === "pause-playback") {
            await spotifyApiRequest("/me/player/pause", "PUT");
            return {
                content: [
                    {
                        type: "text",
                        text: "Playback paused.",
                    },
                ],
            };
        }
        if (name === "next-track") {
            await spotifyApiRequest("/me/player/next", "POST");
            return {
                content: [
                    {
                        type: "text",
                        text: "Skipped to next track.",
                    },
                ],
            };
        }
        if (name === "previous-track") {
            await spotifyApiRequest("/me/player/previous", "POST");
            return {
                content: [
                    {
                        type: "text",
                        text: "Skipped to previous track.",
                    },
                ],
            };
        }
        if (name === "get-user-playlists") {
            const { limit, offset } = GetUserPlaylistsSchema.parse(args);
            const params = new URLSearchParams();
            params.append("limit", limit.toString());
            params.append("offset", offset.toString());
            const playlists = await spotifyApiRequest(`/me/playlists?${params}`);
            if (playlists.items.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: offset > 0
                                ? "No more playlists found."
                                : "You don't have any playlists.",
                        },
                    ],
                };
            }
            const formattedPlaylists = playlists.items
                .map((playlist) => `
Name: ${playlist.name}
ID: ${playlist.id}
Owner: ${playlist.owner.display_name}
Tracks: ${playlist.tracks.total}
Public: ${playlist.public ? "Yes" : "No"}
URL: ${playlist.external_urls.spotify}
---`)
                .join("\n");
            const paginationInfo = `
Showing ${offset + 1}-${offset + playlists.items.length} of ${playlists.total} total playlists`;
            return {
                content: [
                    {
                        type: "text",
                        text: `Your playlists:${paginationInfo}\n${formattedPlaylists}`,
                    },
                ],
            };
        }
        if (name === "create-playlist") {
            const { name, description, public: isPublic } = CreatePlaylistSchema.parse(args);
            const userInfo = await spotifyApiRequest("/me");
            const userId = userInfo.id;
            const playlist = await spotifyApiRequest(`/users/${userId}/playlists`, "POST", {
                name,
                description,
                public: isPublic,
            });
            return {
                content: [
                    {
                        type: "text",
                        text: `Playlist created successfully:
Name: ${playlist.name}
ID: ${playlist.id}
URL: ${playlist.external_urls.spotify}`,
                    },
                ],
            };
        }
        if (name === "add-tracks-to-playlist") {
            const { playlistId, trackIds } = AddTracksSchema.parse(args);
            const uris = trackIds.map((id) => `spotify:track:${id}`);
            await spotifyApiRequest(`/playlists/${playlistId}/tracks`, "POST", {
                uris,
            });
            return {
                content: [
                    {
                        type: "text",
                        text: `Added ${trackIds.length} tracks to playlist with ID: ${playlistId}`,
                    },
                ],
            };
        }
        if (name === "get-recommendations") {
            const { seedTracks, seedArtists, seedGenres, limit } = GetRecommendationsSchema.parse(args);
            if (!seedTracks && !seedArtists && !seedGenres) {
                throw new Error("At least one seed (tracks, artists, or genres) must be provided");
            }
            const params = new URLSearchParams();
            if (limit)
                params.append("limit", limit.toString());
            if (seedTracks)
                params.append("seed_tracks", seedTracks.join(","));
            if (seedArtists)
                params.append("seed_artists", seedArtists.join(","));
            if (seedGenres)
                params.append("seed_genres", seedGenres.join(","));
            const recommendations = await spotifyApiRequest(`/recommendations?${params}`);
            const formattedRecommendations = recommendations.tracks
                .map((track) => `
Track: ${track.name}
Artist: ${track.artists.map((a) => a.name).join(", ")}
Album: ${track.album.name}
ID: ${track.id}
Duration: ${Math.floor(track.duration_ms / 1000 / 60)}:${(Math.floor(track.duration_ms / 1000) % 60)
                .toString()
                .padStart(2, "0")}
URL: ${track.external_urls.spotify}
---`)
                .join("\n");
            return {
                content: [
                    {
                        type: "text",
                        text: recommendations.tracks.length > 0
                            ? `Recommended tracks:\n${formattedRecommendations}`
                            : "No recommendations found.",
                    },
                ],
            };
        }
        if (name === "get-top-tracks") {
            const { limit, offset, time_range } = GetTopTracksSchema.parse(args);
            const params = new URLSearchParams();
            params.append("limit", limit.toString());
            params.append("offset", offset.toString());
            params.append("time_range", time_range);
            const topTracks = await spotifyApiRequest(`/me/top/tracks?${params}`);
            const formattedTracks = topTracks.items
                .map((track) => `
Track: ${track.name}
Artist: ${track.artists.map((a) => a.name).join(", ")}
Album: ${track.album.name}
ID: ${track.id}
Duration: ${Math.floor(track.duration_ms / 1000 / 60)}:${(Math.floor(track.duration_ms / 1000) % 60)
                .toString()
                .padStart(2, "0")}
URL: ${track.external_urls.spotify}
---`)
                .join("\n");
            return {
                content: [
                    {
                        type: "text",
                        text: topTracks.items.length > 0
                            ? `Your top tracks:\n${formattedTracks}`
                            : "No top tracks found for the specified time range.",
                    },
                ],
            };
        }
        throw new Error(`Unknown tool: ${name}`);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(`Invalid arguments: ${error.errors
                .map((e) => `${e.path.join(".")}: ${e.message}`)
                .join(", ")}`);
        }
        throw error;
    }
});
/**
 * Main application entry point
 *
 * Initializes the MCP server and connects it to the stdio transport.
 * This allows the MCP server to communicate with Claude Desktop.
 */
async function main() {
    const transport = new StdioServerTransport();
    try {
        await server.connect(transport);
        console.error("Spotify MCP Server running on stdio");
        // Set up clean shutdown handlers
        setupCleanupHandlers();
    }
    catch (error) {
        console.error("Error connecting to transport:", error);
        throw error;
    }
}
/**
 * Sets up handlers for graceful shutdown and debug signals
 *
 * This ensures that the HTTP server is properly closed when
 * the process is terminated, preventing port conflicts on restart.
 * Also sets up a SIGUSR1 handler for manually reloading tokens.
 */
function setupCleanupHandlers() {
    // Handle process termination
    process.on('SIGINT', cleanupAndExit);
    process.on('SIGTERM', cleanupAndExit);
    process.on('exit', cleanup);
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        console.error('Uncaught exception:', error);
        cleanupAndExit(1);
    });
    process.on('SIGUSR1', () => {
        console.error('SIGUSR1 received - Forcing token reload');
        const loaded = loadTokens();
        console.error(`Token reload result: ${loaded ? 'SUCCESS' : 'FAILED'}`);
        console.error(`Current token state:
      accessToken: ${accessToken ? '***exists***' : 'null'}
      refreshToken: ${refreshToken ? '***exists***' : 'null'}
      tokenExpirationTime: ${tokenExpirationTime}
      ${tokenExpirationTime > 0 ? `(expires: ${new Date(tokenExpirationTime).toISOString()})` : ''}
    `);
    });
}
/**
 * Performs cleanup tasks before exiting
 */
function cleanup() {
    if (authServer) {
        console.error('Closing auth server');
        authServer.close();
        authServer = null;
    }
}
/**
 * Cleans up resources and exits the process
 *
 * @param {number} exitCode - The exit code to use (default: 0)
 */
function cleanupAndExit(exitCode = 0) {
    console.error('Shutting down...');
    cleanup();
    process.exit(exitCode);
}
// Start the application and handle any fatal errors
main().catch((error) => {
    console.error("Fatal error in main():", error);
    cleanupAndExit(1);
});
