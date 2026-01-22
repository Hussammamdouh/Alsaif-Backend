const cron = require('node-cron');
const MarketData = require('../models/MarketData');
const logger = require('../utils/logger');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { emitMarketOpened, emitMarketClosed } = require('../events/enhancedNotificationEvents');

puppeteer.use(StealthPlugin());

// --- Configuration ---
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const DFM_URL = 'https://marketwatch.dfm.ae/';
const ADX_URL = 'https://www.adx.ae/all-equities';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

// In-memory cache
const marketCache = new Map();

class MarketDataService {
    constructor() {
        this.isInitialized = false;
        this.lastAlertTime = 0;
        this.ALERT_COOLDOWN = 15 * 60 * 1000;
        this.lastMarketStatus = undefined;
    }

    async initialize() {
        if (this.isInitialized) return;
        logger.info('[MarketDataService] Initializing Final Resilient Strategy...');

        try {
            await this.hydrateCache();

            // Strictly every 1 minute
            cron.schedule('*/1 * * * *', () => {
                this.checkAndFetch();
            });

            // Initial fetch on startup (Manual override to fetch even if closed)
            logger.info('[MarketDataService] Triggering initial startup sync (All Hours)...');
            this.fetchMarketData().catch(err => {
                logger.error('[MarketDataService] Startup Sync Failed:', err);
            });

            this.isInitialized = true;
            logger.info('[MarketDataService] Initialization Complete.');
        } catch (error) {
            logger.error('[MarketDataService] Initialization Failed:', error);
        }
    }

    async hydrateCache() {
        try {
            const records = await MarketData.find({});
            for (const record of records) {
                marketCache.set(record.symbol, record);
            }
            logger.info(`[MarketDataService] Hydrated ${marketCache.size} symbols from cache.`);
        } catch (error) {
            logger.error('[MarketDataService] Hydration Error:', error);
        }
    }

    isMarketOpen() {
        const now = new Date();
        const day = now.getUTCDay(); // 1-5 = Mon-Fri
        const utcHours = now.getUTCHours();
        // GST (UTC+4) 10:00-15:00 = UTC 06:00-11:00
        if (day < 1 || day > 5) return false;
        if (utcHours >= 6 && utcHours < 11) return true;
        return false;
    }

    async checkAndFetch() {
        const isOpen = this.isMarketOpen();
        if (this.lastMarketStatus !== undefined && this.lastMarketStatus !== isOpen) {
            if (isOpen) {
                logger.info('[MarketDataService] Market OPENED');
                emitMarketOpened();
            } else {
                logger.info('[MarketDataService] Market CLOSED');
                emitMarketClosed();
            }
        }
        this.lastMarketStatus = isOpen;

        // Sync every minute during open hours
        if (isOpen) await this.fetchMarketData();
    }

    async fetchMarketData() {
        const startTime = Date.now();
        logger.info('[MarketData] Starting Sync Cycle...');

        const [dfmResults, adxResults] = await Promise.allSettled([
            this.fetchDFM(),
            this.fetchADX()
        ]);

        let dfmCount = 0;
        let adxCount = 0;

        if (dfmResults.status === 'fulfilled') {
            await this.processResults(dfmResults.value);
            dfmCount = dfmResults.value.length;
        } else {
            logger.error('[MarketData] DFM Sync Failed:', dfmResults.reason.message || dfmResults.reason);
        }

        if (adxResults.status === 'fulfilled') {
            await this.processResults(adxResults.value);
            adxCount = adxResults.value.length;
        } else {
            logger.error('[MarketData] ADX Sync Failed:', adxResults.reason.message || adxResults.reason);
        }

        logger.info(`[MarketData] Sync Complete in ${Date.now() - startTime}ms. Results: DFM(${dfmCount}) ADX(${adxCount})`);
    }

    // --- DFM Implementation ---
    async fetchDFM() {
        let browser;
        try {
            browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,1000']
            });
            const page = await browser.newPage();
            await page.setUserAgent(USER_AGENT);
            await page.setViewport({ width: 1280, height: 1000 });
            await page.goto(DFM_URL, { waitUntil: 'networkidle2', timeout: 50000 });

