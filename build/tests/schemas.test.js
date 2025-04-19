import { z } from 'zod';
// Import your schemas or recreate them for testing
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
describe('Zod Schema Validation Tests', () => {
    describe('SearchSchema', () => {
        it('should validate with required fields only', () => {
            const data = { query: 'test search' };
            const result = SearchSchema.parse(data);
            expect(result).toEqual({
                query: 'test search',
                type: 'track',
                limit: 10
            });
        });
        it('should validate with all fields', () => {
            const data = { query: 'test search', type: 'artist', limit: 20 };
            const result = SearchSchema.parse(data);
            expect(result).toEqual(data);
        });
        it('should reject invalid type', () => {
            const data = { query: 'test search', type: 'invalid' };
            expect(() => SearchSchema.parse(data)).toThrow();
        });
        it('should reject invalid limit', () => {
            const data = { query: 'test search', limit: 51 };
            expect(() => SearchSchema.parse(data)).toThrow();
        });
    });
    describe('PlayTrackSchema', () => {
        it('should validate with required fields only', () => {
            const data = { trackId: '123456' };
            const result = PlayTrackSchema.parse(data);
            expect(result).toEqual(data);
        });
        it('should validate with all fields', () => {
            const data = { trackId: '123456', deviceId: '789012' };
            const result = PlayTrackSchema.parse(data);
            expect(result).toEqual(data);
        });
        it('should reject missing trackId', () => {
            const data = { deviceId: '789012' };
            expect(() => PlayTrackSchema.parse(data)).toThrow();
        });
    });
    describe('CreatePlaylistSchema', () => {
        it('should validate with required fields only', () => {
            const data = { name: 'My Playlist' };
            const result = CreatePlaylistSchema.parse(data);
            expect(result).toEqual({
                name: 'My Playlist',
                public: false
            });
        });
        it('should validate with all fields', () => {
            const data = {
                name: 'My Playlist',
                description: 'A great playlist',
                public: true
            };
            const result = CreatePlaylistSchema.parse(data);
            expect(result).toEqual(data);
        });
        it('should reject missing name', () => {
            const data = { description: 'A great playlist' };
            expect(() => CreatePlaylistSchema.parse(data)).toThrow();
        });
    });
    describe('AddTracksSchema', () => {
        it('should validate valid data', () => {
            const data = {
                playlistId: '123456',
                trackIds: ['track1', 'track2']
            };
            const result = AddTracksSchema.parse(data);
            expect(result).toEqual(data);
        });
        it('should reject missing playlistId', () => {
            const data = { trackIds: ['track1', 'track2'] };
            expect(() => AddTracksSchema.parse(data)).toThrow();
        });
        it('should reject missing trackIds', () => {
            const data = { playlistId: '123456' };
            expect(() => AddTracksSchema.parse(data)).toThrow();
        });
        it('should reject non-array trackIds', () => {
            const data = { playlistId: '123456', trackIds: 'track1' };
            expect(() => AddTracksSchema.parse(data)).toThrow();
        });
    });
    describe('GetRecommendationsSchema', () => {
        it('should validate with seed tracks', () => {
            const data = { seedTracks: ['track1', 'track2'] };
            const result = GetRecommendationsSchema.parse(data);
            expect(result).toEqual({
                seedTracks: ['track1', 'track2'],
                limit: 20
            });
        });
        it('should validate with seed artists', () => {
            const data = { seedArtists: ['artist1', 'artist2'], limit: 30 };
            const result = GetRecommendationsSchema.parse(data);
            expect(result).toEqual(data);
        });
        it('should validate with seed genres', () => {
            const data = { seedGenres: ['rock', 'pop'] };
            const result = GetRecommendationsSchema.parse(data);
            expect(result).toEqual({
                seedGenres: ['rock', 'pop'],
                limit: 20
            });
        });
        it('should validate with mixed seeds', () => {
            const data = {
                seedTracks: ['track1'],
                seedArtists: ['artist1'],
                seedGenres: ['rock']
            };
            const result = GetRecommendationsSchema.parse(data);
            expect(result).toEqual({
                seedTracks: ['track1'],
                seedArtists: ['artist1'],
                seedGenres: ['rock'],
                limit: 20
            });
        });
        it('should reject invalid limit', () => {
            const data = { seedTracks: ['track1'], limit: 101 };
            expect(() => GetRecommendationsSchema.parse(data)).toThrow();
        });
    });
});
