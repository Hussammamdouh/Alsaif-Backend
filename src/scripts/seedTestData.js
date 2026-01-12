/**
 * Seed Test Data Script
 *
 * Creates sample users, insights, and chats for development/testing
 * Run with: node src/scripts/seedTestData.js
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const Insight = require('../models/Insight');
const Chat = require('../models/Chat');
const { connectDB } = require('../config/database');
const logger = require('../utils/logger');

const NUM_USERS = parseInt(process.env.SEED_USERS) || 20;
const NUM_INSIGHTS = parseInt(process.env.SEED_INSIGHTS) || 30;
const NUM_CHATS = parseInt(process.env.SEED_CHATS) || 10;

// Sample data generators
const generateUsers = (count) => {
  return Array.from({ length: count }, (_, i) => ({
    name: `Test User ${i + 1}`,
    email: `user${i + 1}@test.com`,
    password: 'Test123!',
    role: 'user',
    isActive: Math.random() > 0.1 // 90% active
  }));
};

const generateInsights = (adminId, count) => {
  const categories = [
    'market_analysis',
    'trading_tips',
    'technical_analysis',
    'fundamental_analysis',
    'risk_management',
    'strategy',
    'news',
    'education'
  ];

  const statuses = ['draft', 'published', 'archived', 'under_review'];

  return Array.from({ length: count }, (_, i) => ({
    title: `Insight Article ${i + 1}: ${categories[i % categories.length].replace('_', ' ')}`,
    content: `This is a detailed analysis of ${categories[i % categories.length]}. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.`,
    excerpt: `A comprehensive guide to ${categories[i % categories.length].replace('_', ' ')}.`,
    type: i % 3 === 0 ? 'premium' : 'free',
    category: categories[i % categories.length],
    tags: ['analysis', 'trading', categories[i % categories.length]],
    author: adminId,
    status: statuses[i % statuses.length],
    featured: i % 5 === 0,
    publishedAt: i % 4 !== 3 ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) : undefined,
    views: Math.floor(Math.random() * 1000),
    likes: Math.floor(Math.random() * 100)
  }));
};

async function seedTestData() {
  let createdUsers = [];
  let createdInsights = [];
  let createdChats = [];

  try {
    // Connect to database
    await connectDB();
    logger.info('Connected to database');

    console.log('\n🌱 Seeding Test Data...\n');

    // Check if test data already exists
    const existingTestUser = await User.findOne({ email: 'user1@test.com' });
    if (existingTestUser) {
      console.log('⚠️  Test data already exists. Skipping seed.');
      console.log('   To reseed, delete existing test data first.');
      process.exit(0);
    }

    // Get or create admin for insights
    let admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      admin = await User.create({
        name: 'Test Admin',
        email: 'testadmin@test.com',
        password: 'Admin123!',
        role: 'admin',
        isActive: true
      });
      console.log('✅ Created test admin');
    }

    // 1. Create users
    console.log(`\n📝 Creating ${NUM_USERS} test users...`);
    const usersData = generateUsers(NUM_USERS);
    createdUsers = await User.insertMany(usersData);
    console.log(`✅ Created ${createdUsers.length} users`);

    // 2. Create insights
    console.log(`\n📰 Creating ${NUM_INSIGHTS} test insights...`);
    const insightsData = generateInsights(admin._id, NUM_INSIGHTS);
    createdInsights = await Insight.insertMany(insightsData);
    console.log(`✅ Created ${createdInsights.length} insights`);

    // 3. Create chats
    console.log(`\n💬 Creating ${NUM_CHATS} test chats...`);
    for (let i = 0; i < NUM_CHATS; i++) {
      const isGroup = i % 3 === 0;
      const participantCount = isGroup ? Math.floor(Math.random() * 5) + 3 : 2;
      const participants = createdUsers
        .sort(() => Math.random() - 0.5)
        .slice(0, participantCount)
        .map((user, index) => ({
          user: user._id,
          permission: index === 0 ? 'admin' : 'member'
        }));

      const chat = await Chat.create({
        name: isGroup ? `Test Group Chat ${i + 1}` : undefined,
        type: isGroup ? 'group' : 'private',
        isPremium: Math.random() > 0.7,
        participants,
        createdBy: participants[0].user
      });

      createdChats.push(chat);
    }
    console.log(`✅ Created ${createdChats.length} chats`);

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Test Data Seeding Complete!\n');
    console.log('📊 Summary:');
    console.log(`   👥 Users: ${createdUsers.length}`);
    console.log(`   📰 Insights: ${createdInsights.length}`);
    console.log(`   💬 Chats: ${createdChats.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📋 Test Users:');
    console.log('   Email: user1@test.com to user' + NUM_USERS + '@test.com');
    console.log('   Password: Test123!\n');

    console.log('📋 Test Admin:');
    console.log('   Email:', admin.email);
    console.log('   Password: Admin123!\n');

    console.log('💡 Insight Breakdown:');
    const publishedCount = createdInsights.filter(i => i.status === 'published').length;
    const premiumCount = createdInsights.filter(i => i.type === 'premium').length;
    const featuredCount = createdInsights.filter(i => i.featured).length;
    console.log(`   Published: ${publishedCount}`);
    console.log(`   Premium: ${premiumCount}`);
    console.log(`   Featured: ${featuredCount}\n`);

    console.log('💬 Chat Breakdown:');
    const groupCount = createdChats.filter(c => c.type === 'group').length;
    const privateCount = createdChats.filter(c => c.type === 'private').length;
    console.log(`   Group Chats: ${groupCount}`);
    console.log(`   Private Chats: ${privateCount}\n`);

    logger.info('Test data seeded successfully');

  } catch (error) {
    logger.error('Error seeding test data:', error);
    console.error('\n❌ Error seeding test data:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    logger.info('Database connection closed');
  }
}

// Run if called directly
if (require.main === module) {
  seedTestData();
}

module.exports = seedTestData;
