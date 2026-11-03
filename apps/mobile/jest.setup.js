/* eslint-env jest */
// ---- Reanimated: official Jest helpers (mocks worklets, layout animations, timing) ----
require('react-native-reanimated').setUpTests();

// ---- Keychain: in-memory secure store ----
jest.mock('react-native-keychain', () => {
  const store = new Map();
  return {
    __store: store,
    setGenericPassword: jest.fn(async (username, password, opts = {}) => {
      store.set(opts.service || 'default', {username, password, service: opts.service});
      return true;
    }),
    getGenericPassword: jest.fn(async (opts = {}) => store.get(opts.service || 'default') || false),
    resetGenericPassword: jest.fn(async (opts = {}) => {
      store.delete(opts.service || 'default');
      return true;
    }),
  };
});

// ---- Safe area: deterministic insets ----
jest.mock('react-native-safe-area-context', () => {
  const mock = require('react-native-safe-area-context/jest/mock').default;
  return mock;
});

// ---- WebSocket: inert mock so live-tick hooks don't open sockets in tests ----
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    MockWebSocket.instances.push(this);
  }
  send() {}
  close() {
    this.readyState = 3;
  }
}
MockWebSocket.instances = [];
global.WebSocket = MockWebSocket;
