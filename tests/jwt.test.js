const { generateToken, verifyToken } = require('../src/utils/jwtUtils');
const { JWT_SECRET } = require('../src/config/env');

describe('JWT Utilities Tests', () => {
  const mockUserId = '507f1f77bcf86cd799439011';
  const mockRole = 'user';

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const token = generateToken(mockUserId, mockRole);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include user id and role in token payload', () => {
      const token = generateToken(mockUserId, mockRole);
      const decoded = verifyToken(token);

      expect(decoded).toBeDefined();
      expect(decoded.id).toBe(mockUserId);
      expect(decoded.role).toBe(mockRole);
    });

    it('should generate different tokens for different users', () => {
      const token1 = generateToken(mockUserId, 'user');
      const token2 = generateToken('507f1f77bcf86cd799439012', 'admin');

      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyToken', () => {
    it('should verify and decode a valid token', () => {
      const token = generateToken(mockUserId, mockRole);
      const decoded = verifyToken(token);

      expect(decoded).toBeDefined();
      expect(decoded.id).toBe(mockUserId);
      expect(decoded.role).toBe(mockRole);
    });

    it('should return null for invalid token', () => {
      const invalidToken = 'invalid.token.here';
      const decoded = verifyToken(invalidToken);

      expect(decoded).toBeNull();
    });

    it('should return null for empty token', () => {
      const decoded = verifyToken('');

      expect(decoded).toBeNull();
    });

    it('should return null for malformed token', () => {
      const malformedToken = 'not-a-jwt-token';
      const decoded = verifyToken(malformedToken);

      expect(decoded).toBeNull();
    });
  });
});
