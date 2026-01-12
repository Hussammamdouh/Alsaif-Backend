/**
 * Seed Chat Message Script
 *
 * Creates a test user (Sarah Johnson) and sends a message to hossammamdouh05@gmail.com
 * Run with: node src/scripts/seedChatMessage.js
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const connectDB = require('../config/database');
const logger = require('../utils/logger');

const TARGET_USER_EMAIL = 'hossammamdouh05@gmail.com';
const TEST_USER = {
  name: 'Sarah Johnson',
  email: 'sarah.johnson@test.com',
  password: 'Sarah123!',
  role: 'user',
  isActive: true
};

const TEST_MESSAGES = [
  {
    content: 'Hey! I saw your recent analysis on the market trends. Really insightful!',
    delay: 0
  },
  {
    content: 'Do you think we might see a correction in tech stocks soon?',
    delay: 2000
  },
  {
    content: 'I\'ve been watching the RSI indicators and they\'re showing some interesting patterns.',
    delay: 4000
  }
];

async function seedChatMessage() {
  try {
    // Connect to database
    await connectDB();
    logger.info('Connected to database');

    console.log('\n💬 Seeding Chat Message Data...\n');

    // 1. Find target user
    console.log(`📝 Looking for target user: ${TARGET_USER_EMAIL}`);
    const targetUser = await User.findOne({ email: TARGET_USER_EMAIL });

    if (!targetUser) {
      console.error(`❌ Target user not found: ${TARGET_USER_EMAIL}`);
      console.log('   Please make sure the user exists first.');
      process.exit(1);
    }
    console.log(`✅ Found target user: ${targetUser.name}`);

    // 2. Create or find test user
    console.log(`\n📝 Looking for test user: ${TEST_USER.email}`);
    let testUser = await User.findOne({ email: TEST_USER.email });

    if (!testUser) {
      console.log('   Test user not found. Creating...');
      testUser = await User.create(TEST_USER);
      console.log(`✅ Created test user: ${testUser.name}`);
    } else {
      console.log(`✅ Test user already exists: ${testUser.name}`);
    }

    // 3. Create or find private chat between users
    console.log(`\n💬 Looking for existing chat between users...`);
    let chat = await Chat.findOne({
      type: 'private',
      'participants.user': { $all: [targetUser._id, testUser._id] }
    });

    if (!chat) {
      console.log('   Chat not found. Creating new private chat...');
      chat = await Chat.create({
        type: 'private',
        participants: [
          {
            user: testUser._id,
            permission: 'member'
          },
          {
            user: targetUser._id,
            permission: 'member'
          }
        ],
        createdBy: testUser._id
      });
      console.log(`✅ Created new private chat`);
    } else {
      console.log(`✅ Found existing chat`);
    }

    // 4. Send messages with delays to simulate real conversation
    console.log(`\n💬 Sending ${TEST_MESSAGES.length} messages...`);

    for (let i = 0; i < TEST_MESSAGES.length; i++) {
      const msgData = TEST_MESSAGES[i];

      // Wait for delay
      if (msgData.delay > 0) {
        await new Promise(resolve => setTimeout(resolve, msgData.delay));
      }

      const message = await Message.create({
        chat: chat._id,
        sender: testUser._id,
        content: msgData.content,
        status: 'sent'
      });

      // Update chat's lastMessage with embedded object
      chat.lastMessage = {
        content: msgData.content,
        sender: testUser._id,
        timestamp: new Date()
      };
      chat.updatedAt = new Date();
      await chat.save();

      console.log(`   ✅ Message ${i + 1}/${TEST_MESSAGES.length}: "${msgData.content.substring(0, 50)}${msgData.content.length > 50 ? '...' : ''}"`);
    }

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Chat Message Seeding Complete!\n');
    console.log('📊 Summary:');
    console.log(`   👤 Test User: ${testUser.name} (${testUser.email})`);
    console.log(`   👤 Target User: ${targetUser.name} (${targetUser.email})`);
    console.log(`   💬 Chat ID: ${chat._id}`);
    console.log(`   📨 Messages Sent: ${TEST_MESSAGES.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📋 Login Credentials:');
    console.log(`   Email: ${TEST_USER.email}`);
    console.log(`   Password: ${TEST_USER.password}\n`);

    console.log('💡 Next Steps:');
    console.log('   1. Login as hossammamdouh05@gmail.com to see the new messages');
    console.log('   2. Or login as sarah.johnson@test.com to send more messages');
    console.log('   3. Test the real-time WebSocket messaging\n');

    logger.info('Chat message seeded successfully');

  } catch (error) {
    logger.error('Error seeding chat message:', error);
    console.error('\n❌ Error seeding chat message:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    logger.info('Database connection closed');
  }
}

// Run if called directly
if (require.main === module) {
  seedChatMessage();
}

module.exports = seedChatMessage;
