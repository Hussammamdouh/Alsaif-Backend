/**
 * Seed Dashboard Mock Data
 * 
 * Creates insights, subscriptions, and some activity to populate the admin dashboard.
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const Insight = require('../models/Insight');
const Subscription = require('../models/Subscription');
const connectDB = require('../config/database');
const logger = require('../utils/logger');

async function seedMockData() {
    try {
        await connectDB();
        logger.info('Connected to database');

        const admin = await User.findOne({ role: 'admin' });
        if (!admin) {
            console.error('Admin user not found. Run seed:admin first.');
            process.exit(1);
        }

        // 1. Create some users
        const usersCount = await User.countDocuments({ role: 'user' });
        if (usersCount < 5) {
            console.log('Creating mock users...');
            const userList = [
                { name: 'John Doe', email: 'john@example.com', password: 'Password123!', role: 'user', isActive: true, lastLogin: new Date() },
                { name: 'Jane Smith', email: 'jane@example.com', password: 'Password123!', role: 'user', isActive: true, lastLogin: new Date() },
                { name: 'Bob Wilson', email: 'bob@example.com', password: 'Password123!', role: 'user', isActive: true, lastLogin: new Date() },
                { name: 'Alice Brown', email: 'alice@example.com', password: 'Password123!', role: 'user', isActive: false },
                { name: 'Charlie Davis', email: 'charlie@example.com', password: 'Password123!', role: 'user', isActive: true, lastLogin: new Date() },
            ];

            for (const u of userList) {
                const exists = await User.findOne({ email: u.email });
                if (!exists) await User.create(u);
            }
        }

        // 2. Create some insights
        const insightsCount = await Insight.countDocuments();
        if (insightsCount < 5) {
            console.log('Creating mock insights...');
            const insightsList = [
                { title: 'Market Trends 2026', content: 'Long content about market trends in 2026...', type: 'free', category: 'market_analysis', status: 'published', author: admin._id, views: 120, likes: 45 },
                { title: 'Technical Analysis 101', content: 'Base technical analysis guide for beginners...', type: 'free', category: 'technical_analysis', status: 'published', author: admin._id, views: 350, likes: 89 },
                { title: 'Premium Strategy: Scalping', content: 'Advanced scalping strategy for premium users...', type: 'premium', category: 'strategy', status: 'published', author: admin._id, views: 85, likes: 32 },
                { title: 'Risk Management Pro', content: 'How to manage risk like a professional trader...', type: 'premium', category: 'risk_management', status: 'draft', author: admin._id },
                { title: 'Current Market Outlook', content: 'Detailed analysis of current market conditions...', type: 'free', category: 'fundamental_analysis', status: 'published', author: admin._id, views: 210, likes: 67 },
            ];

            for (const i of insightsList) {
                await Insight.create(i);
            }
        }

        // 3. Create some subscriptions
        const subCount = await Subscription.countDocuments();
        if (subCount < 3) {
            console.log('Creating mock subscriptions...');
            const users = await User.find({ role: 'user' }).limit(3);
            const subsList = [
                { user: users[0]._id, tier: 'premium', status: 'active', startDate: new Date(), billingCycle: 'monthly' },
                { user: users[1]._id, tier: 'premium', status: 'active', startDate: new Date(), billingCycle: 'yearly' },
                { user: users[2]._id, tier: 'free', status: 'active', startDate: new Date() },
            ];

            for (const s of subsList) {
                await Subscription.create(s);
            }
        }

        console.log('\n✅ Mock data seeded successfully!');
        process.exit(0);

    } catch (error) {
        logger.error('Error seeding mock data:', error);
        process.exit(1);
    }
}

seedMockData();
