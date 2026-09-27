/**
 * @jest-environment node
 *
 * IDs from tool arguments end up in Spotify API paths and query strings; only plain
 * Spotify IDs may get through.
 */
import { spotifyId } from '../index.js';

describe('Spotify ID validation', () => {
  it('accepts real track, playlist and device IDs', () => {
    for (const id of ['4uLU6hMCjMI75M1A2tKUQC', '37i9dQZF1DXcBWIGoYBM5M', '0d1841b0976bae2a3a310dd74c0f3df354899bc8']) {
      expect(spotifyId.safeParse(id).success).toBe(true);
    }
  });

  it('rejects values that would change the request path or query', () => {
    for (const bad of ['..', '../me', 'abc/def', 'x&device_id=other', 'x?y=1', 'x#frag', '', 'a b', 'spotify:track:4uLU6hMCjMI75M1A2tKUQC']) {
      expect(spotifyId.safeParse(bad).success).toBe(false);
    }
  });

  it('bounds the length', () => {
    expect(spotifyId.safeParse('a'.repeat(64)).success).toBe(true);
    expect(spotifyId.safeParse('a'.repeat(65)).success).toBe(false);
  });
});
