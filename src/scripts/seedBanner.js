const mongoose = require('mongoose');
const Banner = require('../models/Banner');
require('dotenv').config();

const seedBanner = async () => {
    try {
        console.log('Connecting to MongoDB...');
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error('MONGODB_URI not found in environment.');

        await mongoose.connect(uri);
        console.log('Connected!');

        const bannerData = {
            title: 'Partner Special Offer',
            imageUrl: 'https://picsum.photos/seed/elsaifbanner/800/400',
            link: 'https://elsaif-analysis.com/premium-offer',
            partner: 'Investment Pro',
            isActive: true,
            order: 1,
            type: 'both',
        };

        const existing = await Banner.findOne({ title: bannerData.title, partner: bannerData.partner });
        if (existing) {
            console.log('Banner already exists. Updating...');
            await Banner.updateOne({ _id: existing._id }, bannerData);
            console.log('Updated successfully!');
        } else {
            console.log('Creating new banner...');
            await Banner.create(bannerData);
            console.log('Created successfully!');
        }

        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Seeding failed:', error.message);
        process.exit(1);
    }
};

seedBanner();
