const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const logger = require('../utils/logger');

puppeteer.use(StealthPlugin());

class GoogleFinanceScraper {
    constructor() {
        this.browser = null;
    }

    async init() {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: "new",
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    async getQuote(symbol, exchange = 'ADX') {
        let page = null;
        try {
            await this.init();
            page = await this.browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            // Map common symbols to Google Finance format if needed
            // e.g. ALDAR -> ALDAR:ADX
            const query = `${symbol}:${exchange}`;
            const url = `https://www.google.com/finance/quote/${query}`;

            logger.info(`[GoogleScraper] Fetching ${query}...`);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Wait a bit for hydration
            await new Promise(r => setTimeout(r, 2000));

            // Extract using text regex because classes are obfuscated
            const data = await page.evaluate(() => {
                const text = document.body.innerText;
                return text;
            });

            // Regex for Price. usually "13.60 AED" or "AED 13.60"
            // Look for patterns like "13.60\nAED" or "13.60 AED"
            const priceRegex = /([0-9,]+\.[0-9]{2})\s*AED/i;
            const match = data.match(priceRegex);

            // Also try looking for the big price number specifically
            // The price is usually the largest text, but regex is safer.

            if (match) {
                return parseFloat(match[1].replace(/,/g, ''));
            }

            // Fallback: Try "AED\s+([0-9,.]+)"
            const match2 = data.match(/AED\s*([0-9,]+\.[0-9]{2})/i);
            if (match2) {
                return parseFloat(match2[1].replace(/,/g, ''));
            }

            throw new Error('Price pattern not found in page text');

        } catch (error) {
            logger.error(`[GoogleScraper] Failed for ${symbol}: ${error.message}`);
            return null;
        } finally {
            if (page) await page.close();
        }
    }
}

module.exports = new GoogleFinanceScraper();