            // Wait for dynamic content
            await page.waitForFunction(() => document.body.innerText.includes('EMAAR'), { timeout: 30000 });

            const incrementalScrape = async () => {
                const results = new Map();
                for (let i = 0; i < 8; i++) {
                    const data = await page.evaluate(() => {
                        const container = document.querySelector('.marketwatch-tabcontent') || document.body;
                        const rows = Array.from(document.querySelectorAll('.symbol, .security-symbol'));
                        const batch = [];
                        rows.forEach(el => {
                            const symbol = el.innerText.trim();
                            if (!symbol || !/^[A-Z0-9_-]{3,15}$/.test(symbol)) return;
                            if (['PRICE', 'SYMBOL', 'CHANGE', 'VALUE', 'VOLUME', 'TOTAL', 'LOW', 'HIGH', 'OPEN', 'BID', 'OFFER', 'ASK'].includes(symbol)) return;

                            const row = el.closest('tr') || el.closest('.dfm-table-row') || el.parentElement?.parentElement;
                            if (!row) return;

                            const parse = (sel) => {
                                const target = row.querySelector(sel);
                                return parseFloat(target?.innerText.replace(/[%,]/g, '')) || 0;
                            };

                            batch.push({
                                symbol: `${symbol}.AE`,
                                exchange: 'DFM',
                                price: parse('.lastradeprice'),
                                changePercent: parse('.changepercentage'),
                                volume: parse('.totalvolume'),
                                currency: 'AED',
                                shortName: symbol,
                                lastUpdated: new Date().toISOString(),
                                chartData: []
                            });
                        });

                        // Scroll for next batch
                        container.scrollBy(0, 800);
                        return batch;
                    });

                    data.forEach(item => results.set(item.symbol, item));
                    await new Promise(r => setTimeout(r, 800));
                }
                return Array.from(results.values());
            };

            // 1. Scrape Market Watch
            const equities = await incrementalScrape();
            logger.info(`[DFM] Post-scroll 1 count: ${equities.length}`);

            // 2. Scrape Category B
            try {
                const catBTab = await page.$('#categoryb-caption');
                if (catBTab) {
                    await catBTab.click();
                    await new Promise(r => setTimeout(r, 2000));
                    const catB = await incrementalScrape();
                    logger.info(`[DFM] Post-scroll 2 count: ${catB.length}`);
                    catB.forEach(item => {
                        if (!equities.find(e => e.symbol === item.symbol)) equities.push(item);
                    });
                }
            } catch (e) { }

