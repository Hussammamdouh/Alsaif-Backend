module.exports = {
  testEnvironment: 'node',
  coveragePathIgnorePatterns: ['/node_modules/'],
  testTimeout: 30000,
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/config/**',
    '!src/app.js'
  ],
  // TESTING FIX: Handle ES modules in jsdom dependencies
  transformIgnorePatterns: [
    'node_modules/(?!(parse5|entities)/)'
  ]
};
