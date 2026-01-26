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
        this.isFetching = false; // Sync lock
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
        if (isOpen && !this.isFetching) {
            this.isFetching = true;
            try {
                await this.fetchMarketData();
            } finally {
                this.isFetching = false;
            }
        }
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

                            const price = parse('.lastradeprice');
                            const prevClose = parse('.previousclosingprice');

                            batch.push({
                                symbol: `${symbol}.AE`,
                                exchange: 'DFM',
                                price: price,
                                change: price - prevClose,
                                changePercent: parse('.changepercentage'),
                                high: parse('.highprice') || price,
                                low: parse('.lowprice') || price,
                                open: parse('.openprice') || price,
                                prevClose: prevClose,
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
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,1200']
            });
            const page = await browser.newPage();
            await page.setUserAgent(USER_AGENT);
            await page.setViewport({ width: 1440, height: 2500 });

            logger.info('[ADX] Navigating to ADX All Equities...');
            // Using 'domcontentloaded' as networkidle2 often fails on heavy ADX site
            await page.goto(ADX_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });

            // Wait for any likely content to appear
            try {
                await page.waitForSelector('table, .rdt_Table', { timeout: 30000 });
            } catch (e) {
                logger.warn('[ADX] Main content container not found, proceeding anyway');
            }

            // Initial wait for scripts to load
            await new Promise(r => setTimeout(r, 12000));
            // Trigger bottom section loading (where the main table lives)
            await page.evaluate(() => window.scrollTo(0, 1500));
            await new Promise(r => setTimeout(r, 4000));

            const results = new Map();
            let lastFirstTicker = '';

            // Loop for discovery (40 iterations for deep scroll)
            for (let i = 0; i < 40; i++) {
                const data = await page.evaluate(() => {
                    const batch = [];
                    const parseValue = (text) => parseFloat(text?.trim().replace(/[%,]/g, '')) || 0;

                    // 1. Identify Target Grid (Traditional table or Role-based Grid)
                    const findGrid = () => {
                        const containers = Array.from(document.querySelectorAll('table, [role="table"], .rdt_Table'));
                        let grid = containers.find(t => {
                            const text = t.innerText?.toUpperCase() || '';
                            return text.includes('SYMBOL') && text.includes('LAST');
                        });

                        if (!grid) {
                            const candidates = Array.from(document.querySelectorAll('div, section, main'));
                            grid = candidates.find(c => {
                                const text = c.innerText?.toUpperCase() || '';
                                return text.includes('SYMBOL') && text.includes('LAST') && text.includes('P CLOSE') && text.length < 100000;
                            });
                        }
                        return grid;
                    };

                    const targetTable = findGrid();
                    const tableDiagnostics = Array.from(document.querySelectorAll('table, [role="table"]'))
                        .map(t => t.innerText?.substring(0, 100).replace(/\n/g, ' '));

                    if (!targetTable) return { batch: [], metrics: { name: 'NOT_FOUND', diag: tableDiagnostics } };

                    // 2. Capture rows specifically from this table
                    const rows = Array.from(targetTable.querySelectorAll('tbody tr, .rdt_TableRow, tr[role="row"]'));
                    rows.forEach(row => {
                        const cells = Array.from(row.querySelectorAll('td, .rdt_TableCell, [role="cell"]'));
                        if (cells.length < 10) return; // Expecting many columns based on Screenshot 2

                        // Screenshot 2 Mapping:
                        // 1: Symbol, 7: Last (Price), 8: P Close (PrevClose), 9: Change (%), 11: Volume
                        const ticker = cells[1]?.innerText?.trim();
                        if (!ticker || ticker.length > 15 || /[^A-Z0-9.-]/.test(ticker)) return;
                        if (['COMPANY', 'SYMBOL', 'NAME', 'LAST'].includes(ticker.toUpperCase())) return;

                        const price = parseValue(cells[7]?.innerText);
                        const prevClose = parseValue(cells[8]?.innerText);

                        batch.push({
                            symbol: `${ticker}.AD`,
                            exchange: 'ADX',
                            price: price,
                            change: price - prevClose,
                            changePercent: parseValue(cells[9]?.innerText), // Percentage column
                            high: price, // ADX table doesn't show high/low in this view
                            low: price,
                            open: price,
                            prevClose: prevClose,
                            volume: parseValue(cells[11]?.innerText),
                            currency: 'AED',
                            shortName: ticker,
                            lastUpdated: new Date().toISOString(),
                            chartData: []
                        });
                    });

                    // 3. Smart Scroller: Find the parent of the targetTable that scrolls
                    const findScrollable = (el) => {
                        if (!el || el === document.body || el === document.documentElement) return window;
                        const style = window.getComputedStyle(el);
                        const overflow = style.getPropertyValue('overflow-y');
                        if ((overflow === 'auto' || overflow === 'scroll') && el.scrollHeight > el.clientHeight) return el;
                        return findScrollable(el.parentElement);
                    };

                    const scroller = findScrollable(targetTable);

                    let metrics = { top: 0, height: 0, name: 'window' };
                    if (scroller !== window) {
                        scroller.scrollTop += 350;
                        metrics = { top: scroller.scrollTop, height: scroller.scrollHeight, name: scroller.className || scroller.tagName };
                    } else {
                        window.scrollBy(0, 500);
                        metrics = { top: window.scrollY, height: document.body.scrollHeight, name: 'window' };
                    }

                    return { batch, metrics };
                });

                if (data.batch && data.batch.length > 0) {
                    data.batch.forEach(item => results.set(item.symbol, item));
                    const currentTop = data.batch[0]?.shortName || '';
                    if (currentTop !== lastFirstTicker) {
                        logger.info(`[ADX] Cycle ${i + 1}: Found '${currentTop}' in main table. Total: ${results.size}`);
                        lastFirstTicker = currentTop;
                    }
                }

                if (i % 5 === 0 || i === 39) {
                    let scrollerInfo = '';
                    if (data.metrics.name === 'NOT_FOUND') {
                        scrollerInfo = `TABLE NOT FOUND. Tables seen: ${JSON.stringify(data.metrics.diag || [])}`;
                    } else {
                        scrollerInfo = `${Math.round(data.metrics.top)}/${data.metrics.height} (${data.metrics.name})`;
                    }
                    logger.info(`[ADX] Scroll ${i + 1}: Total ${results.size}. ${scrollerInfo}`);
                }

                await new Promise(r => setTimeout(r, 2000));
                if (results.size >= 125) break;
            }

            const equities = Array.from(results.values());
            logger.info(`[ADX] Capture Cycle Finished. Final Count: ${equities.length}`);

            if (equities.length === 0) {
                logger.warn('[ADX] No equities found. Website might have changed structure.');
            }

            // Sync charts sequentially (limit to top symbols to avoid timeout)
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
                } catch (e) { }
            }

            await browser.close();
            return equities.map(r => ({ ...r, lastUpdated: new Date(r.lastUpdated) }));
        } catch (error) {
            if (browser) await browser.close();
            logger.error('[ADX] Sync Failed:', error.message || error);
            throw error;
        }
    }

    async processResults(dataList) {
        if (!dataList || dataList.length === 0) return;

        // Debug sample
        const sample = dataList[0];
        logger.debug(`[MarketData] Sample Enriched Data (${sample.symbol}): Price=${sample.price}, Change=${sample.change}, Vol=${sample.volume}, High=${sample.high}, Prev=${sample.prevClose}`);

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
