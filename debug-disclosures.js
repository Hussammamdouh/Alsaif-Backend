const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const DFM_URL = 'https://www.dfm.ae/ar/the-exchange/news-disclosures/disclosures';
const ADX_URL = 'https://www.adx.ae/ar-AE/Pages/NewsAndDisclosures.aspx';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function debugDFM() {
    console.log('=== Debugging DFM Disclosures Page ===');
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        await page.setViewport({ width: 1280, height: 1000 });

        console.log('Navigating to DFM...');
        await page.goto(DFM_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait extra time for dynamic content
        await delay(8000);

        // Capture page structure
        const pageInfo = await page.evaluate(() => {
            const info = {
                tables: [],
                divs: [],
                links: [],
                allRows: [],
                bodySnippet: document.body.innerHTML.substring(0, 3000)
            };

            // Check for tables
            document.querySelectorAll('table').forEach((table, i) => {
                info.tables.push({
                    id: table.id,
                    className: table.className,
                    rows: table.querySelectorAll('tr').length,
                    innerHTML: table.outerHTML.substring(0, 500)
                });
            });

            // Check for common disclosure containers
            const containers = document.querySelectorAll('[class*="disclosure"], [class*="listing"], [class*="news"], [class*="item"], .table-responsive, [class*="card"], [class*="content"]');
            containers.forEach((el, i) => {
                if (i < 15) {
                    info.divs.push({
                        tag: el.tagName,
                        id: el.id,
                        className: el.className,
                        childCount: el.children.length
                    });
                }
            });

            // Check for PDF links
            document.querySelectorAll('a[href*=".pdf"], a[href*="download"], a[href*="attachment"], a[href*="file"], a').forEach((link, i) => {
                if (i < 30 && link.href) {
                    info.links.push({
                        text: link.innerText?.trim().substring(0, 100),
                        href: link.href,
                        className: link.className
                    });
                }
            });

            // Check for rows with data
            document.querySelectorAll('tr, [class*="row"], [class*="item"], li, article').forEach((row, i) => {
                if (i < 30) {
                    const text = row.innerText?.trim().substring(0, 200);
                    if (text && text.length > 10) {
                        info.allRows.push({
                            tag: row.tagName,
                            className: row.className,
                            text: text
                        });
                    }
                }
            });

            return info;
        });

        console.log('\n--- Tables Found ---');
        console.log(JSON.stringify(pageInfo.tables, null, 2));

        console.log('\n--- Disclosure Containers ---');
        console.log(JSON.stringify(pageInfo.divs.slice(0, 10), null, 2));

        console.log('\n--- Links (first 15) ---');
        console.log(JSON.stringify(pageInfo.links.slice(0, 15), null, 2));

        console.log('\n--- Content Rows (first 10) ---');
        console.log(JSON.stringify(pageInfo.allRows.slice(0, 10), null, 2));

        console.log('\n--- Body Snippet (for structure analysis) ---');
        console.log(pageInfo.bodySnippet);

        await browser.close();
    } catch (error) {
        console.error('DFM Error:', error.message);
        if (browser) await browser.close();
    }
}

async function debugADX() {
    console.log('\n\n=== Debugging ADX Disclosures Page ===');
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        await page.setViewport({ width: 1280, height: 1000 });

        console.log('Navigating to ADX...');
        await page.goto(ADX_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // Accept cookies if present
        try {
            await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const acceptBtn = btns.find(b => b.innerText.includes('Accept') || b.innerText.includes('قبول'));
                if (acceptBtn) acceptBtn.click();
            });
            await delay(2000);
        } catch (e) { }

        // Wait extra time
        await delay(8000);

        // Capture page structure
        const pageInfo = await page.evaluate(() => {
            const info = {
                tables: [],
                divs: [],
                links: [],
                allRows: [],
                bodySnippet: document.body.innerHTML.substring(0, 3000)
            };

            // Check for tables
            document.querySelectorAll('table').forEach((table, i) => {
                info.tables.push({
                    id: table.id,
                    className: table.className,
                    rows: table.querySelectorAll('tr').length,
                    innerHTML: table.outerHTML.substring(0, 500)
                });
            });

            // Check for disclosure containers
            const containers = document.querySelectorAll('[class*="disclosure"], [class*="listing"], [class*="news"], [class*="item"], .rdt_Table, [class*="card"], [class*="content"]');
            containers.forEach((el, i) => {
                if (i < 15) {
                    info.divs.push({
                        tag: el.tagName,
                        id: el.id,
                        className: el.className,
                        childCount: el.children.length
                    });
                }
            });

            // Check for links
            document.querySelectorAll('a[href*=".pdf"], a[href*="download"], a[href*="attachment"], a[href*="Document"], a').forEach((link, i) => {
                if (i < 30 && link.href) {
                    info.links.push({
                        text: link.innerText?.trim().substring(0, 100),
                        href: link.href,
                        className: link.className
                    });
                }
            });

            // Check for rows
            document.querySelectorAll('tr, .rdt_TableRow, [class*="row"], li, article').forEach((row, i) => {
                if (i < 30) {
                    const text = row.innerText?.trim().substring(0, 200);
                    if (text && text.length > 10) {
                        info.allRows.push({
                            tag: row.tagName,
                            className: row.className,
                            text: text
                        });
                    }
                }
            });

            return info;
        });

        console.log('\n--- Tables Found ---');
        console.log(JSON.stringify(pageInfo.tables, null, 2));

        console.log('\n--- Disclosure Containers ---');
        console.log(JSON.stringify(pageInfo.divs.slice(0, 10), null, 2));

        console.log('\n--- Links (first 15) ---');
        console.log(JSON.stringify(pageInfo.links.slice(0, 15), null, 2));

        console.log('\n--- Content Rows (first 10) ---');
        console.log(JSON.stringify(pageInfo.allRows.slice(0, 10), null, 2));

        console.log('\n--- Body Snippet ---');
        console.log(pageInfo.bodySnippet);

        await browser.close();
    } catch (error) {
        console.error('ADX Error:', error.message);
        if (browser) await browser.close();
    }
}

(async () => {
    await debugDFM();
    await debugADX();
    console.log('\n=== Debug Complete ===');
})();
