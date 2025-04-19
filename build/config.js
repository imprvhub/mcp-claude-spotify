/**
 * Application configuration
 *
 * This file centralizes all configuration values and loads
 * environment variables from .env file if available.
 */
import dotenv from "dotenv";
// Load environment variables from .env file
dotenv.config();
/**
 * Environment variables validation
 */
function validateConfig() {
    const requiredVars = [
        'SPOTIFY_CLIENT_ID',
        'SPOTIFY_CLIENT_SECRET'
    ];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
        console.error(`Missing required environment variables: ${missingVars.join(', ')}`);
        console.error('Please set these variables in your .env file or environment');
        process.exit(1);
    }
}
// Run validation
validateConfig();
/**
 * API configuration
 */
export const API = {
    SPOTIFY_API_BASE: "https://api.spotify.com/v1",
    SPOTIFY_AUTH_BASE: "https://accounts.spotify.com"
};
/**
 * Server configuration
 */
export const SERVER = {
    PORT: process.env.PORT ? parseInt(process.env.PORT) : 8888,
    HOST: process.env.HOST || "127.0.0.1"
};
/**
 * Authentication configuration
 */
export const AUTH = {
    CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
    CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
    REDIRECT_URI: `http://${SERVER.HOST}:${SERVER.PORT}/callback`,
    // Scopes required for the app
    SCOPES: [
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
    ]
};
/**
 * Application configuration
 */
export const APP = {
    NAME: "spotify-mcp",
    VERSION: "0.1.0",
    NODE_ENV: process.env.NODE_ENV || "development",
    // Determine if we're in production
    IS_PROD: process.env.NODE_ENV === "production",
    // Determine if we should output debug logs
    DEBUG: process.env.DEBUG === "true" || process.env.NODE_ENV !== "production"
};
export default {
    API,
    SERVER,
    AUTH,
    APP
};
