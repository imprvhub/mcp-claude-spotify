// Type definitions to improve Jest mock type compatibility

// Extend Jest's Mock to accept any parameters
declare namespace jest {
  interface Mock<T extends (...args: any[]) => any> {
    mockResolvedValueOnce(value: any): this;
    mockRejectedValueOnce(value: any): this;
    mockImplementation(fn: (...args: any[]) => any): this;
    mockReturnValue(value: any): this;
    mockReturnThis(): this;
  }
}

// Utility types for mocking Axios
declare global {
  namespace jest {
    interface MockAxios extends jest.Mock {
      post: jest.Mock;
      get: jest.Mock;
      put: jest.Mock;
      delete: jest.Mock;
      patch: jest.Mock;
      create: jest.Mock;
      defaults: {
        headers: {
          common: Record<string, string>;
        };
      };
    }
  }
}

// Export to make this a module
export {};