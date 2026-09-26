/**
 * @jest-environment node
 *
 * Covers the two authentication defects fixed in 0.6.0: a callback with no state
 * check, and a token file written world-readable.
 */
import fs from 'node:fs';
import { statesMatch, writeTokenFile, authorizeUrl, TOKEN_PATH } from '../index.js';

describe('OAuth state validation', () => {
  it('rejects a callback when no login is in flight', () => {
    // authState is null until startAuthServer() generates one.
    expect(statesMatch('anything')).toBe(false);
    expect(statesMatch(null)).toBe(false);
    expect(statesMatch('')).toBe(false);
  });

  it('puts a state parameter on the authorize URL', () => {
    const url = new URL(authorizeUrl('abc123'));
    expect(url.searchParams.get('state')).toBe('abc123');
    expect(url.searchParams.get('response_type')).toBe('code');
    // Spotify requires an explicit loopback IP; "localhost" is rejected.
    expect(url.searchParams.get('redirect_uri')).toContain('127.0.0.1');
  });
});

describe('token file permissions', () => {
  const existing = fs.existsSync(TOKEN_PATH) ? fs.readFileSync(TOKEN_PATH) : null;
  const existingMode = existing ? fs.statSync(TOKEN_PATH).mode : null;

  afterAll(() => {
    // Leave a developer's real token file exactly as it was.
    if (existing) {
      fs.writeFileSync(TOKEN_PATH, existing);
      if (existingMode !== null) fs.chmodSync(TOKEN_PATH, existingMode & 0o777);
    } else if (fs.existsSync(TOKEN_PATH)) {
      fs.rmSync(TOKEN_PATH);
    }
  });

  it('writes the refresh token readable by its owner only', () => {
    writeTokenFile(JSON.stringify({ accessToken: 'test', refreshToken: 'test' }));
    const mode = fs.statSync(TOKEN_PATH).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('tightens an existing file that was created world-readable', () => {
    // writeFileSync's `mode` only applies when it creates the file, which is exactly
    // why writeTokenFile also calls chmod: an existing token file keeps its old mode.
    fs.writeFileSync(TOKEN_PATH, '{}');
    fs.chmodSync(TOKEN_PATH, 0o644);
    expect(fs.statSync(TOKEN_PATH).mode & 0o777).toBe(0o644);
    writeTokenFile('{"accessToken":"x","refreshToken":"y"}');
    expect(fs.statSync(TOKEN_PATH).mode & 0o777).toBe(0o600);
  });
});
