/**
 * Initialize Tier Groups Script
 * Run this script to create tier groups and add all existing users
 * 
 * Usage: node src/scripts/initTierGroups.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const SubscriptionPlan = require('../models/SubscriptionPlan'); // Required for populate
const groupChatService = require('../services/groupChatService');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/elsaifarabic';

async function initializeTierGroups() {
    console.log('========================================');
    console.log('   TIER GROUPS INITIALIZATION SCRIPT');
    console.log('========================================\n');

    try {
        // Connect to MongoDB
        console.log('[1/5] Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✓ Connected to MongoDB\n');

        // Find first admin to use as group creator
        console.log('[2/5] Finding admin user...');
        const admin = await User.findOne({ role: { $in: ['admin', 'superadmin'] } });

        if (!admin) {
            console.error('✗ No admin user found! Please create an admin user first.');
            process.exit(1);
        }
        console.log(`✓ Found admin: ${admin.name} (${admin.email})\n`);

        // Initialize tier groups
        console.log('[3/5] Creating tier groups...');
        const { freeGroup, premiumGroup } = await groupChatService.initializeTierGroups(admin._id);
        console.log(`✓ Free group created: ${freeGroup.name} (ID: ${freeGroup._id})`);
        console.log(`✓ Premium group created: ${premiumGroup.name} (ID: ${premiumGroup._id})\n`);

        // Add all existing users to appropriate groups
        console.log('[4/5] Adding existing users to groups...');
        const users = await User.find({ role: 'user' });
        let freeCount = 0;
        let premiumCount = 0;

        for (const user of users) {
            // Add to free group (all users)
            await groupChatService.addUserToTierGroup(user._id, 'free');
            freeCount++;

            // Check if user has premium subscription
            const hasPremium = await Subscription.hasPremiumAccess(user._id);
            if (hasPremium) {
                await groupChatService.addUserToTierGroup(user._id, 'premium');
                premiumCount++;
            }
        }

        console.log(`✓ Added ${freeCount} users to Free group`);
        console.log(`✓ Added ${premiumCount} users to Premium group\n`);

        // Sync all admins to both groups
        console.log('[5/5] Syncing admins to both groups...');
        await groupChatService.syncAdminsToGroups();
        console.log('✓ Admins synced to both groups\n');

        console.log('========================================');
        console.log('   INITIALIZATION COMPLETE!');
        console.log('========================================');
        console.log(`\nFree Group: ${freeGroup._id}`);
        console.log(`Premium Group: ${premiumGroup._id}\n`);

        process.exit(0);
    } catch (error) {
        console.error('\n✗ Error during initialization:', error);
        process.exit(1);
    }
}

// Run the script
initializeTierGroups();
