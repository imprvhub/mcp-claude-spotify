# MCP Claude Spotify

<table style="border-collapse: collapse; width: 100%;">
<tr>
<td style="width: 50%; padding: 15px; vertical-align: middle; border: none;">An integration that allows Claude Desktop to interact with Spotify using the Model Context Protocol (MCP).</td>
<td style="width: 50%; padding: 0; vertical-align: middle; border: none;"><a href="https://glama.ai/mcp/servers/@imprvhub/mcp-claude-spotify"><img src="https://glama.ai/mcp/servers/@imprvhub/mcp-claude-spotify/badge" alt="Claude Spotify MCP server" style="max-width: 100%;" /></a></td>
</tr>
</table>

## Features

- Spotify authentication
- Search for tracks, albums, artists, and playlists
- Playback control (play, pause, next, previous)
- Create and manage playlists
- Get personalized recommendations
- Access user's top played tracks over different time periods

## Demo

<p>
  <a href="https://www.youtube.com/watch?v=WNw5H9epZfc">
    <img src="public/assets/preview.png" width="600" alt="Claude Spotify Integration Demo">
  </a>
</p>

## Requirements

- Node.js 16 or higher
- Spotify account
- Claude Desktop
- Spotify API credentials (Client ID and Client Secret)

## Installation

1. Clone or download this repository:
```bash
git clone https://github.com/imprvhub/mcp-claude-spotify
cd claude-spotify-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Build the project (if you want to modify the source code):
```bash
npm run build
```

The repository already includes pre-built files in the `build` directory, so you can skip step 3 if you don't plan to modify the source code.

## Setting up Spotify Credentials

To use this MCP, you need to obtain Spotify API credentials:

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click "Create App"
4. Fill in your app information:
   - App name: "MCP Claude Spotify" (or whatever you prefer)
   - App description: "Spotify integration for Claude Desktop"
   - Website: You can leave this blank or put any URL
   - Redirect URI: **Important** - Add `http://127.0.0.1:8888/callback`
5. Accept the terms and conditions and click "Create"
6. In your app dashboard, you'll see the "Client ID"
7. Click "Show Client Secret" to reveal your "Client Secret"

Save these credentials as you'll need them for configuration.

## Running the MCP Server

There are two ways to run the MCP server:

### Option 1: Running manually (recommended for first-time setup and troubleshooting)

1. Open a terminal or command prompt
2. Navigate to the project directory
3. Run the server directly:

```bash
node build/index.js
```

Keep this terminal window open while using Claude Desktop. The server will run until you close the terminal.

### Option 2: Auto-starting with Claude Desktop (recommended for regular use)

The Claude Desktop can automatically start the MCP server when needed. To set this up:

#### Configuration

The Claude Desktop configuration file is located at:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Edit this file to add the Spotify MCP configuration. If the file doesn't exist, create it:

```json
{
  "mcpServers": {
    "spotify": {
      "command": "node",
      "args": ["ABSOLUTE_PATH_TO_DIRECTORY/mcp-claude-spotify/build/index.js"],
      "env": {
        "SPOTIFY_CLIENT_ID": "your_client_id_here",
        "SPOTIFY_CLIENT_SECRET": "your_client_secret_here"
      }
    }
  }
}
```

**Important**: Replace:
- `ABSOLUTE_PATH_TO_DIRECTORY` with the **complete absolute path** where you installed the MCP
  - macOS/Linux example: `/Users/username/mcp-claude-spotify`
  - Windows example: `C:\\Users\\username\\mcp-claude-spotify`
- `your_client_id_here` with the Client ID you obtained from Spotify
- `your_client_secret_here` with the Client Secret you obtained from Spotify

If you already have other MCPs configured, simply add the "spotify" section inside the "mcpServers" object.

#### Setting up auto-start scripts (Optional)

For a more reliable experience, you can set up auto-start scripts:

<details>
<summary><b>Windows auto-start instructions</b></summary>

1. Create a file named `start-spotify-mcp.bat` in the project directory with the following content:
```
@echo off
cd %~dp0
node build/index.js
```

2. Create a shortcut to this BAT file
3. Press `Win+R`, type `shell:startup` and press Enter
4. Move the shortcut to this folder to have it start with Windows
</details>

<details>
<summary><b>macOS auto-start instructions</b></summary>

