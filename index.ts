import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import { z } from "zod";
import express from "express";
import axios from "axios";
import querystring from "querystring";
import open from "open";
import net from "net";
import { ServerAlreadyRunningError } from "./errors.js";

dotenv.config();

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const SPOTIFY_AUTH_BASE = "https://accounts.spotify.com";

const PORT = 8888;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

/**
 * Check if a port is already in use
 * 
 * @param {number} port - The port to check
 * @returns {Promise<boolean>} - True if the port is in use, false otherwise
 */
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
      .once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          resolve(true);
        } else {
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

let accessToken: string | null = null;
let refreshToken: string | null = null;
let tokenExpirationTime = 0;
let authServer: any = null;

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

const server = new Server(
  {
    name: "spotify-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

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
async function ensureToken(): Promise<string | null> {
  const now = Date.now();
  
  // Return existing token if not expired (with 1-minute buffer)
  if (accessToken && now < tokenExpirationTime - 60000) {
    return accessToken;
  }
  
  // Try to refresh the token if we have a refresh token
  if (refreshToken) {
    try {
      const response = await axios.post(
        `${SPOTIFY_AUTH_BASE}/api/token`,
        querystring.stringify({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(
              `${CLIENT_ID}:${CLIENT_SECRET}`
            ).toString("base64")}`,
          },
        }
      );
      
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
async function spotifyApiRequest(endpoint: string, method: string = "GET", data: any = null) {
  const token = await ensureToken();
  
  if (!token) {
    throw new Error("Not authenticated. Please authorize the app first.");
  }
  
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
  } catch (error: any) {
    console.error(`Spotify API error: ${error.message}`);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data:`, error.response.data);
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
async function startAuthServer(): Promise<void> {
  // If we already have an auth server instance, reuse it
  if (authServer) {
    console.error("Auth server is already running, opening login page");
    await open(`http://127.0.0.1:${PORT}/login`);
    return Promise.resolve();
  }
  
  // Check if port is already in use (another instance might be running)
  const portInUse = await isPortInUse(PORT);
  if (portInUse) {
    console.error(`Port ${PORT} is already in use, attempting to use existing server`);
    
    try {
      // Try to open the login page of the existing server
      await open(`http://127.0.0.1:${PORT}/login`);
      return Promise.resolve();
    } catch (error) {
      // If we can't open the login page, the existing server might not be a Spotify auth server
      throw new ServerAlreadyRunningError(PORT);
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
      
      res.redirect(
        `${SPOTIFY_AUTH_BASE}/authorize?${querystring.stringify({
          response_type: "code",
          client_id: CLIENT_ID,
          scope: scopes.join(" "),
          redirect_uri: REDIRECT_URI,
        })}`
      );
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
        const response = await axios.post(
          `${SPOTIFY_AUTH_BASE}/api/token`,
          querystring.stringify({
            code: code as string,
            redirect_uri: REDIRECT_URI,
            grant_type: "authorization_code",
          }),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Basic ${Buffer.from(
                `${CLIENT_ID}:${CLIENT_SECRET}`
              ).toString("base64")}`,
            },
          }
        );
        
        // Store the tokens and expiration time
        accessToken = response.data.access_token;
        refreshToken = response.data.refresh_token;
        tokenExpirationTime = Date.now() + response.data.expires_in * 1000;
        
        res.send("Authentication successful! You can close this window now.");
        resolve();
      } catch (error: any) {
        console.error("Error getting tokens:", error.message);
        res.send("Authentication failed: " + error.message);
        reject(error);
      }
    });
    
    // Start the server and open the browser
    try {
      authServer = app.listen(PORT, () => {
        console.error(`Auth server listening at http://127.0.0.1:${PORT}`);
        open(`http://127.0.0.1:${PORT}/login`);
      });
      
      // Handle server errors
      authServer.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`Port ${PORT} is already in use`);
          reject(new ServerAlreadyRunningError(PORT));
        } else {
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
    } catch (error: any) {
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
          properties: {},
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
    ],
  };
});

server.setRequestHandler(
  CallToolRequestSchema,
  async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params;
    
    try {
      if (name === "auth-spotify") {
        try {
          await startAuthServer();
          return {
            content: [
              {
                type: "text",
                text: "Successfully authenticated with Spotify!",
              },
            ],
          };
        } catch (error: any) {
          // If the error is that the server is already running, provide a helpful message
          if (error instanceof ServerAlreadyRunningError) {
            return {
              content: [
                {
                  type: "text",
                  text: `Another instance is already running on port ${error.port}. Attempted to connect to that instance. If you're having issues, please ensure no other processes are using port ${error.port} or try again later.`,
                },
              ],
            };
          }
          
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
        
        const results = await spotifyApiRequest(
          `/search?${querystring.stringify({
            q: query,
            type,
            limit,
          })}`
        );
        
        let formattedResults = "";
        
        if (type === "track" && results.tracks) {
          formattedResults = results.tracks.items
            .map(
              (track: any) => `
Track: ${track.name}
Artist: ${track.artists.map((a: any) => a.name).join(", ")}
Album: ${track.album.name}
ID: ${track.id}
Duration: ${Math.floor(track.duration_ms / 1000 / 60)}:${(
                Math.floor(track.duration_ms / 1000) % 60
              )
                .toString()
                .padStart(2, "0")}
URL: ${track.external_urls.spotify}
---`
            )
            .join("\n");
        } else if (type === "album" && results.albums) {
          formattedResults = results.albums.items
            .map(
              (album: any) => `
Album: ${album.name}
Artist: ${album.artists.map((a: any) => a.name).join(", ")}
ID: ${album.id}
Release Date: ${album.release_date}
Tracks: ${album.total_tracks}
URL: ${album.external_urls.spotify}
---`
            )
            .join("\n");
        } else if (type === "artist" && results.artists) {
          formattedResults = results.artists.items
            .map(
              (artist: any) => `
Artist: ${artist.name}
ID: ${artist.id}
Popularity: ${artist.popularity}/100
Followers: ${artist.followers?.total || "N/A"}
Genres: ${artist.genres?.join(", ") || "None"}
URL: ${artist.external_urls.spotify}
---`
            )
            .join("\n");
        } else if (type === "playlist" && results.playlists) {
          formattedResults = results.playlists.items
            .map(
              (playlist: any) => `
Playlist: ${playlist.name}
Creator: ${playlist.owner.display_name}
ID: ${playlist.id}
Tracks: ${playlist.tracks.total}
Description: ${playlist.description || "None"}
URL: ${playlist.external_urls.spotify}
---`
            )
            .join("\n");
        }
        
        return {
          content: [
            {
              type: "text",
              text:
                formattedResults ||
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
Artist: ${playback.item.artists.map((a: any) => a.name).join(", ")}
Album: ${playback.item.album.name}
Progress: ${Math.floor(playback.progress_ms / 1000 / 60)}:${(
            Math.floor(playback.progress_ms / 1000) % 60
          )
            .toString()
            .padStart(2, "0")} / ${Math.floor(
            playback.item.duration_ms / 1000 / 60
          )}:${(Math.floor(playback.item.duration_ms / 1000) % 60)
            .toString()
            .padStart(2, "0")}
Device: ${playback.device.name}
Volume: ${playback.device.volume_percent}%
Shuffle: ${playback.shuffle_state ? "On" : "Off"}
Repeat: ${
            playback.repeat_state === "off"
              ? "Off"
              : playback.repeat_state === "context"
              ? "Context"
              : "Track"
          }`;
        } else {
          responseText = `
No track currently playing.
Device: ${playback.device.name}
Volume: ${playback.device.volume_percent}%
Shuffle: ${playback.shuffle_state ? "On" : "Off"}
Repeat: ${
            playback.repeat_state === "off"
              ? "Off"
              : playback.repeat_state === "context"
              ? "Context"
              : "Track"
          }`;
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
        const playlists = await spotifyApiRequest("/me/playlists");
        
        if (playlists.items.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "You don't have any playlists.",
              },
            ],
          };
        }
        
        const formattedPlaylists = playlists.items
          .map(
            (playlist: any) => `
Name: ${playlist.name}
ID: ${playlist.id}
Owner: ${playlist.owner.display_name}
Tracks: ${playlist.tracks.total}
Public: ${playlist.public ? "Yes" : "No"}
URL: ${playlist.external_urls.spotify}
---`
          )
          .join("\n");
        
        return {
          content: [
            {
              type: "text",
              text: `Your playlists:\n${formattedPlaylists}`,
            },
          ],
        };
      }
      
      if (name === "create-playlist") {
        const { name, description, public: isPublic } = CreatePlaylistSchema.parse(args);
        
        const userInfo = await spotifyApiRequest("/me");
        const userId = userInfo.id;
        
        const playlist = await spotifyApiRequest(
          `/users/${userId}/playlists`,
          "POST",
          {
            name,
            description,
            public: isPublic,
          }
        );
        
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
        
        await spotifyApiRequest(
          `/playlists/${playlistId}/tracks`,
          "POST",
          {
            uris,
          }
        );
        
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
        
        if (limit) params.append("limit", limit.toString());
        if (seedTracks) params.append("seed_tracks", seedTracks.join(","));
        if (seedArtists) params.append("seed_artists", seedArtists.join(","));
        if (seedGenres) params.append("seed_genres", seedGenres.join(","));
        
        const recommendations = await spotifyApiRequest(`/recommendations?${params}`);
        
        const formattedRecommendations = recommendations.tracks
          .map(
            (track: any) => `
Track: ${track.name}
Artist: ${track.artists.map((a: any) => a.name).join(", ")}
Album: ${track.album.name}
ID: ${track.id}
Duration: ${Math.floor(track.duration_ms / 1000 / 60)}:${(
              Math.floor(track.duration_ms / 1000) % 60
            )
              .toString()
              .padStart(2, "0")}
URL: ${track.external_urls.spotify}
---`
          )
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
      
      throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Invalid arguments: ${error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ")}`
        );
      }
      throw error;
    }
  }
);

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
  } catch (error) {
    console.error("Error connecting to transport:", error);
    throw error;
  }
}

/**
 * Sets up handlers for graceful shutdown
 * 
 * This ensures that the HTTP server is properly closed when
 * the process is terminated, preventing port conflicts on restart.
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