const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const cron = require('node-cron');
const MarketData = require('../models/MarketData');
const logger = require('../utils/logger');
const axios = require('axios');
const { emitMarketOpened, emitMarketClosed } = require('../events/enhancedNotificationEvents');

// Puppeteer Setup for ADX "Direct-Data" Interception
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// --- Configuration ---
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ADX_PORTAL_URL = 'https://www.adx.ae/en/main-market/equities/all-equities';

// Market Hours: Mon-Fri, 10:00 - 15:00 GST (UTC+4)
const MARKET_HOURS = {
    start: 10,
    end: 15,
};

// --- DFM Master List (Safe .AE symbols) ---
const MASTER_LIST_DFM = [
    'EMAAR.AE', 'DIB.AE', 'DEWA.AE', 'EMIRATESNBD.AE', 'EMAARDEV.AE', 'MASQ.AE',
    'SALIK.AE', 'DU.AE', 'CBD.AE', 'AIRARABIA.AE', 'TALABAT.AE', 'PARKIN.AE',
    'TECOM.AE', 'EMPOWER.AE', 'DIC.AE', 'DFM.AE', 'ALEC.AE', 'TABREED.AE',
    'NIND.AE', 'GFH.AE', 'ALANSARI.AE', 'DTC.AE', 'SALAM_BAH.AE', 'SPINNEYS.AE',
    'DEYAAR.AE', 'MKHZN.AE', 'TAALEEM.AE', 'UNIONCOOP.AE', 'AJMANBANK.AE',
    'ARMX.AE', 'AMANAT.AE', 'IFA.AE', 'AMLAK.AE', 'UPP.AE', 'SUKOON.AE',
    'GULFNAV.AE', 'DRC.AE', 'NCC.AE', 'DIN.AE', 'NGI.AE', 'SHUAA.AE', 'ERC.AE',
    'DSI.AE', 'ALRAMZ.AE', 'SALAMA.AE', 'EIBANK.AE', 'MAZAYA.AE', 'BHMCAPITAL.AE',
    'UFC.AE', 'ITHMR.AE', 'DNIR.AE', 'NIH.AE', 'UNIKAI.AE', 'ALFIRDOUS.AE',
    'WATANIA.AE', 'EKTTITAB.AE', 'ALALSAMSUDAN.AE', 'AMAN.AE'
];

// In-memory cache for high-speed read
const marketCache = new Map();

class MarketDataService {
    constructor() {
        this.isInitialized = false;
        this.lastAlertTime = 0;
        this.ALERT_COOLDOWN = 15 * 60 * 1000; // 15 mins
    }

    async initialize() {
        if (this.isInitialized) return;
        logger.info('[MarketDataService] Initializing Official Source Proxy...');

        try {
            // 1. Load Persistence (Fallback Data)
            await this.hydrateCache();

            // 2. Schedule Cron (Every 1 Minute)
            cron.schedule('*/1 * * * *', () => {
                this.checkAndFetch();
            });

            // 3. Force Initial Fetch on Startup
            // Ensures fresh data even if server restarts during closed market hours
            logger.info('[MarketDataService] Execution Initial Fetch (Startup Mode)...');
            this.fetchMarketData();

            this.isInitialized = true;
            logger.info('[MarketDataService] Ready.');
        } catch (error) {
            logger.error('[MarketDataService] Init Failed:', error);
        }
    }

    async hydrateCache() {
        try {
            const records = await MarketData.find({});
            let count = 0;
            for (const record of records) {
                marketCache.set(record.symbol, record);
                count++;
            }
            logger.info(`[MarketDataService] Hydrated ${count} symbols from MongoDB.`);
        } catch (error) {
            logger.error('[MarketDataService] Hydration Error:', error);
        }
    }

    isMarketOpen() {
        const now = new Date();
        const day = now.getUTCDay();
        const utcHours = now.getUTCHours();
        // GST is UTC+4. 10am GST = 6am UTC. 3pm GST = 11am UTC.
        if (day < 1 || day > 5) return false; // Weekend
        if (utcHours >= 6 && utcHours < 11) return true;
        return false;
    }

    async checkAndFetch() {
        const isOpen = this.isMarketOpen();

        // NOTIFICATION: Detect State Transition
        if (this.lastMarketStatus !== undefined && this.lastMarketStatus !== isOpen) {
            if (isOpen) {
                logger.info('[MarketDataService] Market OPENED - Sending Notifications');
                emitMarketOpened();
            } else {
                logger.info('[MarketDataService] Market CLOSED - Sending Notifications');
                emitMarketClosed();
            }
        }
        this.lastMarketStatus = isOpen;

        if (isOpen) {
            await this.fetchMarketData();
        }
    }