1. Create a file named `com.spotify.mcp.plist` in `~/Library/LaunchAgents/` with the following content:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.spotify.mcp</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>ABSOLUTE_PATH_TO_DIRECTORY/mcp-claude-spotify/build/index.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardErrorPath</key>
    <string>/tmp/spotify-mcp.err</string>
    <key>StandardOutPath</key>
    <string>/tmp/spotify-mcp.out</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>SPOTIFY_CLIENT_ID</key>
        <string>your_client_id_here</string>
        <key>SPOTIFY_CLIENT_SECRET</key>
        <string>your_client_secret_here</string>
    </dict>
</dict>
</plist>
```

2. Replace the path and credentials with your actual values
3. Load the agent with: `launchctl load ~/Library/LaunchAgents/com.spotify.mcp.plist`
</details>

<details>
<summary><b>Linux auto-start instructions</b></summary>

1. Create a file named `spotify-mcp.service` in `~/.config/systemd/user/` (create the directory if it doesn't exist):
```
[Unit]
Description=Spotify MCP Server for Claude Desktop
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node ABSOLUTE_PATH_TO_DIRECTORY/mcp-claude-spotify/build/index.js
Restart=on-failure
Environment="SPOTIFY_CLIENT_ID=your_client_id_here"
Environment="SPOTIFY_CLIENT_SECRET=your_client_secret_here"

[Install]
WantedBy=default.target
```

2. Replace the path and credentials with your actual values
3. Enable and start the service:
```bash
systemctl --user enable spotify-mcp.service
systemctl --user start spotify-mcp.service
```

4. Check status with:
```bash
systemctl --user status spotify-mcp.service
```
</details>

## Usage

1. Restart Claude Desktop after modifying the configuration
2. In Claude, use the `auth-spotify` command to start the authentication process
3. A browser window will open for you to authorize the application
4. Log in with your Spotify account and authorize the application
5. **Important**: After successful authentication, restart Claude Desktop to properly initialize the MCP's tool registry and WebSocket session token cache
6. After restarting, all Spotify MCP tools will be properly registered and available for use

The MCP server runs as a child process managed by Claude Desktop. When Claude is running, it automatically starts and manages the Node.js server process based on the configuration in `claude_desktop_config.json`.

## Available Tools

### auth-spotify
Initiates the Spotify authentication process.

### search-spotify
Searches for tracks, albums, artists, or playlists.

**Parameters:**
- `query`: Search text
- `type`: Type of search (track, album, artist, playlist)
- `limit`: Number of results (1-50)

### play-track
Plays a specific track.

**Parameters:**
- `trackId`: Spotify track ID
- `deviceId`: (Optional) Spotify device ID to play on

### get-current-playback
Gets information about the current playback.

### pause-playback
Pauses the playback.

### next-track
Skips to the next track.

### previous-track
Returns to the previous track.

### get-user-playlists
Gets the user's playlists.

### create-playlist
Creates a new playlist.

**Parameters:**
- `name`: Playlist name
- `description`: (Optional) Description
- `public`: (Optional) Whether it's public or private

### add-tracks-to-playlist
Adds tracks to a playlist.

**Parameters:**
- `playlistId`: Playlist ID
- `trackIds`: Array of track IDs

### get-recommendations
Gets recommendations based on seeds.

**Parameters:**
- `seedTracks`: (Optional) Array of track IDs
- `seedArtists`: (Optional) Array of artist IDs
- `seedGenres`: (Optional) Array of genres
- `limit`: (Optional) Number of recommendations (1-100)

### get-top-tracks
Gets the user's most played tracks over a specified time range.

**Parameters:**
- `limit`: (Optional) Number of tracks to return (1-50, default: 20)
- `offset`: (Optional) Index of the first track to return (default: 0)
- `time_range`: (Optional) Time frame for calculating affinity:
  - `short_term`: Approximately last 4 weeks
  - `medium_term`: Approximately last 6 months (default)
  - `long_term`: Several years of data

## Troubleshooting

### "Server disconnected" error
If you see the error "MCP Spotify: Server disconnected" in Claude Desktop:

1. **Verify the server is running**:
   - Open a terminal and manually run `node build/index.js` from the project directory
   - If the server starts successfully, use Claude while keeping this terminal open

2. **Check your configuration**:
   - Ensure the absolute path in `claude_desktop_config.json` is correct for your system
   - Double-check that you've used double backslashes (`\\`) for Windows paths
   - Verify you're using the complete path from the root of your filesystem

3. **Try the auto-start option**:
   - Set up the auto-start script for your operating system as described in the "Setting up auto-start scripts" section
   - This ensures the server is always running when you need it

### Browser doesn't open automatically
If the browser doesn't open automatically during authentication, manually visit:
`http://127.0.0.1:8888/login`

