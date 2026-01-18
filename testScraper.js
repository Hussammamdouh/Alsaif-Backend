const NewsService = require('./src/services/newsService');
const mongoose = require('mongoose');
require('dotenv').config();

async function testScraper() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/stock-insights');
        console.log('Connected.');

        console.log('Starting Scraper test...');
        const newsService = new NewsService();

        // Override logger for test output visibility
        const logger = require('./src/utils/logger');
        logger.info = console.log;
        logger.error = console.error;
        logger.warn = console.warn;
        logger.debug = console.log;

        await newsService.scrapeArgaam();

        console.log('Scrape Cycle Complete.');
        console.log('Latest 5 items in cache:');
        newsService.newsCache.slice(0, 5).forEach((item, i) => {
            console.log(`${i + 1}. ${item.title} (${item.publishedAt})`);
        });

        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Test Failed:', error);
        process.exit(1);
    }
}

testScraper();
