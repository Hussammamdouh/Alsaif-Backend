const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cron = require('node-cron');
const Disclosure = require('../models/Disclosure');
const logger = require('../utils/logger');

puppeteer.use(StealthPlugin());

const DFM_EN_LIST_URL = 'https://www.dfm.ae/the-exchange/news-disclosures/disclosures';
const DFM_AR_LIST_URL = 'https://www.dfm.ae/ar/the-exchange/news-disclosures/disclosures';
const ADX_DISCLOSURES_URL = 'https://www.adx.ae/English/Pages/DisclosuresAndAnnouncements.aspx';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class DisclosureService {
    constructor() {
        this.isInitialized = false;
        this.isScraping = false; // Scrape lock
    }

    async initialize() {
        if (this.isInitialized) return;
        logger.info('[DisclosureService] Initializing...');

        try {
            // Schedule scrape every 30 minutes
            cron.schedule('*/30 * * * *', () => {
                this.scrapeAll();
            });

            // Initial scrape on startup
            this.scrapeAll();

            this.isInitialized = true;
            logger.info('[DisclosureService] Initialization Complete.');
        } catch (error) {
            logger.error('[DisclosureService] Initialization Failed:', error);
        }
    }

    async scrapeAll() {
        if (this.isScraping) return;
        this.isScraping = true;

        logger.info('[DisclosureService] Starting Scrape Cycle...');
        const startTime = Date.now();

        try {
            const [dfmResults, adxResults] = await Promise.allSettled([
                this.scrapeDFM(),
                this.scrapeADX()
            ]);

            let dfmCount = 0;
            let adxCount = 0;

            if (dfmResults.status === 'fulfilled') {
                dfmCount = dfmResults.value;
            } else {
                logger.error('[DisclosureService] DFM Scrape Failed:', dfmResults.reason?.message || dfmResults.reason);
            }

            if (adxResults.status === 'fulfilled') {
                adxCount = adxResults.value;
            } else {
                logger.error('[DisclosureService] ADX Scrape Failed:', adxResults.reason?.message || adxResults.reason);
            }

            logger.info(`[DisclosureService] Scrape Complete in ${Date.now() - startTime}ms. New: DFM(${dfmCount}) ADX(${adxCount})`);
        } finally {
            this.isScraping = false;
        }
    }

    async scrapeDFM() {
        let browser;
        let newCount = 0;
        try {
            browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();
            await page.setUserAgent(USER_AGENT);
            await page.setViewport({ width: 1280, height: 1000 });

            // 1. Scrape Arabic List first (to get Arabic titles)
            logger.info('[DFM] Scraping Arabic list...');
            await page.goto(DFM_AR_LIST_URL, { waitUntil: 'networkidle2', timeout: 60000 });
            await delay(5000);
            const arItems = await this.extractDfmListItems(page);
            logger.info(`[DFM] Found ${arItems.length} items in Arabic list.`);

            // 2. Scrape English List
            logger.info('[DFM] Scraping English list...');
            await page.goto(DFM_EN_LIST_URL, { waitUntil: 'networkidle2', timeout: 60000 });
            await delay(5000);
            const enItems = await this.extractDfmListItems(page);
            logger.info(`[DFM] Found ${enItems.length} items in English list.`);

            // 3. Merge lists using the subtext (Company - Jan 21, 2026 20:44:59) as key
            const mergedMap = new Map();

            // Map Arabic titles by subtext
            arItems.forEach(item => {
                if (item.subtext) mergedMap.set(item.subtext, { titleAr: item.title });
            });

            // Merge with English items
            const finalItems = enItems.map(enItem => {
                const merged = mergedMap.get(enItem.subtext) || {};
                return {
                    ...enItem,
                    titleEn: enItem.title,
                    titleAr: merged.titleAr || enItem.title // Fallback to English title if Arabic not found
                };
            });

            logger.info(`[DFM] Merged ${finalItems.length} items. Extracting PDFs for top items...`);

            // Only fetch first 20 to avoid long wait times
            const itemsToFetch = finalItems.slice(0, 20);

            for (const item of itemsToFetch) {
                try {
                    const date = this.parseDate(item.dateStr);

                    // Check if we already have this disclosure by URL (most reliable unique key for PDF dumps)
                    const existingByUrl = await Disclosure.findOne({
                        url: item.url || (item.pdfUrls && item.pdfUrls[0])
                    });

                    if (existingByUrl) {
                        // If it exists but might need enrichment (like Arabic title), update it
                        if (!existingByUrl.titleAr && item.titleAr) {
                            await Disclosure.updateOne({ _id: existingByUrl._id }, { $set: { titleAr: item.titleAr } });
                        }
                        continue;
                    }

                    // Check by title + exchange + date as fallback
                    const existingByTitle = await Disclosure.findOne({
                        title: item.titleEn,
                        exchange: 'DFM',
                        date: date
                    });

                    if (existingByTitle) continue;

                    // Navigate ONLY to English detail page to capture PDF URLs
                    const pdfUrls = await this.extractDfmPdfUrls(page, item.detailUrl);

                    if (pdfUrls.length > 0) {
                        const primaryUrl = pdfUrls[0];
                        await Disclosure.findOneAndUpdate(
                            { url: primaryUrl }, // Use URL as unique key (prevents E11000)
                            {
                                title: item.titleAr,
                                titleAr: item.titleAr,
                                titleEn: item.titleEn,
                                url: primaryUrl,
                                pdfUrls: pdfUrls,
                                date: date,
                                exchange: 'DFM'
                            },
                            { upsert: true, new: true }
                        );
                        newCount++;
                        logger.info(`[DFM] Saved/Updated: ${item.titleEn.substring(0, 50)}...`);
                    }
                } catch (e) {
                    logger.debug(`[DFM] Error processing item: ${e.message}`);
                }
            }

            await browser.close();
            return newCount;
        } catch (error) {
            if (browser) await browser.close();
            throw error;
        }
    }

    async extractDfmListItems(page) {
        return await page.evaluate(() => {
            const results = [];
            // Target the disclosure links
            const anchors = Array.from(document.querySelectorAll('a[href*="/disclosures/"]'));

            anchors.forEach(a => {
                const title = a.innerText?.trim();
                const href = a.href;

                // The subtext (Company - Time) is usually in a following span or text node
                // Based on investigation, it's often in a sibling or parent sibling
                const parent = a.parentElement;
                const grandParent = parent?.parentElement;

                // Find all text in the container excluding the title itself
                let subtext = '';
                if (grandParent) {
                    const fullText = grandParent.innerText || '';
                    subtext = fullText.replace(title, '').trim();
                }

                // Extract date string for parsing later
                const dateMatch = subtext.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/) || subtext.match(/([a-zA-Z]{3} \d{1,2}, \d{4})/);
                const dateStr = dateMatch ? dateMatch[0] : '';

                if (title && href) {
                    results.push({
                        title,
                        detailUrl: href,
                        subtext, // This is our Merge Key
                        dateStr
                    });
                }
            });
            return results;
        });
    }

    async extractDfmPdfUrls(page, detailUrl) {
        try {
            const pdfUrls = new Set();

            // Set up request listener to capture PDF URLs
            const requestHandler = (request) => {
                const url = request.url();
                if (url.includes('feeds.dfm.ae/documents') && url.includes('.pdf')) {
                    pdfUrls.add(url);
                }
            };

            page.on('request', requestHandler);

            await page.goto(detailUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            await delay(2000);

            // Trigger downloads to capture URLs
            await page.evaluate(() => {
                const els = Array.from(document.querySelectorAll('button, a'));
                els.forEach(el => {
                    const text = el.innerText?.toLowerCase();
                    if (text?.includes('download') || text?.includes('تحميل')) el.click();
                });
            });
            await delay(1000);

            page.off('request', requestHandler);
            return Array.from(pdfUrls);
        } catch (error) {
            logger.debug(`[DFM] PDF extraction error: ${error.message}`);
            return [];
        }
    }

    async scrapeADX() {
        let browser;
        let newCount = 0;
        try {
            browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();
            await page.setUserAgent(USER_AGENT);
            await page.setViewport({ width: 1280, height: 1000 });

            const adxUrls = [
                'https://www.adx.ae/English/Pages/DisclosuresAndAnnouncements.aspx',
                'https://www.adx.ae/market/news-corporate-disclosures'
            ];

            let disclosures = [];

            for (const url of adxUrls) {
                try {
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
                    await delay(5000);

                    const items = await page.evaluate(() => {
                        const results = [];
                        const links = document.querySelectorAll('a[href*=".pdf"]');

                        links.forEach(link => {
                            const href = link.href;
                            const title = link.innerText?.trim() || link.getAttribute('title') || '';
                            if (!title || title.length < 3) return;

                            let dateStr = '';
                            let parent = link.parentElement;
                            for (let i = 0; i < 5 && parent; i++) {
                                const text = parent.innerText || '';
                                const dateMatch = text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/);
                                if (dateMatch) {
                                    dateStr = dateMatch[1];
                                    break;
                                }
                                parent = parent.parentElement;
                            }

                            results.push({ title, url: href, dateStr });
                        });
                        return results;
                    });

                    if (items.length > 0) {
                        disclosures = items;
                        break;
                    }
                } catch (e) { }
            }

            for (const item of disclosures) {
                try {
                    const date = this.parseDate(item.dateStr);
                    let url = item.url;
                    if (url.startsWith('/')) url = 'https://www.adx.ae' + url;

                    await Disclosure.findOneAndUpdate(
                        { url: url }, // Use URL as unique key
                        {
                            title: item.title,
                            titleAr: item.title,
                            titleEn: item.title,
                            url: url,
                            pdfUrls: [url],
                            date: date,
                            exchange: 'ADX'
                        },
                        { upsert: true, new: true }
                    );
                    newCount++;
                } catch (e) { }
            }

            await browser.close();
            return newCount;
        } catch (error) {
            if (browser) await browser.close();
            throw error;
        }
    }

    parseDate(dateStr) {
        if (!dateStr) return new Date();
        try {
            // Priority 1: Month Day, Year (Jan 21, 2026)
            const longDateMatch = dateStr.match(/([a-zA-Z]{3}) (\d{1,2}), (\d{4})/);
            if (longDateMatch) {
                const months = { 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };
                const month = months[longDateMatch[1]];
                const day = parseInt(longDateMatch[2], 10);
                const year = parseInt(longDateMatch[3], 10);
                return new Date(year, month, day);
            }

            // Priority 2: DD/MM/YYYY
            const parts = dateStr.split(/[\/\-]/);
            if (parts.length === 3) {
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1;
                const year = parseInt(parts[2], 10);
                const date = new Date(year, month, day);
                if (!isNaN(date.getTime())) return date;
            }
        } catch (e) { }
        return new Date();
    }

    async getDisclosures(filter = {}) {
        const query = {};
        if (filter && typeof filter === 'object' && filter.exchange) {
            query.exchange = filter.exchange.toUpperCase();
        } else if (filter && typeof filter === 'string') {
            query.exchange = filter.toUpperCase();
        }
        return Disclosure.find(query).sort({ date: -1 }).limit(100);
    }
}

module.exports = new DisclosureService();
