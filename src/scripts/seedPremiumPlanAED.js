const mongoose = require('mongoose');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const env = require('../config/env');
const logger = require('../utils/logger');

const seedPlan = async () => {
    try {
        await mongoose.connect(env.MONGODB_URI);
        console.log('Connected to MongoDB for seeding...');

        // Delete existing plans if needed, or just update
        // For this task, we'll create a new one if it doesn't exist
        const planData = {
            name: 'Premium Monthly (AED)',
            tier: 'premium',
            price: 49,
            currency: 'AED',
            billingCycle: 'monthly',
            features: [
                { name: 'Unlimited Insights', included: true, description: 'Access to all market analysis' },
                { name: 'Expert Strategies', included: true, description: 'Exclusive trading strategies' },
                { name: 'Priority Support', included: true, description: '24/7 priority customer support' },
                { name: 'Ad-free Experience', included: true, description: 'No advertisements' }
            ],
            isActive: true,
            isFeatured: true,
            description: 'The ultimate plan for serious traders in UAE.',
            stripePriceId: 'price_1StD8sK2mF6LFi6VAvJzgN9X', // Real Price ID from Stripe Sandbox
            metadata: {
                region: 'UAE'
            }
        };

        const existingPlan = await SubscriptionPlan.findOne({ tier: 'premium', billingCycle: 'monthly', currency: 'AED' });

        if (existingPlan) {
            console.log('Premium AED plan already exists, updating...');
            Object.assign(existingPlan, planData);
            await existingPlan.save();
            console.log('Plan updated successfully');
        } else {
            console.log('Creating new Premium AED plan...');
            await SubscriptionPlan.create(planData);
            console.log('Plan created successfully');
        }

        mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Error seeding subscription plan:', error);
        process.exit(1);
    }
};

seedPlan();
