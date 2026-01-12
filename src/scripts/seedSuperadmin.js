/**
 * Seed Superadmin Script
 *
 * Creates a superadmin user for initial system setup
 * Run with: node src/scripts/seedSuperadmin.js
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const { connectDB } = require('../config/database');
const logger = require('../utils/logger');

const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'superadmin@elsaif.com';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'SuperAdmin123!';
const SUPERADMIN_NAME = process.env.SUPERADMIN_NAME || 'Super Admin';

async function seedSuperadmin() {
  try {
    // Connect to database
    await connectDB();
    logger.info('Connected to database');

    // Check if superadmin already exists
    const existingSuperadmin = await User.findOne({
      role: 'superadmin',
      email: SUPERADMIN_EMAIL
    });

    if (existingSuperadmin) {
      logger.warn(`Superadmin already exists: ${existingSuperadmin.email}`);
      console.log('\n✅ Superadmin already exists:');
      console.log(`   Email: ${existingSuperadmin.email}`);
      console.log(`   Name: ${existingSuperadmin.name}`);
      console.log(`   Created: ${existingSuperadmin.createdAt}`);
      console.log('\nℹ️  If you need to reset the password, delete this user first.');
      process.exit(0);
    }

    // Create superadmin user
    const superadmin = await User.create({
      name: SUPERADMIN_NAME,
      email: SUPERADMIN_EMAIL,
      password: SUPERADMIN_PASSWORD,
      role: 'superadmin',
      isActive: true
    });

    console.log('\n✅ Superadmin created successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email:', superadmin.email);
    console.log('👤 Name:', superadmin.name);
    console.log('🔑 Password:', SUPERADMIN_PASSWORD);
    console.log('🎭 Role:', superadmin.role);
    console.log('🆔 ID:', superadmin._id);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('⚠️  IMPORTANT: Change the password after first login!\n');
    console.log('You can now login with these credentials.');

    logger.info(`Superadmin created: ${superadmin.email}`);

  } catch (error) {
    logger.error('Error seeding superadmin:', error);
    console.error('\n❌ Error creating superadmin:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    logger.info('Database connection closed');
  }
}

// Run if called directly
if (require.main === module) {
  console.log('\n🌱 Seeding Superadmin...\n');
  seedSuperadmin();
}

module.exports = seedSuperadmin;
