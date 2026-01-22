const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function debugDfmApi() {
    console.log('=== Debugging DFM Documents API ===\n');

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        // Capture network requests
        const requests = [];
        page.on('request', req => {
            const url = req.url();
            if (url.includes('feeds.dfm') || url.includes('document') || url.includes('.pdf')) {
                requests.push({ url, method: req.method() });
            }
        });

        const responses = [];
        page.on('response', async res => {
            const url = res.url();
            if (url.includes('feeds.dfm') || url.includes('document')) {
                try {
                    const contentType = res.headers()['content-type'] || '';
                    let body = null;
                    if (contentType.includes('json')) {
                        body = await res.json().catch(() => null);
                    }
                    responses.push({
                        url,
                        status: res.status(),
                        contentType,
                        body: body ? JSON.stringify(body).substring(0, 1000) : null
                    });
                } catch (e) { }
            }
        });

        const testUrl = 'https://www.dfm.ae/the-exchange/news-disclosures/disclosures/13dcbace-9ccc-4adf-9224-71e647c90e14';
        console.log('Navigating to:', testUrl);
        await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        await delay(5000);

        console.log('\n--- Network Requests (feeds.dfm/document) ---');
        requests.forEach(r => console.log(r.method, r.url));

        console.log('\n--- Network Responses (feeds.dfm/document) ---');
        responses.forEach(r => {
            console.log('\nURL:', r.url);
            console.log('Status:', r.status);
            console.log('Content-Type:', r.contentType);
            if (r.body) console.log('Body:', r.body);
        });

        // Try clicking the DOWNLOAD button to trigger the real request
        console.log('\n--- Trying to click DOWNLOAD button ---');
        const clicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, a'));
            for (const btn of buttons) {
                if (btn.innerText?.includes('DOWNLOAD') || btn.innerText?.includes('Download')) {
                    console.log('Found button:', btn.outerHTML);
                    btn.click();
                    return true;
                }
            }
            return false;
        });
        console.log('Clicked:', clicked);

        await delay(3000);

        console.log('\n--- After click - Additional Requests ---');
        requests.slice(-5).forEach(r => console.log(r.method, r.url));

        console.log('\n--- After click - Additional Responses ---');
        responses.slice(-3).forEach(r => {
            console.log('\nURL:', r.url);
            console.log('Status:', r.status);
            if (r.body) console.log('Body:', r.body);
        });

        await browser.close();
        console.log('\n=== Debug Complete ===');
    } catch (error) {
        console.error('Error:', error.message);
        if (browser) await browser.close();
    }
}

debugDfmApi();
