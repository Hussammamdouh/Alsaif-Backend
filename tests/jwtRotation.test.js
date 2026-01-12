/**
 * JWT Key Rotation Tests
 *
 * Tests the security fix for CRIT-003: JWT Secret Key Rotation
 * Verifies that:
 * 1. Tokens are signed with current key and include kid header
 * 2. Tokens signed with legacy keys can still be verified
 * 3. Multiple legacy keys are supported
 * 4. Invalid tokens are rejected
 */

const jwt = require('jsonwebtoken');
const { generateAccessToken, verifyAccessToken } = require('../src/utils/tokenUtils');
const { TOKEN_TYPES } = require('../src/constants');

// Mock environment configuration with multiple keys
jest.mock('../src/config/env', () => {
  const mockKeys = [
    { kid: 'current', secret: 'current-secret-key-v3-minimum-32-characters', active: true },
    { kid: 'legacy-1', secret: 'legacy-secret-key-v2-minimum-32-characters', active: false },
    { kid: 'legacy-2', secret: 'legacy-secret-key-v1-minimum-32-characters', active: false }
  ];

  return {
    PORT: 5000,
    MONGODB_URI: 'mongodb://localhost:27017/test',
    JWT_SECRET: 'current-secret-key-v3-minimum-32-characters',
    JWT_SECRETS: {
      current: 'current-secret-key-v3-minimum-32-characters',
      all: mockKeys,
      getSigningKey: () => mockKeys.find(k => k.active),
      getVerificationKeys: () => mockKeys
    },
    NODE_ENV: 'test'
  };
});

describe('JWT Key Rotation Security Fix (CRIT-003)', () => {
  const testUserId = 'user123';
  const testRole = 'user';

  describe('Token Generation with kid Header', () => {
    test('should generate token signed with current key', () => {
      const token = generateAccessToken(testUserId, testRole);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      // Decode without verification to check structure
      const decoded = jwt.decode(token, { complete: true });

      expect(decoded.header.kid).toBe('current');
      expect(decoded.payload.id).toBe(testUserId);
      expect(decoded.payload.role).toBe(testRole);
      expect(decoded.payload.type).toBe(TOKEN_TYPES.ACCESS);
    });

    test('should include kid in JWT header for key identification', () => {
      const token = generateAccessToken(testUserId, testRole);
      const decoded = jwt.decode(token, { complete: true });

      expect(decoded.header).toHaveProperty('kid');
      expect(decoded.header.kid).toBe('current');
    });
  });

  describe('Multi-Key Verification (Key Rotation Support)', () => {
    test('should verify token signed with current key', () => {
      const token = generateAccessToken(testUserId, testRole);
      const verified = verifyAccessToken(token);

      expect(verified).toBeTruthy();
      expect(verified.id).toBe(testUserId);
      expect(verified.role).toBe(testRole);
      expect(verified.type).toBe(TOKEN_TYPES.ACCESS);
    });

    test('should verify token signed with legacy key (v2)', () => {
      // Simulate a token signed with old key
      const legacyToken = jwt.sign(
        { id: testUserId, role: testRole, type: TOKEN_TYPES.ACCESS },
        'legacy-secret-key-v2-minimum-32-characters',
        {
          expiresIn: '15m',
          header: { kid: 'legacy-1' }
        }
      );

      const verified = verifyAccessToken(legacyToken);

      expect(verified).toBeTruthy();
      expect(verified.id).toBe(testUserId);
      expect(verified.role).toBe(testRole);
    });

    test('should verify token signed with legacy key (v1)', () => {
      // Simulate a token signed with even older key
      const legacyToken = jwt.sign(
        { id: testUserId, role: testRole, type: TOKEN_TYPES.ACCESS },
        'legacy-secret-key-v1-minimum-32-characters',
        {
          expiresIn: '15m',
          header: { kid: 'legacy-2' }
        }
      );

      const verified = verifyAccessToken(legacyToken);

      expect(verified).toBeTruthy();
      expect(verified.id).toBe(testUserId);
    });

    test('should verify token without kid header (backward compatibility)', () => {
      // Simulate old token without kid header (pre-rotation implementation)
      const oldToken = jwt.sign(
        { id: testUserId, role: testRole, type: TOKEN_TYPES.ACCESS },
        'current-secret-key-v3-minimum-32-characters',
        { expiresIn: '15m' }
        // No kid header
      );

      const verified = verifyAccessToken(oldToken);

      expect(verified).toBeTruthy();
      expect(verified.id).toBe(testUserId);
    });
  });

  describe('Security: Invalid Token Rejection', () => {
    test('should reject token signed with unknown key', () => {
      const invalidToken = jwt.sign(
        { id: testUserId, role: testRole, type: TOKEN_TYPES.ACCESS },
        'completely-wrong-secret-key-not-in-rotation',
        { expiresIn: '15m' }
      );

      const verified = verifyAccessToken(invalidToken);

      expect(verified).toBeNull();
    });

    test('should reject malformed token', () => {
      const verified = verifyAccessToken('malformed.token.string');

      expect(verified).toBeNull();
    });

    test('should reject expired token', () => {
      const expiredToken = jwt.sign(
        { id: testUserId, role: testRole, type: TOKEN_TYPES.ACCESS },
        'current-secret-key-v3-minimum-32-characters',
        {
          expiresIn: '-1h', // Already expired
          header: { kid: 'current' }
        }
      );

      const verified = verifyAccessToken(expiredToken);

      expect(verified).toBeNull();
    });

    test('should reject token with wrong type', () => {
      const wrongTypeToken = jwt.sign(
        { id: testUserId, role: testRole, type: TOKEN_TYPES.REFRESH }, // Wrong type
        'current-secret-key-v3-minimum-32-characters',
        {
          expiresIn: '15m',
          header: { kid: 'current' }
        }
      );

      const verified = verifyAccessToken(wrongTypeToken);

      expect(verified).toBeNull();
    });
  });

  describe('Key Rotation Workflow Simulation', () => {
    test('should handle graceful key rotation scenario', () => {
      // Scenario: System rotates from key v2 to v3
      // Old tokens (v2) should still work during grace period

      // Step 1: User has old token from before rotation
      const oldToken = jwt.sign(
        { id: testUserId, role: testRole, type: TOKEN_TYPES.ACCESS },
        'legacy-secret-key-v2-minimum-32-characters',
        {
          expiresIn: '15m',
          header: { kid: 'legacy-1' }
        }
      );

      // Step 2: New token issued with current key
      const newToken = generateAccessToken(testUserId, testRole);

      // Step 3: Both tokens should be valid during rotation
      const oldVerified = verifyAccessToken(oldToken);
      const newVerified = verifyAccessToken(newToken);

      expect(oldVerified).toBeTruthy();
      expect(newVerified).toBeTruthy();
      expect(oldVerified.id).toBe(testUserId);
      expect(newVerified.id).toBe(testUserId);
    });
  });
});
