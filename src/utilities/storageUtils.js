import fs from 'fs';
import path from 'path';
const STORAGE_DIR_PATH = '../../storage';

export function logError(error, url) {
    try{
        const filePath = path.join(__dirname, `${STORAGE_DIR_PATH}/errors.csv`);
        fs.appendFile(filePath, `${error}\t${url}\n`, 'utf-8', (err) => {
            if(err){
                console.error('[ERROR] > logError ', err);
            }
        });

        console.error(`${error}\t${url}\n`);
    }

    catch(ex){
        console.error('[ERROR] > logError', ex);
    }
}

export function createDir(dirPath){
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

export function createStorageDir(){
    if(!createDir(STORAGE_DIR_PATH)){
        console.error(`\nCan\'t start without a storage directory ${STORAGE_DIR_PATH}`);
        process.exit();
    }
}

export function saveEarningCall(earningCall, pageNum, iter, url){
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

export function saveUrls(urls){
    const filePath = path.join(__dirname, `${STORAGE_DIR_PATH}/urls.csv`);
    fs.appendFile(filePath, `${urls.join('\n')}\n`, 'utf-8', (err) => {
        if(err){
            logError('[ERROR] > saveUrls', err.message);
        }
    });
}