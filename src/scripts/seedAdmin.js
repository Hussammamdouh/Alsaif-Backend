/**
 * Seed Admin Script
 *
 * Creates admin users for testing and development
 * Run with: node src/scripts/seedAdmin.js
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const connectDB = require('../config/database');
const logger = require('../utils/logger');
const AuditLogger = require('../utils/auditLogger');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'alsaifanalysis@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AlsaifAnalysis$0';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Alsaif Admin';

async function seedAdmin() {
  try {
    // Connect to database
    await connectDB();
    logger.info('Connected to database');

    // Check if admin already exists
    const existingAdmin = await User.findOne({
      email: ADMIN_EMAIL
    });

    if (existingAdmin) {
      logger.warn(`Admin already exists: ${existingAdmin.email}`);
      console.log('\n✅ Admin already exists:');
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Name: ${existingAdmin.name}`);
      console.log(`   Role: ${existingAdmin.role}`);
      console.log(`   Created: ${existingAdmin.createdAt}`);
      process.exit(0);
    }

    // Create admin user
    const admin = await User.create({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: 'admin',
      isActive: true
    });

    // Create audit log for admin creation (seed script context)
    await AuditLogger.log({
      actor: {
        userId: admin._id,
        email: 'system',
        role: 'system',
        ip: '127.0.0.1',
        userAgent: 'seed-script'
      },
      action: 'ADMIN_CREATED',
      target: {
        resourceType: 'User',
        resourceId: admin._id,
        resourceName: admin.email
      },
      changes: {
        after: {
          name: admin.name,
          email: admin.email,
          role: admin.role
        }
      },
      metadata: {
        severity: 'critical',
        notes: 'Admin created via seed script'
      },
      status: 'success'
    });

    console.log('\n✅ Admin created successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email:', admin.email);
    console.log('👤 Name:', admin.name);
    console.log('🔑 Password:', ADMIN_PASSWORD);
    console.log('🎭 Role:', admin.role);
    console.log('🆔 ID:', admin._id);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('⚠️  IMPORTANT: Change the password after first login!\n');
    console.log('You can now login with these credentials.');

    logger.info(`Admin created: ${admin.email}`);

  } catch (error) {
    logger.error('Error seeding admin:', error);
    console.error('\n❌ Error creating admin:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    logger.info('Database connection closed');
  }
}

// Run if called directly
if (require.main === module) {
  console.log('\n🌱 Seeding Admin...\n');
  seedAdmin();
}

module.exports = seedAdmin;
