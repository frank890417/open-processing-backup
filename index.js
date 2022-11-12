import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import request from 'request'
import https from 'https'
import puppeteer from "puppeteer"
import * as dotenv from 'dotenv'

import decompress from "decompress"
dotenv.config()

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function awaitFileDownloaded(filePath) {
    let timeout = 10000
    const delay = 300

    return new Promise(async (resolve, reject) => {
        while (timeout > 0) {
            if (fs.existsSync(filePath)) {
                resolve(true);
                return
            } else {
                await sleep(delay)
                timeout -= delay
            }
        }
        reject("awaitFileDownloaded timed out")
    });
}

function makeDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir)
    }
}
let __dirname = "./sketches"
console.log(__dirname)
let apiUrl = `https://www.openprocessing.org/api/user/${process.env.USERID}/sketchs.json`

function getThumbnail(item) {
    return `https://openprocessing-usercontent.s3.amazonaws.com/thumbnails/visualThumbnail${item.visualID}@2x.jpg`
}
function getZipUrl(item) {
    return `https://openprocessing.org/sketch/${item.visualID}/download/sketch${item.visualID}.zip`
}

async function downloadFile(url, targetFile) {
    return await new Promise((resolve, reject) => {
        https.get(url, response => {
            const code = response.statusCode ?? 0

            if (code >= 400) {
                return reject(new Error(response.statusMessage))
            }

            // handle redirects
            if (code > 300 && code < 400 && !!response.headers.location) {
                return downloadFile(response.headers.location, targetFile)
            }

            // save the file to disk
            const fileWriter = fs
                .createWriteStream(targetFile)
                .on('finish', () => {
                    resolve({})
                })

            response.pipe(fileWriter)
        }).on('error', error => {
            reject(error)
        })
    })
}



async function login() {
    console.log("logging in")
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 720 });
    //networkidle0
    await page.goto('https://openprocessing.org/signin', { waitUntil: 'domcontentloaded' }); // wait until page load
    await page.type('[name="username"]', process.env.USERNAME);
    await page.type('[name="password"]', process.env.PASSWORD);
    // click and wait for navigation
    await Promise.all([
        page.click('#joinModal_submitButton'),
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    ]);
    return { browser, page }
}


async function main() {
    let { browser, page } = await login()

    fs.rmSync("sketches", { recursive: true, force: true });
    makeDir("sketches")
    fetch(apiUrl)
        .then(response => response.json())
        .then(async data => {
            console.log(data);
            fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(data, null, 2));
            let visuals = data.user.visuals
            for (let i = 0; i < visuals.length; i++) {
                let visual = visuals[i]
                let id = visual.visualID
                let title = visual.title
                let coverUrl = getThumbnail(visual)
                let zipUrl = getZipUrl(visual)
                let sketchDirName = `[${id}] ${title}`
                // let sketchPageUrl = `https://openprocessing.org/sketch/${id}/embed/`
                console.log(`Downloading (${i}/${visuals.length})`, id, title)
                makeDir(path.join(__dirname, sketchDirName))
                fs.writeFileSync(path.join(path.join(__dirname, sketchDirName), 'info.json'), JSON.stringify(visual, null, 2));

                // console.log(coverUrl)
                await downloadFile(coverUrl, path.join(__dirname, sketchDirName, `${id}.jpg`))

                // console.log(sketchPageUrl)
                // await downloadFile(sketchPageUrl, path.join(__dirname, sketchDirName, `${id}.html`))
                const workPage = await browser.newPage();
                await workPage.goto(`https://openprocessing.org/sketch/${id}`, { waitUntil: 'domcontentloaded' })

                const client = await workPage.target().createCDPSession()
                await client.send('Page.setDownloadBehavior', {
                    behavior: 'allow',
                    downloadPath: path.join(__dirname, sketchDirName)
                });

                await sleep(200)
                // console.log("open panel")
                await workPage.click('[data-target="#shareSidePanel"]')
                await sleep(200)
                // console.log("click download link")
                await workPage.click('#share_download a')
                let downloadedZipFile = path.join(__dirname, sketchDirName, `sketch${id}.zip`)
                await awaitFileDownloaded(downloadedZipFile)
                // await sleep(500)
                await decompress(downloadedZipFile, path.join(__dirname, sketchDirName, `sketch${id}`))
                await workPage.close()

                // await workPage.goto(zipUrl, { waitUntil: 'networkidle0' });

            }
        });

}
main()