            // 3. Fetch Charts for DFM
            logger.info(`[DFM] Fetching charts for ${equities.length} symbols...`);
            await Promise.allSettled(equities.map(async (eq) => {
                try {
                    const symbol = eq.shortName;
                    const chartData = await page.evaluate(async (sym) => {
                        try {
                            const response = await fetch('https://api2.dfm.ae/web/widgets/v1/data', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: "chart", symbol: sym, period: "1D" })
                            });
                            const data = await response.json();
                            if (data && data.points) {
                                return data.points.map(p => ({
                                    timestamp: new Date(p[0]),
                                    price: p[1]
                                }));
                            }
                        } catch (e) { }
                        return [];
                    }, symbol);
                    eq.chartData = chartData;
                } catch (e) {
                    logger.error(`[DFM] Chart fetch failed for ${eq.symbol}:`, e.message);
                }
            }));

            await browser.close();
            return equities.map(r => ({ ...r, lastUpdated: new Date(r.lastUpdated) }));
        } catch (error) {
            if (browser) await browser.close();
            throw error;
        }
    }

    // --- ADX Implementation ---
    async fetchADX() {
        let browser;
        try {
            browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,1000']
            });
            const page = await browser.newPage();
            await page.setUserAgent(USER_AGENT);
            await page.setViewport({ width: 1280, height: 1000 });
            await page.goto(ADX_URL, { waitUntil: 'networkidle2', timeout: 50000 });

            // Accept Cookies
            try {
                await page.evaluate(() => {
                    const btns = Array.from(document.querySelectorAll('button'));
                    const allBtn = btns.find(b => b.innerText.includes('Accept All'));
                    if (allBtn) allBtn.click();
                });
            } catch (e) { }

            const results = new Map();
            for (let i = 0; i < 8; i++) {
                const data = await page.evaluate(() => {
                    const wrapper = document.querySelector('#content-wrapper');
                    const rows = Array.from(document.querySelectorAll('.rdt_TableRow'));
                    const batch = rows.map(row => {
                        const symbolEl = row.querySelector('[data-column-id="Symbol"] a');
                        const symbol = symbolEl ? symbolEl.innerText.trim() : '';
                        if (!symbol) return null;

                        const parse = (sel) => {
                            const target = row.querySelector(`[data-column-id="${sel}"]`);
                            return parseFloat(target?.innerText.replace(/[%,]/g, '')) || 0;
                        };

                        return {
                            symbol: `${symbol}.AD`,
                            exchange: 'ADX',
                            price: parse('Last'),
                            changePercent: parse('Change'),
                            volume: parse('Volume'),
                            currency: 'AED',
                            shortName: symbol,
                            lastUpdated: new Date().toISOString(),
                            chartData: []
                        };
                    }).filter(x => x !== null);

                    if (wrapper) wrapper.scrollBy(0, 1000);
                    return batch;
                });
                data.forEach(item => results.set(item.symbol, item));
                await new Promise(r => setTimeout(r, 800));
                if (results.size >= 125) break;
            }

            const equities = Array.from(results.values());

            // 3. Fetch Charts for ADX
            logger.info(`[ADX] Fetching charts for ${equities.length} symbols...`);
            for (const eq of equities) {
                try {
                    const chartData = await page.evaluate(async (sym) => {
                        try {
                            const response = await fetch(`https://apigateway.adx.ae/adx/marketwatch/1.1/securityChartDay/${sym}`);
                            const data = await response.json();
                            if (data && data.response && data.response.points) {
                                return data.response.points.map(p => ({
                                    timestamp: new Date(p.time),
                                    price: p.value
                                }));
                            }
                        } catch (e) { }
                        return [];
                    }, eq.shortName);
                    eq.chartData = chartData;
                } catch (e) {
                    logger.error(`[ADX] Chart fetch failed for ${eq.symbol}:`, e.message);
                }
            }

            await browser.close();
            return equities.map(r => ({ ...r, lastUpdated: new Date(r.lastUpdated) }));
        } catch (error) {
            if (browser) await browser.close();
            throw error;
        }
    }

    async processResults(dataList) {
        if (!dataList || dataList.length === 0) return;
        const bulkOps = dataList.map(data => {
            marketCache.set(data.symbol, data);
            return {
                updateOne: {
                    filter: { symbol: data.symbol },
                    update: { $set: data },
                    upsert: true
                }
            };
        });
        if (bulkOps.length > 0) {
            try {
                await MarketData.bulkWrite(bulkOps, { ordered: false });
            } catch (error) {
                logger.error('[MarketData] BulkWrite error:', error.message);
            }
        }
    }

    async sendTelegramAlert(message) {
        const now = Date.now();
        if (now - this.lastAlertTime < this.ALERT_COOLDOWN) return;
        if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
        try {
            const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            await axios.post(url, { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' });
            this.lastAlertTime = now;
        } catch (e) {
            logger.error('[Alert] Send Failed:', e.message);
        }
    }

    getAll() { return Array.from(marketCache.values()); }
    getByExchange(exchange) {
        const target = exchange.toUpperCase();
        return Array.from(marketCache.values()).filter(v => v.exchange === target);
    }
    getBySymbol(symbol) { return marketCache.get(symbol.toUpperCase()); }
}

module.exports = new MarketDataService();
