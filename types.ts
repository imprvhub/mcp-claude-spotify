/**
 * Type definitions for Spotify API responses
 * 
 * This file contains TypeScript interfaces for the Spotify API response objects.
 * These are used to provide better type safety and IntelliSense when working with
 * the Spotify API data.
 */

/**
 * Spotify track object
 */
export interface SpotifyTrack {
  id: string;
  name: string;
  duration_ms: number;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  external_urls: {
    spotify: string;
  };
}

/**
 * Spotify artist object
 */
export interface SpotifyArtist {
  id: string;
  name: string;
  genres?: string[];
  external_urls: {
    spotify: string;
  };
}

/**
 * Spotify album object
 */
export interface SpotifyAlbum {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  release_date: string;
  total_tracks: number;
  external_urls: {
    spotify: string;
  };
}

/**
 * Spotify playlist object
 */
export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  owner: {
    display_name?: string;
    id?: string;
  };
  items?: {
    total: number;
  };
  // Backward compatibility with pre-February 2026 responses.
  tracks?: {
    total: number;
  };
  public: boolean;
  external_urls: {
    spotify: string;
  };
}

/**
 * Spotify playback state object
 */
export interface SpotifyPlayback {
  is_playing: boolean;
  progress_ms: number;
  item?: SpotifyTrack;
  device: {
    id: string;
    name: string;
    volume_percent: number;
  };
  shuffle_state: boolean;
  repeat_state: "off" | "track" | "context";
}

/**
 * Spotify search response
 */
export interface SpotifySearchResponse {
  tracks?: {
    items: SpotifyTrack[];
  };
  albums?: {
    items: SpotifyAlbum[];
  };
  artists?: {
    items: SpotifyArtist[];
  };
  playlists?: {
    items: SpotifyPlaylist[];
  };
}

/**
 * Spotify recommendations response
 */
export interface SpotifyRecommendationsResponse {
  tracks: SpotifyTrack[];
  seeds: {
    id: string;
    type: "track" | "artist" | "genre";
  }[];
}

/**
 * Spotify user object
 */
export interface SpotifyUser {
  id: string;
  display_name: string;
  email?: string;
  country?: string;
  images?: {
    url: string;
    height: number;
    width: number;
  }[];
  external_urls: {
    spotify: string;
  };
}

/**
 * Spotify playlist list response
 */
export interface SpotifyPlaylistResponse {
  items: SpotifyPlaylist[];
  total: number;
}
