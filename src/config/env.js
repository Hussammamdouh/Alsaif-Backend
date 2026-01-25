require('dotenv').config();

/**
 * SECURITY: JWT Key Rotation Support
 *
 * To rotate JWT secrets without invalidating existing tokens:
 * 1. Add new secret to JWT_SECRET_CURRENT
 * 2. Move old secret(s) to JWT_SECRET_LEGACY (comma-separated)
 * 3. After grace period, remove old secrets from legacy list
 *
 * Example rotation:
 * Before: JWT_SECRET_CURRENT=key1
 * During: JWT_SECRET_CURRENT=key2, JWT_SECRET_LEGACY=key1
 * After:  JWT_SECRET_CURRENT=key2
 */

// Parse JWT secrets with key rotation support
function parseJWTSecrets() {
  const current = process.env.JWT_SECRET_CURRENT || process.env.JWT_SECRET;
  const legacy = process.env.JWT_SECRET_LEGACY || '';

  if (!current) {
    throw new Error('JWT_SECRET_CURRENT or JWT_SECRET must be set in environment variables');
  }

  // Build key registry with key IDs (kid)
  const keys = [
    {
      kid: 'current',
      secret: current,
      active: true // Can be used for signing
    }
  ];

  // Add legacy keys (only for verification, not signing)
  if (legacy) {
    const legacyKeys = legacy.split(',').map(s => s.trim()).filter(Boolean);
    legacyKeys.forEach((secret, index) => {
      keys.push({
        kid: `legacy-${index + 1}`,
        secret,
        active: false // Cannot be used for signing
      });
    });
  }

  return {
    current: current,
    all: keys,
    // Get signing key (current active key)
    getSigningKey: () => keys.find(k => k.active),
    // Get all verification keys (current + legacy)
    getVerificationKeys: () => keys
  };
}

module.exports = {
  PORT: process.env.PORT || 5000,
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET: process.env.JWT_SECRET, // Deprecated: kept for backward compatibility
  JWT_SECRETS: parseJWTSecrets(),
  JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
  NODE_ENV: process.env.NODE_ENV || 'development',

  // SMTP Email Configuration (Nodemailer)
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT) || 587,
  SMTP_SECURE: process.env.SMTP_SECURE || 'false', // true for 465, false for other ports
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASSWORD: process.env.SMTP_PASSWORD,
  SMTP_FROM_NAME: process.env.SMTP_FROM_NAME || 'ElSaif Stock Insights',
  SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,

  // Web Push Notifications (VAPID)
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  VAPID_EMAIL: process.env.VAPID_EMAIL || process.env.SMTP_FROM_EMAIL || 'noreply@elsaif.com',

  // Stripe Configuration
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000'
};