    async fetchMarketData() {
        const startTime = Date.now();
        logger.info('[MarketData] Starting Sync Cycle...');

        let dfmCount = 0;
        let adxCount = 0;

        // Parallel Fetch
        const [dfmResults, adxResults] = await Promise.allSettled([
            this.fetchDFM(),
            this.fetchADX()
        ]);

        // Process DFM
        if (dfmResults.status === 'fulfilled') {
            await this.processResults(dfmResults.value);
            dfmCount = dfmResults.value.length;
        } else {
            logger.error('[MarketData] DFM Fetch Failed:', dfmResults.reason.message);
            this.sendTelegramAlert(`⚠️ DFM Fetch Failed: ${dfmResults.reason.message}`);
        }

        // Process ADX
        if (adxResults.status === 'fulfilled') {
            await this.processResults(adxResults.value);
            adxCount = adxResults.value.length;
        } else {
            logger.error('[MarketData] ADX Fetch Failed:', adxResults.reason.message);
            this.sendTelegramAlert(`⚠️ ADX Fetch Failed: ${adxResults.reason.message}`);
        }

        logger.info(`[MarketData] Sync Complete in ${Date.now() - startTime}ms. Updated: DFM(${dfmCount}) ADX(${adxCount})`);
    }

    // --- DFM Strategy: Yahoo Finance API ---
    async fetchDFM() {
        const quotes = await yahooFinance.quote(MASTER_LIST_DFM);
        return quotes.map(q => ({
            symbol: q.symbol,
            exchange: 'DFM',
            price: q.regularMarketPrice || 0,
            change: q.regularMarketChange || 0,
            changePercent: q.regularMarketChangePercent || 0,
            high: q.regularMarketDayHigh || 0,
            low: q.regularMarketDayLow || 0,
            open: q.regularMarketOpen || 0,
            prevClose: q.regularMarketPreviousClose || 0,
            volume: q.regularMarketVolume || 0,
            currency: 'AED',
            shortName: q.shortName || q.symbol,
            lastUpdated: new Date()
        }));
    }

    // --- ADX Strategy: Official Portal API Interception ---
    async fetchADX() {
        let browser = null;
        try {
            logger.info('[ADX] Launching Interceptor...');
            browser = await puppeteer.launch({
                headless: "new",
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });
            const page = await browser.newPage();

            // Optimization: Block visuals to speed up load
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const type = req.resourceType();
                if (['image', 'font', 'stylesheet', 'media'].includes(type)) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            // The Golden Ticket: Capture the internal API Data
            let apiData = null;
            page.on('response', async response => {
                try {
                    if (response.url().includes('scrollingTicker')) {
                        const json = await response.json();
                        if (json && json.response && json.response.results) {
                            apiData = json.response.results;
                        }
                    }
                } catch (err) { /* ignore parse errors */ }
            });

            // Navigate
            await page.goto(ADX_PORTAL_URL, { waitUntil: 'networkidle2', timeout: 40000 });

            // Safety: Wait small buffer if networkidle fired too early
            if (!apiData) {
                await new Promise(r => setTimeout(r, 3000));
            }

            await browser.close();

            if (!apiData || apiData.length === 0) {
                throw new Error('ADX Interceptor found 0 records (API Payload missing).');
            }

            // Transform Data
            // ADX API Format: { companySymbol: 'FAB', lastTradedValue: 17.98, ... }
            const processed = apiData.map(item => {
                // Ensure symbol validity
                if (!item.companySymbol) return null;

                return {
                    symbol: `${item.companySymbol}.AD`, // Normalize to .AD for consistency
                    exchange: 'ADX',
                    price: item.lastTradedValue || 0,
                    change: item.changeValue || 0,
                    changePercent: item.changePercentage || 0,
                    high: 0, // Not in scrollingTicker, accept tradeoff for speed
                    low: 0,
                    open: 0,
                    prevClose: 0,
                    volume: 0, // Not in scrollingTicker
                    currency: 'AED',
                    shortName: item.displaySecCode || item.companySymbol,
                    lastUpdated: new Date()
                };
            }).filter(x => x !== null);

            return processed;

        } catch (error) {
            if (browser) await browser.close();
            throw error; // Let caller handle fallback/alert
        }
    }

    async processResults(dataList) {
        if (!dataList || dataList.length === 0) return;

        const bulkOps = [];
        for (const data of dataList) {
            // Update RAM
            marketCache.set(data.symbol, data);

            // Update DB
            bulkOps.push({
                updateOne: {
                    filter: { symbol: data.symbol },
                    update: { $set: data },
                    upsert: true
                }
            });
        }

        if (bulkOps.length > 0) {
            // Unordered for performance (don't stop on single error)
            await MarketData.bulkWrite(bulkOps, { ordered: false });
        }
    }

    // --- Alert System ---
    async sendTelegramAlert(message) {
        // Simple rate limiter
        const now = Date.now();
        if (now - this.lastAlertTime < this.ALERT_COOLDOWN) return;

        if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
            logger.warn('[Alert] Telegram Token missing.');
            return;
        }

        try {
            const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            await axios.post(url, {
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'Markdown'
            });
            this.lastAlertTime = now;
        } catch (e) {
            logger.error('[Alert] Send Failed:', e.message);
        }
    }

    // --- Public Getters ---
    getAll() {
        return Array.from(marketCache.values());
    }

    getByExchange(exchange) {
        // Filter from RAM - Instant
        const target = exchange.toUpperCase();
        const res = [];
        for (const [k, v] of marketCache) {
            if (v.exchange === target) res.push(v);
        }
        return res;
    }

    getBySymbol(symbol) {
        return marketCache.get(symbol.toUpperCase());
    }
}

module.exports = new MarketDataService();

