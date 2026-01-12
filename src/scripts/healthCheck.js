/**
 * Database Health Check Script
 *
 * Checks database connectivity and collection status
 * Run with: node src/scripts/healthCheck.js
 */

const mongoose = require('mongoose');
const { connectDB } = require('../config/database');
const logger = require('../utils/logger');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const AuditLog = require('../models/AuditLog');
const AccountSecurity = require('../models/AccountSecurity');
const Insight = require('../models/Insight');

async function healthCheck() {
  console.log('\n🏥 Running Database Health Check...\n');

  try {
    // Connect to database
    console.log('📡 Connecting to database...');
    await connectDB();
    console.log('✅ Database connection successful\n');

    // Check database state
    const dbState = mongoose.connection.readyState;
    const stateNames = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    console.log(`Connection State: ${stateNames[dbState] || 'unknown'}`);
    console.log(`Database Name: ${mongoose.connection.name}`);
    console.log(`Host: ${mongoose.connection.host}`);
    console.log(`Port: ${mongoose.connection.port}\n`);

    // Check collections
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 COLLECTION STATISTICS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const collections = [
      { name: 'Users', model: User },
      { name: 'Chats', model: Chat },
      { name: 'Messages', model: Message },
      { name: 'Insights', model: Insight },
      { name: 'Audit Logs', model: AuditLog },
      { name: 'Account Security', model: AccountSecurity }
    ];

    const stats = [];

    for (const { name, model } of collections) {
      try {
        const count = await model.countDocuments();
        const collectionStats = await model.collection.stats();

        stats.push({
          name,
          count,
          size: (collectionStats.size / 1024).toFixed(2) + ' KB',
          avgSize: collectionStats.avgObjSize
            ? (collectionStats.avgObjSize / 1024).toFixed(2) + ' KB'
            : 'N/A',
          indexes: collectionStats.nindexes || 0
        });

        console.log(`✅ ${name}:`);
        console.log(`   Documents: ${count}`);
        console.log(`   Size: ${(collectionStats.size / 1024).toFixed(2)} KB`);
        console.log(`   Indexes: ${collectionStats.nindexes || 0}\n`);
      } catch (error) {
        console.log(`⚠️  ${name}: Error getting stats - ${error.message}\n`);
      }
    }

    // Check for critical data
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 CRITICAL DATA CHECKS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Check for superadmin
    const superadminCount = await User.countDocuments({ role: 'superadmin' });
    if (superadminCount === 0) {
      console.log('⚠️  No superadmin found - run seedSuperadmin.js');
    } else {
      console.log(`✅ Superadmin(s) found: ${superadminCount}`);
    }

    // Check for admin
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount === 0) {
      console.log('⚠️  No admin found - run seedAdmin.js for testing');
    } else {
      console.log(`✅ Admin(s) found: ${adminCount}`);
    }

    // Check for regular users
    const userCount = await User.countDocuments({ role: 'user' });
    console.log(`📊 Regular users: ${userCount}`);

    // Check for active vs inactive users
    const activeUsers = await User.countDocuments({ isActive: true });
    const inactiveUsers = await User.countDocuments({ isActive: false });
    console.log(`📊 Active users: ${activeUsers}`);
    console.log(`📊 Inactive users: ${inactiveUsers}`);

    // Check published insights
    if (Insight) {
      const publishedInsights = await Insight.countDocuments({
        status: 'published',
        isDeleted: false
      });
      const premiumInsights = await Insight.countDocuments({
        type: 'premium',
        status: 'published',
        isDeleted: false
      });
      console.log(`📰 Published insights: ${publishedInsights}`);
      console.log(`💎 Premium insights: ${premiumInsights}`);
    }

    // Check audit logs
    const auditLogCount = await AuditLog.countDocuments();
    const recentAuditLogs = await AuditLog.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    console.log(`📝 Total audit logs: ${auditLogCount}`);
    console.log(`📝 Audit logs (last 24h): ${recentAuditLogs}`);

    // Index checks
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 INDEX HEALTH:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    for (const { name, model } of collections) {
      try {
        const indexes = await model.collection.indexes();
        console.log(`${name}: ${indexes.length} indexes`);
        indexes.forEach(index => {
          const keys = Object.keys(index.key).join(', ');
          console.log(`  - ${index.name}: ${keys}${index.unique ? ' (unique)' : ''}`);
        });
        console.log('');
      } catch (error) {
        console.log(`⚠️  ${name}: Could not retrieve indexes\n`);
      }
    }

    // Performance checks
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚡ PERFORMANCE CHECKS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Test query performance
    const start = Date.now();
    await User.findOne({ email: 'test@test.com' });
    const queryTime = Date.now() - start;

    console.log(`User lookup time: ${queryTime}ms ${queryTime > 100 ? '⚠️' : '✅'}`);

    if (queryTime > 100) {
      console.log('⚠️  Query is slow - consider adding indexes');
    }

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 HEALTH CHECK SUMMARY:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const totalDocs = stats.reduce((sum, s) => sum + s.count, 0);
    console.log(`Total Documents: ${totalDocs}`);
    console.log(`Total Collections: ${stats.length}`);
    console.log(`Database Size: ${stats.reduce((sum, s) => sum + parseFloat(s.size), 0).toFixed(2)} KB`);

    console.log('\n✅ Health check complete!\n');

    logger.info('Database health check completed successfully');

  } catch (error) {
    logger.error('Health check failed:', error);
    console.error('\n❌ Health check failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    logger.info('Database connection closed');
  }
}

// Run if called directly
if (require.main === module) {
  healthCheck();
}

module.exports = healthCheck;
