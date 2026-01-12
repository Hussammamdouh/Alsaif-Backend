/**
 * Cleanup Script
 *
 * Removes test data from the database
 * Run with: node src/scripts/cleanup.js
 *
 * DANGER: This will delete data! Use with caution.
 */

const mongoose = require('mongoose');
const readline = require('readline');
const { connectDB } = require('../config/database');
const logger = require('../utils/logger');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Insight = require('../models/Insight');
const AccountSecurity = require('../models/AccountSecurity');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function cleanup() {
  console.log('\n🧹 Database Cleanup Utility\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  WARNING: This will DELETE data!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Connect to database
    await connectDB();
    logger.info('Connected to database');

    // Get current counts
    const userCount = await User.countDocuments();
    const chatCount = await Chat.countDocuments();
    const messageCount = await Message.countDocuments();
    const insightCount = await Insight.countDocuments();

    console.log('Current database state:');
    console.log(`  Users: ${userCount}`);
    console.log(`  Chats: ${chatCount}`);
    console.log(`  Messages: ${messageCount}`);
    console.log(`  Insights: ${insightCount}\n`);

    // Ask what to clean
    console.log('What would you like to clean?');
    console.log('  1. Test data only (users with @test.com emails)');
    console.log('  2. All regular users (keeps admins and superadmins)');
    console.log('  3. All chats and messages');
    console.log('  4. All insights');
    console.log('  5. Everything except superadmins');
    console.log('  6. Cancel\n');

    const choice = await question('Enter your choice (1-6): ');

    let deleteQuery = {};
    let collections = [];

    switch (choice.trim()) {
      case '1':
        console.log('\n🎯 Cleaning test data...\n');
        // Delete test users
        const testUserResult = await User.deleteMany({ email: /test\.com$/ });
        console.log(`✅ Deleted ${testUserResult.deletedCount} test users`);

        // Delete test insights
        const testAdmin = await User.findOne({ email: /testadmin@test\.com/ });
        if (testAdmin) {
          const testInsightResult = await Insight.deleteMany({ author: testAdmin._id });
          console.log(`✅ Deleted ${testInsightResult.deletedCount} test insights`);
        }
        break;

      case '2':
        const confirm2 = await question('\n⚠️  Delete ALL regular users? (yes/no): ');
        if (confirm2.toLowerCase() === 'yes') {
          const result = await User.deleteMany({ role: 'user' });
          console.log(`✅ Deleted ${result.deletedCount} regular users`);
        } else {
          console.log('❌ Cancelled');
        }
        break;

      case '3':
        const confirm3 = await question('\n⚠️  Delete ALL chats and messages? (yes/no): ');
        if (confirm3.toLowerCase() === 'yes') {
          const chatResult = await Chat.deleteMany({});
          const msgResult = await Message.deleteMany({});
          console.log(`✅ Deleted ${chatResult.deletedCount} chats`);
          console.log(`✅ Deleted ${msgResult.deletedCount} messages`);
        } else {
          console.log('❌ Cancelled');
        }
        break;

      case '4':
        const confirm4 = await question('\n⚠️  Delete ALL insights? (yes/no): ');
        if (confirm4.toLowerCase() === 'yes') {
          const result = await Insight.deleteMany({});
          console.log(`✅ Deleted ${result.deletedCount} insights`);
        } else {
          console.log('❌ Cancelled');
        }
        break;

      case '5':
        const confirm5 = await question('\n🚨 Delete EVERYTHING except superadmins? (type "DELETE ALL" to confirm): ');
        if (confirm5 === 'DELETE ALL') {
          const userResult = await User.deleteMany({ role: { $ne: 'superadmin' } });
          const chatResult = await Chat.deleteMany({});
          const msgResult = await Message.deleteMany({});
          const insightResult = await Insight.deleteMany({});
          const securityResult = await AccountSecurity.deleteMany({});

          console.log('\n✅ Cleanup complete:');
          console.log(`   Users deleted: ${userResult.deletedCount}`);
          console.log(`   Chats deleted: ${chatResult.deletedCount}`);
          console.log(`   Messages deleted: ${msgResult.deletedCount}`);
          console.log(`   Insights deleted: ${insightResult.deletedCount}`);
          console.log(`   Security records deleted: ${securityResult.deletedCount}`);
        } else {
          console.log('❌ Cancelled - did not type "DELETE ALL"');
        }
        break;

      case '6':
        console.log('❌ Cleanup cancelled');
        break;

      default:
        console.log('❌ Invalid choice');
    }

    // Show final counts
    if (choice !== '6') {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Final database state:');
      console.log(`  Users: ${await User.countDocuments()}`);
      console.log(`  Chats: ${await Chat.countDocuments()}`);
      console.log(`  Messages: ${await Message.countDocuments()}`);
      console.log(`  Insights: ${await Insight.countDocuments()}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    logger.info('Cleanup completed');

  } catch (error) {
    logger.error('Cleanup failed:', error);
    console.error('\n❌ Cleanup failed:', error.message);
    process.exit(1);
  } finally {
    rl.close();
    await mongoose.connection.close();
    logger.info('Database connection closed');
  }
}

// Run if called directly
if (require.main === module) {
  cleanup();
}

module.exports = cleanup;
