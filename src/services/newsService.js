const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cron = require('node-cron');
const axios = require('axios');
const News = require('../models/News');
const logger = require('../utils/logger');

puppeteer.use(StealthPlugin());

const ARGAAM_NEWS_URL = 'https://www.argaam.com/ae-ar/news/main/1';
const BASE_URL = 'https://www.argaam.com';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Map cache for the latest 20 articles
let newsCache = [];

class NewsService {
    constructor() {
        this.isInitialized = false;
        this.ALERT_COOLDOWN = 15 * 60 * 1000;
        this.lastAlertTime = 0;
    }

    async initialize() {
        if (this.isInitialized) return;
        logger.info('[NewsService] Initializing Argaam Scraper...');

        try {
            await this.hydrateCache();

            // Schedule Cron (Every 5 Minutes)
            cron.schedule('*/5 * * * *', () => {
                this.scrapeArgaam();
            });

            // Initial scrape on startup
            this.scrapeArgaam();

            this.isInitialized = true;
            logger.info('[NewsService] Ready.');
        } catch (error) {
            logger.error('[NewsService] Init Failed:', error);
        }
    }

    async hydrateCache() {
        try {
            const records = await News.find().sort({ publishedAt: -1 }).limit(20);
            newsCache = records;
            logger.info(`[NewsService] Hydrated ${records.length} articles from MongoDB.`);
        } catch (error) {
            logger.error('[NewsService] Hydration Error:', error);
        }
    }

    async scrapeArgaam() {
        logger.info('[NewsService] Starting Argaam Scrape Cycle...');
        let browser = null;
        try {
            browser = await puppeteer.launch({
                headless: "new",
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });
            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 800 });

            // Navigate to main news page
            await page.goto(ARGAAM_NEWS_URL, { waitUntil: 'networkidle2', timeout: 60000 });

            // Extract article URLs
            const articleUrls = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a[href*="/article/articledetail/"]'));
                return [...new Set(links.map(a => a.href))].slice(0, 10); // Check latest 10
            });

            logger.info(`[NewsService] Found ${articleUrls.length} potential articles.`);

            if (articleUrls.length === 0) {
                await this.sendTelegramAlert('Argaam Scraper: No articles found on main page. Possible selector change or block.');
            }

            for (const url of articleUrls) {
                const exists = await News.findOne({ sourceUrl: url });
                if (exists) {
                    logger.debug(`[NewsService] Skipping existing article: ${url}`);
                    continue;
                }

                try {
                    logger.info(`[NewsService] Scraping detail: ${url}`);
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

                    const articleData = await page.evaluate(() => {
                        const title = document.querySelector('h1')?.innerText?.trim();
                        const contentEl = document.querySelector('.article-detail-content') ||
                            document.querySelector('#articledetail') ||
                            document.querySelector('#article-body');

                        // Extract text from paragraphs for native rendering
                        const paragraphs = Array.from(contentEl?.querySelectorAll('p') || [])
                            .map(p => p.innerText.trim())
                            .filter(p => p.length > 0);

                        const content = paragraphs.join('\n\n');

                        // Image extraction
                        const imgEl = document.querySelector('img[src*="argaamplus"]') ||
                            document.querySelector('#articledetail img') ||
                            document.querySelector('.article-img img');
                        const imageUrl = imgEl?.src;

                        return { title, content, imageUrl };
                    });

                    logger.debug(`[NewsService] Extracted data for ${url}:`, {
                        hasTitle: !!articleData.title,
                        hasContent: !!articleData.content && articleData.content.length > 0,
                        hasImage: !!articleData.imageUrl
                    });

                    if (articleData.title && articleData.content) {
                        await News.create({
                            title: articleData.title,
                            content: articleData.content,
                            imageUrl: articleData.imageUrl,
                            sourceUrl: url,
                            publishedAt: new Date()
                        });
                        logger.info(`[NewsService] Saved: ${articleData.title}`);
                    } else {
                        logger.warn(`[NewsService] Missing data for ${url}. Title: ${!!articleData.title}, Content: ${!!articleData.content}`);
                    }
                } catch (detailError) {
                    logger.error(`[NewsService] Error scraping article ${url}:`, detailError);
                }
            }

            await this.hydrateCache();
            logger.info('[NewsService] Scrape Cycle Complete.');

        } catch (error) {
            logger.error('[NewsService] Scrape Failed:', error);
            await this.sendTelegramAlert(`Argaam Scraper ERROR: ${error.message}`);
        } finally {
            if (browser) await browser.close();
        }
    }

    async scrapeDetail(page, url) {
        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 40000 });

            const articleData = await page.evaluate(() => {
                const title = document.querySelector('h1')?.innerText?.trim();
                const contentEl = document.querySelector('.article-detail-content') ||
                    document.querySelector('#articledetail') ||
                    document.querySelector('#article-body');

                const paragraphs = Array.from(contentEl?.querySelectorAll('p') || [])
                    .map(p => p.innerText.trim())
                    .filter(p => p.length > 0);

                const content = paragraphs.join('\n\n');

                const imgEl = document.querySelector('img[src*="argaamplus"]') ||
                    document.querySelector('#articledetail img') ||
                    document.querySelector('.article-img img');
                const imageUrl = imgEl?.src;

                return { title, content, imageUrl };
            });

            if (articleData.title && articleData.content) {
                await News.create({
                    title: articleData.title,
                    content: articleData.content,
                    imageUrl: articleData.imageUrl,
                    sourceUrl: url,
                    publishedAt: new Date()
                });
                logger.debug(`[NewsService] Saved new article: ${articleData.title}`);
            }
        } catch (error) {
            logger.error(`[NewsService] Detail Scrape Failed for ${url}:`, error.message);
        }
    }

    async sendTelegramAlert(message) {
        const now = Date.now();
        if (now - this.lastAlertTime < this.ALERT_COOLDOWN) return;

        if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

        try {
            const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            await axios.post(url, {
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'Markdown'
            });
            this.lastAlertTime = now;
        } catch (e) {
            logger.error('[NewsService] Telegram Alert Failed:', e.message);
        }
    }

    getLatestNews() {
        return newsCache;
    }
}

module.exports = new NewsService();
