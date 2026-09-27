/**
 * @jest-environment node
 *
 * Covers the two authentication defects fixed in 0.6.0: a callback with no state
 * check, and a token file written world-readable.
 */
import fs from 'node:fs';
import os from 'node:os';
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
  it('stays out of the real home directory', () => {
    // `npm test` runs jest with HOME pointed at a scratch directory.
    expect(TOKEN_PATH.startsWith(os.homedir())).toBe(true);
    expect(TOKEN_PATH.startsWith(os.userInfo().homedir)).toBe(false);
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
