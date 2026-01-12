/**
 * Environment Validation Script
 *
 * Validates that all required environment variables are set
 * Run with: node src/scripts/validateEnv.js
 */

const logger = require('../utils/logger');

// Required environment variables
const REQUIRED_ENV_VARS = [
  'MONGODB_URI',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET'
];

// Optional but recommended environment variables
const RECOMMENDED_ENV_VARS = [
  'NODE_ENV',
  'PORT',
  'ALLOWED_ORIGINS',
  'SUPERADMIN_EMAIL',
  'SUPERADMIN_PASSWORD'
];

// Environment-specific requirements
const PRODUCTION_REQUIRED = [
  'NODE_ENV',
  'ALLOWED_ORIGINS'
];

function validateEnv() {
  console.log('\n🔍 Validating Environment Configuration...\n');

  let hasErrors = false;
  let hasWarnings = false;

  // Check required variables
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ REQUIRED VARIABLES:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  REQUIRED_ENV_VARS.forEach(varName => {
    const value = process.env[varName];
    if (!value) {
      console.log(`❌ ${varName}: MISSING`);
      hasErrors = true;
    } else {
      // Mask sensitive values
      const displayValue = varName.includes('SECRET') || varName.includes('PASSWORD')
        ? '***' + value.slice(-4)
        : value.length > 50
          ? value.slice(0, 50) + '...'
          : value;
      console.log(`✅ ${varName}: ${displayValue}`);
    }
  });

  // Check recommended variables
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  RECOMMENDED VARIABLES:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  RECOMMENDED_ENV_VARS.forEach(varName => {
    const value = process.env[varName];
    if (!value) {
      console.log(`⚠️  ${varName}: NOT SET (using default)`);
      hasWarnings = true;
    } else {
      const displayValue = varName.includes('PASSWORD')
        ? '***' + value.slice(-4)
        : value;
      console.log(`✅ ${varName}: ${displayValue}`);
    }
  });

  // Production-specific checks
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🏭 PRODUCTION ENVIRONMENT CHECKS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    PRODUCTION_REQUIRED.forEach(varName => {
      const value = process.env[varName];
      if (!value) {
        console.log(`❌ ${varName}: REQUIRED IN PRODUCTION`);
        hasErrors = true;
      }
    });

    // Check JWT secrets are strong
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret && jwtSecret.length < 32) {
      console.log('⚠️  JWT_SECRET: Should be at least 32 characters in production');
      hasWarnings = true;
    }

    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
    if (jwtRefreshSecret && jwtRefreshSecret.length < 32) {
      console.log('⚠️  JWT_REFRESH_SECRET: Should be at least 32 characters in production');
      hasWarnings = true;
    }

    // Check ALLOWED_ORIGINS is not wildcard
    const allowedOrigins = process.env.ALLOWED_ORIGINS;
    if (allowedOrigins && allowedOrigins.includes('*')) {
      console.log('❌ ALLOWED_ORIGINS: Should not contain wildcards in production');
      hasErrors = true;
    }

    if (!hasErrors && !hasWarnings) {
      console.log('✅ All production checks passed');
    }
  }

  // Security checks
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔒 SECURITY CHECKS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check if using default passwords
  if (process.env.SUPERADMIN_PASSWORD === 'SuperAdmin123!') {
    console.log('⚠️  Using default SUPERADMIN_PASSWORD - change in production!');
    if (isProduction) {
      hasErrors = true;
    } else {
      hasWarnings = true;
    }
  }

  // Check MongoDB URI is not localhost in production
  const mongoUri = process.env.MONGODB_URI;
  if (isProduction && mongoUri && (mongoUri.includes('localhost') || mongoUri.includes('127.0.0.1'))) {
    console.log('❌ MONGODB_URI: Should not use localhost in production');
    hasErrors = true;
  }

  // Check if JWT secrets are the same
  if (process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
    console.log('⚠️  JWT_SECRET and JWT_REFRESH_SECRET should be different');
    hasWarnings = true;
  }

  if (!hasErrors && !hasWarnings) {
    console.log('✅ All security checks passed');
  }

  // Configuration summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 CONFIGURATION SUMMARY:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Port: ${process.env.PORT || '5000'}`);
  console.log(`Database: ${mongoUri ? 'Configured' : 'NOT CONFIGURED'}`);
  console.log(`CORS Origins: ${process.env.ALLOWED_ORIGINS || 'localhost (default)'}`);

  // Final result
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (hasErrors) {
    console.log('❌ VALIDATION FAILED');
    console.log('   Please fix the errors above before running the application.\n');
    logger.error('Environment validation failed');
    process.exit(1);
  } else if (hasWarnings) {
    console.log('⚠️  VALIDATION PASSED WITH WARNINGS');
    console.log('   Application can run, but consider addressing warnings.\n');
    logger.warn('Environment validation passed with warnings');
    process.exit(0);
  } else {
    console.log('✅ VALIDATION PASSED');
    console.log('   All environment variables are properly configured.\n');
    logger.info('Environment validation passed');
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  validateEnv();
}

module.exports = validateEnv;
