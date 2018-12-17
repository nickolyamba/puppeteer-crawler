import config from 'config';
import request from 'request-promise';
import puppeteer from 'puppeteer';
import {
    createStorageDir,
    saveEarningCall,
    saveUrls,
    logError
} from './utilities/storageUtils';

const PAGES_TO_READ = 5263;
const DEFAULT_HEADING = 'NO HEADING';
const PROXY_URL = null;
let SLEEP_AFTER_PAGE_PARSING = 10000;
let SLEEP_BEFORE_NEXT_SOURCING = 60000 * 2;
let browser = null;
let baseUrlsPage = null;
const { baseUrlForLinks, urlsListQuery } = config;

const headers = {
    // "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.132 Safari/537.36",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "cache-control": "no-cache"
};

async function sleep(time){
    return new Promise(resolve => setTimeout(resolve, time))
}

function setProxy(browserSettings) {
    if(PROXY_URL){
        const proxySetting = `--proxy-server=${PROXY_URL}`;
        if(!Array.isArray(!browserSettings.args)){
            browserSettings.args = [proxySetting]
        }
        else{
            browserSettings.args.push(proxySetting);
        }
    }
}

function getBrowserSettins() {
    const browserSettings = {
        headless: false,
        defaultViewport: null
    };
    setProxy(browserSettings);

    return browserSettings;
}

async function initChrome(){
    const browserSettings = getBrowserSettins();
    browser = await puppeteer.launch(browserSettings);
    const page = await browser.newPage();

    return page;
}

async function blockJS(page){
    await page.setRequestInterception(true);
    page.on('request', request => {
        if (request.resourceType() === 'script')
          request.abort();
        else
          request.continue();
    });
}

async function getUrlsList(pageNum){
    const prevPage = baseUrlsPage;
    baseUrlsPage = browser ? await browser.newPage() : await initChrome();
    if(prevPage) prevPage.close();
    await blockJS(baseUrlsPage);

    const response = await baseUrlsPage.goto(`${baseUrlForLinks}/${pageNum}`, { waitUntil: 'networkidle2' });
    if(response.status() === 403){
        SLEEP_BEFORE_NEXT_SOURCING *= 2;
        console.log(`Status Code = 403. pageNum: ${pageNum}. SLEEP_BEFORE_NEXT_SOURCING: ${SLEEP_BEFORE_NEXT_SOURCING/(1000*60)} min`);
        return [];
    }

    const listOfLinks = await baseUrlsPage.$$eval(urlsListQuery, entries => entries.map(a => a.href));

    return listOfLinks;
}

async function getEarningCallBlob(earningCallUrl){
    const page = await browser.newPage();
    await blockJS(page);

    const response = await page.goto(`${earningCallUrl}?part=single`, { waitUntil: 'networkidle2' });
    if(response.status() === 403){
        SLEEP_AFTER_PAGE_PARSING *= 2;
        throw new Error(`Status Code = 403. SLEEP_AFTER_EACH_PARSING: ${SLEEP_AFTER_PAGE_PARSING/1000} s`);
    }

    let heading = DEFAULT_HEADING;
    try{
        heading = await page.evaluate(() => document.getElementsByTagName('h1')[0].innerText);
    }
    catch(ex){
        logError('[ERROR] reading heading', earningCallUrl);
    }

    const bodyText = await page.evaluate(() => document.getElementById('a-cont').innerText);
    const earningCallText = `${heading}\n\n${bodyText}`;

    setTimeout(async () => {
        await page.close();
    }, SLEEP_AFTER_PAGE_PARSING);

    return earningCallText;
}


async function getEarningCalls(){
    let pageNum = 1;
    while(pageNum < PAGES_TO_READ){
        try{
            // Get list of urls
            const urlsToCrawl = await getUrlsList(pageNum);
            if(!Array.isArray(urlsToCrawl) || urlsToCrawl.length === 0){
                await sleep(SLEEP_BEFORE_NEXT_SOURCING);
                continue;
            }

            saveUrls(urlsToCrawl);

            let i = 0;
            while(i < urlsToCrawl.length){
                try{
                    const earningCallUrl = urlsToCrawl[i];
                    const earningCallBlob = await getEarningCallBlob(earningCallUrl);
                    saveEarningCall(earningCallBlob, pageNum, i, earningCallUrl);
                    console.log(`Done: page #${pageNum}\t link #${i+1}`);
                    i += 1;
                }
                catch(ex){
                    console.error(`[ERROR] > getEarningCalls. pageNum: ${pageNum}, link# ${i+1}\n${ex}`);
                    await sleep(SLEEP_BEFORE_NEXT_SOURCING);
                }

                await sleep(SLEEP_AFTER_PAGE_PARSING);
            }

            await sleep(SLEEP_BEFORE_NEXT_SOURCING);
            pageNum += 1
        }
        catch(ex){
            console.error(`[ERROR] > getEarningCalls > pageNum: ${pageNum}`, ex);
        }
    }
}

createStorageDir();

getEarningCalls()
    .then()
    .catch(ex => { console.error('[ERROR] > getEarningCalls()', ex); });

