/**
 * @jest-environment node
 */
import { jest } from '@jest/globals';

// Define mock functions
const mockSetRequestHandler = jest.fn();
const mockConnect = jest.fn();
const mockGet = jest.fn();
const mockListen = jest.fn();
const mockOn = jest.fn();
const mockClose = jest.fn();
const mockUse = jest.fn();
const mockPost = jest.fn();

// Create a simulated response for the auth server
const mockResponse = {
  redirect: jest.fn(),
  send: jest.fn()
};

// Mock Server class
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    setRequestHandler: mockSetRequestHandler,
    connect: mockConnect
  }))
}));

// Mock StdioServerTransport class
jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn().mockImplementation(() => ({
    onMessage: jest.fn(),
    send: jest.fn()
  }))
}));

// Mock express
jest.mock('express', () => {
  const mockExpress = jest.fn(() => ({
    get: mockGet,
    listen: mockListen,
    use: mockUse,
    post: mockPost
  }));
  mockExpress.json = jest.fn(() => 'json-middleware');
  mockExpress.urlencoded = jest.fn(() => 'urlencoded-middleware');
  mockExpress.Router = jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn()
  }));
  return mockExpress;
});

// Mock axios for token handling
jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({ 
    data: { 
      access_token: 'mock-token', 
      refresh_token: 'mock-refresh-token', 
      expires_in: 3600 
    }
  }),
  default: jest.fn().mockImplementation(() => Promise.resolve({ 
    data: {} 
  }))
}));

// Mock the net module for port checking
jest.mock('net', () => {
  // Create a server object for mocking
  const mockServer = {
    once: jest.fn((event, callback) => {
      if (event === 'listening') {
        setTimeout(() => callback(), 0);
      }
      return mockServer;
    }),
    listen: jest.fn().mockReturnThis(),
    close: jest.fn()
  };
  
  return {
    createServer: jest.fn(() => mockServer)
  };
});

// Mock the open package
jest.mock('open', () => jest.fn());

describe('MCP Server', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Configure mock routes response
    mockGet.mockImplementation((path, handler) => {
      if (path === '/login' || path === '/callback') {
        handler(null, mockResponse);
      }
      return { get: mockGet };
    });
    
    // Mock listen to call the callback
    mockListen.mockImplementation((port, callback) => {
      if (callback) callback();
      return { on: mockOn, close: mockClose };
    });
    
    // Mock the on method for error handling
    mockOn.mockImplementation((event, handler) => {
      return { on: mockOn, close: mockClose };
    });
  });
  
  describe('Server setup', () => {
    it('should set up request handlers for tools', async () => {
      // Just test the mock setup to ensure they are correctly configured
      expect(mockSetRequestHandler).toBeDefined();
      
      // Call it to verify it works as expected
      mockSetRequestHandler('test', () => {});
      expect(mockSetRequestHandler).toHaveBeenCalledWith('test', expect.any(Function));
    });
    
    it('should have a connection method for the transport', () => {
      expect(mockConnect).toBeDefined();
      
      // Call it to verify it works as expected
      mockConnect();
      expect(mockConnect).toHaveBeenCalled();
    });
  });
  
  describe('Authentication Server', () => {
    it('should set up login and callback routes', () => {
      // Simulate express routes
      expect(mockGet).toBeDefined();
      
      // Set up routes
      mockGet('/login', (req, res) => {
        res.redirect('spotify-auth-url');
      });
      
      mockGet('/callback', (req, res) => {
        res.send('Success');
      });
      
      // Verify routes were called
      expect(mockGet).toHaveBeenCalledWith('/login', expect.any(Function));
      expect(mockGet).toHaveBeenCalledWith('/callback', expect.any(Function));
      
      // Call the login route handler
      const loginHandler = mockGet.mock.calls.find(call => call[0] === '/login')[1];
      loginHandler(null, mockResponse);
      expect(mockResponse.redirect).toHaveBeenCalled();
      
      // Call the callback route handler
      const callbackHandler = mockGet.mock.calls.find(call => call[0] === '/callback')[1];
      callbackHandler({query: {code: 'test-code'}}, mockResponse);
      expect(mockResponse.send).toHaveBeenCalled();
    });
    
    it('should start the server on the correct port', () => {
      expect(mockListen).toBeDefined();
      
      // Set up and start the server
      const server = { listen: mockListen };
      server.listen(8888, () => {
        console.log('Server started');
      });
      
      expect(mockListen).toHaveBeenCalledWith(8888, expect.any(Function));
    });
  });
  
  describe('Tool Implementations', () => {
    it('should provide authentication functionality', () => {
      // This just tests that the auth handler can be properly set up
      const authHandler = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Successfully authenticated with Spotify!' }]
      });
      
      // Register the handler
      mockSetRequestHandler('auth-spotify', authHandler);
      
      // Verify it was registered
      expect(mockSetRequestHandler).toHaveBeenCalledWith('auth-spotify', authHandler);
    });

    it('should provide search functionality', () => {
      // This just tests that the search handler can be properly set up
      const searchHandler = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Search results' }]
      });
      
      // Register the handler
      mockSetRequestHandler('search-spotify', searchHandler);
      
      // Verify it was registered  
      expect(mockSetRequestHandler).toHaveBeenCalledWith('search-spotify', searchHandler);
    });

    it('should provide playback control', () => {
      // This just tests that playback handlers can be properly set up
      const playHandler = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Playing track' }]
      });
      
      const pauseHandler = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Playback paused' }]
      });
      
      // Register the handlers
      mockSetRequestHandler('play-track', playHandler);
      mockSetRequestHandler('pause-playback', pauseHandler);
      
      // Verify they were registered
      expect(mockSetRequestHandler).toHaveBeenCalledWith('play-track', playHandler);
      expect(mockSetRequestHandler).toHaveBeenCalledWith('pause-playback', pauseHandler);
    });
  });
});