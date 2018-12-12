import fs from 'fs';
import config from 'config';
import request from 'request-promise';
import path from 'path';
import puppeteer from 'puppeteer';

const PAGES_TO_READ = 2000;
let SLEEP_AFTER_EACH_PARSING = 5000;
let SLEEP_BEFORE_NEXT_SOURCING = 60000 * 5;
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

async function initChrome(){
    const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
    const page = await browser.newPage();

    return { page, browser };
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
    const { page, browser } = await initChrome();
    await blockJS(page);

    const response = await page.goto(`${baseUrlForLinks}/${pageNum}`, { waitUntil: 'networkidle2' });
    if(response.status() === 403){
        SLEEP_BEFORE_NEXT_SOURCING *= 2
    }

    const hrefs = await page.$$eval(urlsListQuery, entries => entries.map(a => a.href));
    // await page.screenshot({path: 'screenshotOfPage.png'});

    setTimeout(async() =>{
        await browser.close();
    }, SLEEP_BEFORE_NEXT_SOURCING);

    return hrefs;
}

async function getEarningCallBlob(earningCallUrl){
    const { page, browser } = await initChrome();
    await blockJS(page);

    const response = await page.goto(`${earningCallUrl}?part=single`, { waitUntil: 'networkidle2' });
    if(response.status() === 403){
        SLEEP_AFTER_EACH_PARSING *= 2
    }

    const earningCallBlob = await page.evaluate(() => document.getElementById('a-cont').innerText);
    setTimeout(async () => {
        await browser.close();
    }, SLEEP_AFTER_EACH_PARSING);

    return earningCallBlob;
}


function parseEarningCall(earningCall, pageNum, iter, url){
    try{
        fs.writeFile(path.join(__dirname, `../storage/earningCall_${pageNum}_${iter}.txt`), `${url}\n\n${earningCall}`, 'utf-8', (err, result) => {
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
                console.log(`No earningUrls. pageNum: ${pageNum}`);
                await sleep(SLEEP_BEFORE_NEXT_SOURCING);
                continue;
            }

            for(let i = 0; i < earningUrls.length; i += 1){
                const earningCallUrl = earningUrls[i];
                const earningCallBlob = await getEarningCallBlob(earningCallUrl);
                parseEarningCall(earningCallBlob, pageNum, i, earningCallUrl);
                console.log(`done page ${pageNum}\t link #${i+1}`);

                await sleep(SLEEP_AFTER_EACH_PARSING);
            }

            await sleep(SLEEP_BEFORE_NEXT_SOURCING);
            pageNum += 1
        }
        catch(ex){
            console.error(`[ERROR] > getEarningCalls > pageNum: ${pageNum}`, ex);
        }
    }
}

getEarningCalls()
    .then()
    .catch(ex => { console.error('[ERROR] > getEarningCalls()', ex); });

