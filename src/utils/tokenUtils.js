const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { JWT_SECRETS } = require('../config/env');
const { TOKEN_TYPES, TOKEN_EXPIRATION } = require('../constants');
const RefreshToken = require('../models/RefreshToken');

/**
 * SECURITY FIX: JWT Key Rotation Support
 *
 * This implementation supports rotating JWT secrets without invalidating existing tokens.
 * - New tokens are signed with the current active key (kid: 'current')
 * - Token verification tries current key first, then falls back to legacy keys
 * - Each token includes a 'kid' (key ID) in the header for efficient verification
 */

const generateAccessToken = (userId, role) => {
  const signingKey = JWT_SECRETS.getSigningKey();

  if (!signingKey) {
    throw new Error('No active JWT signing key found');
  }

  // SECURITY FIX (CRITICAL): Generate unique JTI for token blacklist support
  // This allows us to revoke individual access tokens after logout
  const jti = crypto.randomBytes(16).toString('hex');

  // SECURITY: Include kid (key ID) in JWT header for key rotation support
  return jwt.sign(
    {
      id: userId,
      role,
      type: TOKEN_TYPES.ACCESS,
      jti // JWT ID for revocation tracking
    },
    signingKey.secret,
    {
      expiresIn: TOKEN_EXPIRATION.ACCESS,
      header: {
        kid: signingKey.kid // Key ID for identifying which key was used
      }
    }
  );
};

const generateRefreshToken = async (userId, deviceInfo = {}) => {
  const token = crypto.randomBytes(64).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await RefreshToken.create({
    token,
    user: userId,
    expiresAt,
    deviceInfo
  });

  return token;
};

const generateTokenPair = async (userId, role, deviceInfo = {}) => {
  const accessToken = generateAccessToken(userId, role);
  const refreshToken = await generateRefreshToken(userId, deviceInfo);

  return {
    accessToken,
    refreshToken
  };
};

/**
 * SECURITY FIX: Multi-key verification for seamless key rotation
 *
 * Verification strategy:
 * 1. Decode token header to extract kid (if present)
 * 2. If kid exists, try to verify with that specific key
 * 3. If no kid or verification fails, try all available keys (current + legacy)
 * 4. This allows tokens signed with old keys to remain valid during rotation
 */
const verifyAccessToken = (token) => {
  try {
    // First, decode header to check for kid (key ID)
    const decoded = jwt.decode(token, { complete: true });

    if (!decoded) {
      return null;
    }

    const kid = decoded.header?.kid;
    const verificationKeys = JWT_SECRETS.getVerificationKeys();

    // Strategy 1: If token has kid, try that specific key first
    if (kid) {
      const targetKey = verificationKeys.find(k => k.kid === kid);
      if (targetKey) {
        try {
          const verified = jwt.verify(token, targetKey.secret);
          if (verified.type !== TOKEN_TYPES.ACCESS) {
            return null;
          }
          return verified;
        } catch (error) {
          // Key-specific verification failed, fall through to try all keys
        }
      }
    }

    // Strategy 2: Try all keys (for tokens without kid or if kid-specific verification failed)
    for (const key of verificationKeys) {
      try {
        const verified = jwt.verify(token, key.secret);
        if (verified.type === TOKEN_TYPES.ACCESS) {
          return verified;
        }
      } catch (error) {
        // Try next key
        continue;
      }
    }

    // All verification attempts failed
    return null;
  } catch (error) {
    return null;
  }
};

const verifyRefreshToken = async (token) => {
  try {
    const refreshToken = await RefreshToken.findOne({ token })
      .populate('user', 'role isActive');

    if (!refreshToken || !refreshToken.isValid()) {
      return null;
    }

    return refreshToken;
  } catch (error) {
    return null;
  }
};

const revokeRefreshToken = async (token) => {
  await RefreshToken.updateOne({ token }, { isRevoked: true });
};

const revokeAllUserTokens = async (userId) => {
  await RefreshToken.updateMany({ user: userId }, { isRevoked: true });
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens
};
