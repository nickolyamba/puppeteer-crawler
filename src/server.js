import fs from 'fs';
import config from 'config';
import request from 'request-promise';
import path from 'path';
import puppeteer from 'puppeteer';

const PAGES_TO_READ = 5263;
const STORAGE_DIR_PATH = '../storage';
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

function createDir(dirPath){
    const storageDir = path.join(__dirname, dirPath);
    try{
        if (!fs.existsSync(storageDir)){
            fs.mkdirSync(storageDir);
        }

        return true;
    }
    catch(ex){
        console.error(`[ERROR] > createStorageDir. Error creating dir '${storageDir}'\n`, ex);
    }

    return false;
}

function createStorageDir(){
    if(!createDir(STORAGE_DIR_PATH)){
        console.error(`\nCan\'t start without a storage directory ${STORAGE_DIR_PATH}`);
        process.exit();
    }
}

async function sleep(time){
    return new Promise(resolve => setTimeout(resolve, time))
}

async function logError(error, url) {
    const filePath = path.join(__dirname, `${STORAGE_DIR_PATH}/errors.csv`);
    fs.appendFile(filePath, `${error},${url}\n`, 'utf-8', (err) => {
        if(err){
            console.error('[ERROR] > logError ', err);
        }
    });
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

    const earningCallBlob = await page.evaluate(() => document.getElementById('a-cont').innerText);
    setTimeout(async () => {
        await page.close();
    }, SLEEP_AFTER_PAGE_PARSING);

    return earningCallBlob;
}


function parseEarningCall(earningCall, pageNum, iter, url){
    try{
        const filePath = path.join(__dirname, `${STORAGE_DIR_PATH}/earningCall_${pageNum}_${iter}.txt`);
        fs.writeFile(filePath, `${url}\n\n${earningCall}`, 'utf-8', (err) => {
            if(err){
                console.error('[ERROR] > parseEarningCall ', err);
            }
        });
    }
    catch(ex){
        console.error('[ERROR] > parseEarningCall', ex);
    }
}


async function getEarningCalls(){
    let pageNum = 1;
    while(pageNum < PAGES_TO_READ){
        try{
            // Get list of urls
            const earningUrls = await getUrlsList(pageNum);
            if(!Array.isArray(earningUrls) || earningUrls.length === 0){
                await sleep(SLEEP_BEFORE_NEXT_SOURCING);
                continue;
            }

            let i = 0;
            while(i < earningUrls.length){
                try{
                    const earningCallUrl = earningUrls[i];
                    const earningCallBlob = await getEarningCallBlob(earningCallUrl);
                    parseEarningCall(earningCallBlob, pageNum, i, earningCallUrl);
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