### Authentication error
Make sure you've correctly configured the redirect URI in your Spotify Developer dashboard:
`http://127.0.0.1:8888/callback`

### Server startup error
Verify that:
- Environment variables are correctly configured in your `claude_desktop_config.json` or launch script
- Node.js is installed and compatible (v16+)
- Required ports (8888) are available and not blocked by firewall
- You have permission to run the script in the specified location

### Tools not appearing in Claude
If the Spotify tools don't appear in Claude after authentication:
- Make sure you've restarted Claude Desktop after successful authentication
- Check the Claude Desktop logs for any MCP communication errors
- Ensure the MCP server process is running (run it manually to confirm)
- Verify that the MCP server is correctly registered in the Claude Desktop MCP registry

### Checking if the server is running
To check if the server is running:

- **Windows**: Open Task Manager, go to the "Details" tab, and look for "node.exe"
- **macOS/Linux**: Open Terminal and run `ps aux | grep node`

If you don't see the server running, start it manually or use the auto-start method.

## Testing

This project includes automated tests to ensure code quality and functionality. The test suite uses Jest with TypeScript support and covers:

- Zod schema validation - verifies all input schemas correctly validate data
- Spotify API interactions - tests API request handling and error handling
- MCP server functionality - ensures proper registration and execution of tools

### Running Tests

First, make sure all development dependencies are installed:

```bash
npm install
```

To run all tests:

```bash
npm test
```

To run a specific test file:

```bash
npm test -- --testMatch="**/tests/schemas.test.ts"
```

If you encounter issues with ESM modules, make sure you're using Node.js v16 or higher and that the NODE_OPTIONS environment variable includes the `--experimental-vm-modules` flag as configured in the package.json.

### Test Structure

- `tests/schemas.test.ts`: Tests for input validation schemas
- `tests/spotify-api.test.ts`: Tests for Spotify API interactions
- `tests/server.test.ts`: Tests for MCP server functionality

### Adding New Tests

When adding new functionality, please include corresponding tests:

1. For new schemas, add validation tests in `schemas.test.ts`
2. For Spotify API functions, add tests in `spotify-api.test.ts` 
3. For MCP tools, add tests in `server.test.ts`

All tests should be written using Jest and the ESM module format with TypeScript.

## Security Notes

- Never share your Client ID and Client Secret
- Access token is now stored in the user's home directory at `~/.spotify-mcp/tokens.json` to enable persistence between sessions and multiple instances
- No user data is stored on disk

### Revoking Application Access

For security reasons, you may want to revoke the application's access to your Spotify account when:
- You no longer use this integration
- You suspect unauthorized access
- You're troubleshooting authentication issues

To revoke access:

1. Go to your [Spotify Account page](https://www.spotify.com/account)
2. Navigate to "Apps" in the menu
3. Find "MCP Claude Spotify" (or the name you chose for your app)
4. Click "REMOVE ACCESS"

This immediately invalidates all access and refresh tokens. The next time you use the `auth-spotify` command, you'll need to authorize the application again.

## Contributing

Contributions are welcome! Here are some guidelines to follow:

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests to ensure they pass (`npm test`)
5. Commit your changes (`git commit -m 'Add some amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Code Style Guidelines

This project follows these coding standards:

- Use TypeScript with strict type checking
- Follow ESM module format
- Use 2 spaces for indentation
- Use camelCase for variables and functions
- Use PascalCase for classes and interfaces
- Document functions with JSDoc comments
- Keep line length under 100 characters

### Project Structure

The project follows this structure:

```
mcp-claude-spotify/
├── src/               # Source code
├── build/             # Compiled JavaScript
├── tests/             # Test files
├── public/            # Public assets
└── ...
```

### Pull Request Process

1. Ensure your code follows the style guidelines
2. Update documentation if needed
3. Add tests for new functionality
4. Make sure all tests pass
5. Your PR will be reviewed by maintainers

## Related Links

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Spotify Web API Documentation](https://developer.spotify.com/documentation/web-api)
- [Claude Desktop](https://claude.ai/download)

## License

This project is licensed under the Mozilla Public License 2.0 - see the [LICENSE](https://github.com/imprvhub/mcp-claude-spotify/blob/main/LICENSE) file for details.
