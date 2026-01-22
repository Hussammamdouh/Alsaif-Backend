const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

async function verify(name, url, isDfm = false) {
    console.log(`Verifying ${name}...`);
    let browser;
    try {
        browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.setUserAgent(USER_AGENT);
        await page.setViewport({ width: 1280, height: 1000 });
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 50000 });

        if (isDfm) {
            await page.waitForFunction(() => document.body.innerText.includes('EMAAR'), { timeout: 30000 });
        } else {
            try {
                await page.evaluate(() => {
                    const btns = Array.from(document.querySelectorAll('button'));
                    const allBtn = btns.find(b => b.innerText.includes('Accept All'));
                    if (allBtn) allBtn.click();
                });
            } catch (e) { }
        }

        const collect = async () => {
            const symbols = new Set();
            for (let i = 0; i < 8; i++) {
                const batch = await page.evaluate((isDfm) => {
                    const container = isDfm ? (document.querySelector('.marketwatch-tabcontent') || document.body) : document.querySelector('#content-wrapper');
                    const selector = isDfm ? '.symbol, .security-symbol' : '.rdt_TableRow';
                    const rows = Array.from(document.querySelectorAll(selector));
                    const syms = rows.map(r => {
                        if (isDfm) return r.innerText.trim();
                        const a = r.querySelector('[data-column-id="Symbol"] a');
                        return a?.innerText.trim();
                    }).filter(t => t && /^[A-Z0-9_-]{3,15}$/.test(t) && !['PRICE', 'SYMBOL'].includes(t));

                    if (container) container.scrollBy(0, 1000);
                    return syms;
                }, isDfm);
                batch.forEach(s => symbols.add(s));
                await new Promise(r => setTimeout(r, 800));
            }
            return symbols;
        };

        const firstBatch = await collect();
        console.log(`${name} Initial set: ${firstBatch.size}`);

        if (isDfm) {
            try {
                await page.click('#categoryb-caption');
                await new Promise(r => setTimeout(r, 3000));
                const secondBatch = await collect();
                secondBatch.forEach(s => firstBatch.add(s));
                console.log(`${name} With Category B: ${firstBatch.size}`);
            } catch (e) { }
        }

        await browser.close();
        return firstBatch.size;
    } catch (e) {
        if (browser) await browser.close();
        return `Error: ${e.message}`;
    }
}

async function run() {
    const d = await verify('DFM', 'https://marketwatch.dfm.ae/', true);
    const a = await verify('ADX', 'https://www.adx.ae/all-equities', false);
    console.log(`\nFinal Validation: DFM(${d}) ADX(${a})`);
}

run();
