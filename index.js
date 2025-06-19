const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs');
const path = require('path');

// --- NOTES ---
//
// Modified from original version to do the following, if parameter 'eng' is added when running:
//
// — Downloads English audio track in addition to video files. 
//
// — After downloading, merges all video files with the English audio file (replacing the original audio) into a file named '*.en.mp4'.
//
// — — If CONFIGURATION > enable_cleanup is 'true': moves the original video file and the English audio file to a subfolder named '_cleanup_*' post-merge. Also runs cleanup on files in existing merge file ('*.en.mp4') found. Default: 'true'.
//
// — — If CONFIGURATION > enable_cleanup_consolidation is 'true' (and enable_cleanup is also 'true'): moves all '_cleanup_*' folders to a folder named '_cleanup' in the course root download folder. Also moves all existing '_cleanup_*' folders if found. Default: 'true'.
//
// — After running, removes the 'final project' folder if empty.
//
// — Skips downloading files if already downloaded.
//
// — Skips downloading files if '*.en.mp4' (merged) file already present.
//
// — Is _NOT_ capable of discerning language of video files / course! Will happily merge video + English audio file, even if original language of video is English!
// 
// — Tested on MacOS; _NOT_ tested on Windows. YMMV.
// 
// — Nobody Expects The Spanish Inquisition. 
// 
// --- RUNNING ---
// 
// A) To Run NORMALLY (no downloading or merging of English audio track):   
// $ npm run start
//
// B) To Run with FORCED ENGLISH AUDIO (merged into '*.en.mp4'):
// $ npm run start eng
//
// See README.md for further notes.


// --- CONFIGURATION ---
const debug = false;
const debug_data = [];

// Cleanup options (only relevant if 'eng' is passed at Run)
const enable_cleanup = true; // 'true' or 'false'. If 'true', moves original files to a subfolder post-merge
const enable_cleanup_consolidation = true; // 'true' or 'false'; if 'true', moves all cleanup subfolders to a folder named '_cleanup' at the course root folder


const course_urls = ['YOUR_COURSE_URLs_HERE', 'YOUR_COURSE_URLs_HERE'];

const subtitle_lang = 'en';
// Specifiy your OS either as 'win' for Windows machines or 'mac' for MacOS/Linux machines
const machine_os = 'YOUR_OS_HERE';

// Cookie used to retreive video information
const cookies = [
    {
        name: '_domestika_session',
        value: 'YOUR_COOKIE_HERE',
        domain: 'www.domestika.org',
    },
];

// Credentials needed for the access token to get the final project
const _credentials_ = 'YOUR_CREDENTIALS_HERE';

// Leave as-is; can't currently be changed
const downloadEnglishAudio = process.argv.includes('eng');
// --- END CONFIGURATION ---

//Check if the N_m3u8DL-RE binary exists, throw error if not
const executable_name = machine_os === 'win' ? 'N_m3u8DL-RE.exe' : 'N_m3u8DL-RE';
if (fs.existsSync(executable_name)) {
    scrapeAllSites();
} else {
    throw Error('N_m3u8DL-RE binary not found! Download the Binary here: https://github.com/nilaoda/N_m3u8DL-RE/releases');
}

//Get access token from the credentials
const regex_token = /accessToken\":\"(.*?)\"/gm;
const access_token = regex_token.exec(decodeURI(_credentials_))[1];

async function scrapeAllSites(){
    for (const course_url of course_urls) {
        await scrapeSite(course_url);
    };
}


function findSchemaMarkup($, type) {
    let ldJsonScripts = $('script[type=application/ld+json]');
    // Loop through each application/ld+json
    for (let i = 0; i < ldJsonScripts.length; i++) {
        let jsonText = $(ldJsonScripts[i]).html().trim(); // Get the JSON
        try {
            let parsed = JSON.parse(jsonText); // try parsing JSON into object
            // JSON can contain the schema right away, or be an array of schemas
            // Make it be always an array of schemas so we can loop predictably
            let candidates = Array.isArray(parsed) ? parsed : [parsed];
            for (const entry of candidates) {
                if (entry['@context'].includes('schema.org') && entry['@type']===type) {
                    return entry; // Found the schema we were looking for
                }
            }
        } catch (err) {}
    }
    return null;
}

async function scrapeSite(course_url) {
    //Scrape site for links to videos
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(0);
    await page.setCookie(...cookies);

    await page.setRequestInterception(true);

    page.on('request', (req) => {
        if (req.resourceType() == 'stylesheet' || req.resourceType() == 'font' || req.resourceType() == 'image') {
            req.abort();
        } else {
            req.continue();
        }
    });

    await page.goto(course_url);
    const html = await page.content();
    const $ = cheerio.load(html);

    console.log('Scraping Site');
    schemaMarkup = findSchemaMarkup($, 'Course');

    let allVideos = [];
    let units = $('h4.h2.unit-item__title a');
    let title = schemaMarkup.name.trim().replace(/[/\\?%*:|"<>]/g, '-');

    let totalVideos = 1;
    let regex_final = /courses\/(.*?)-*\/final_project/gm;

    // Apply regext to all units to get the final project
    let final_project_id = units
        .map((i, element) => {
            let href = $(element).attr('href');
            let match = regex_final.exec(href);
            if (match) {
                return match[1].split('-')[0];
            } else {
                return null;
            }
        })
        .get();

    //Remove final project from the units
    units = units.filter((i, element) => {
        let href = $(element).attr('href');
        let match = regex_final.exec(href);
        if (match) {
            return false;
        } else {
            return true;
        }
    });

    console.log(units.length + ' Units Detected');

    //Get all the links to the m3u8 files
    for (let i = 0; i < units.length; i++) {
        let videoData = await getInitialProps($(units[i]).attr('href'), page);

        allVideos.push({
            title: $(units[i])
                .text()
                .replaceAll('.', '')
                .trim()
                .replace(/[/\\?%*:|"<>]/g, '-'),
            videoData: videoData,
        });

        totalVideos += videoData.length;
    }

    console.log('All Videos Found');

    if (final_project_id != undefined && final_project_id != null) {
        console.log('Fetching Final Project');
        let final_data = await fetchFromApi(`https://api.domestika.org/api/courses/${final_project_id}/final-project?with_server_timing=true`, 'finalProject.v1', access_token);

        if (final_data && final_data.data) {
            let final_video_data = final_data.data.relationships;
            if (final_video_data != undefined && final_video_data.video != undefined && final_video_data.video.data != undefined && final_data.data.relationships.video.data != null) {
                final_project_id = final_video_data.video.data.id;
                final_data = await fetchFromApi(`https://api.domestika.org/api/videos/${final_project_id}?with_server_timing=true`, 'video.v1', access_token);

                if (final_data.data.attributes.playbackUrl) {
                    allVideos.push({
                        title: 'Final project',
                        videoData: [
                            {
                                playbackURL: final_data.data.attributes.playbackUrl,
                                title: 'Final project',
                                section: 'Final project',
                            },
                        ],
                    });
                } else {
                    console.log('No video files found in Final Project');
                }
            }
        }
    }

    //Loop through all files and download them
    let count = 0;
    let downloadPromises = [];
    for (let i = 0; i < allVideos.length; i++) {
        const unit = allVideos[i];
        for (let a = 0; a < unit.videoData.length; a++) {
            const vData = unit.videoData[a];
            // Push the download promise to the array
            downloadPromises.push(downloadVideo(vData, title, unit.title, a));

            count++;
            console.log(`Download ${count}/${totalVideos} Started`);
        }
        // Wait for all downloads in the unit to complete
        await Promise.all(downloadPromises);
    }

    await page.close();
    await browser.close();

    if (debug) {
        fs.writeFileSync('log.json', JSON.stringify(debug_data));
        console.log('Log File Saved');
    }

    console.log('All Videos Downloaded');
    
    if (downloadEnglishAudio) {
        try {
            await mergeAudioVideoFiles(title);
        } catch (error) {
            console.error('Error during file merging:', error);
        }
    }
}

async function getInitialProps(url, page) {
    await page.goto(url);

    const data = await page.evaluate(() => window.__INITIAL_PROPS__);
    const html = await page.content();
    const $ = cheerio.load(html);

    let section = $('h2.h3.course-header-new__subtitle')
        .text()
        .trim()
        .replace(/[/\\?%*:|"<>]/g, '-');

    let videoData = [];

    if (data && data != undefined && data.videos != undefined && data.videos.length > 0) {
        for (let i = 0; i < data.videos.length; i++) {
            const el = data.videos[i];

            videoData.push({
                playbackURL: el.video.playbackURL,
                title: el.video.title.replaceAll('.', '').trim(),
                section: section,
            });

            console.log('Video Found: ' + el.video.title);
        }
    }

    return videoData;
}

async function fetchFromApi(apiURL, accept_version, access_token) {
    const response = await fetch(apiURL, {
        method: 'get',
        headers: {
            Authorization: `Bearer ${access_token}`,
            Accept: 'application/vnd.api+json',
            'Content-Type': 'application/vnd.api+json',
            'x-dmstk-accept-version': accept_version,
        },
    });

    if (!response.ok) {
        console.log('Error Fetching Data, check the credentials are still valid.');
        return false;
    }

    try {
        const data = await response.json();
        return data;
    } catch (error) {
        console.log(error);
        return false;
    }
}

async function downloadVideo(vData, title, unitTitle, index) {
    if (!vData.playbackURL) {
        console.log(`Skipping download for ${unitTitle} - no video files in this unit`);
        return;
    }

    let save_name = `${index}_${vData.title.trimEnd()}`
    let save_dir = `domestika_courses/${title}/${vData.section}/${unitTitle}/`
    if (!fs.existsSync(save_dir)) {
        fs.mkdirSync(save_dir, {
            recursive: true,
        });
    }

    // Check if files already exist
    const mp4Path = path.join(save_dir, `${save_name}.mp4`);
    const m4aPath = path.join(save_dir, `${save_name}.en.m4a`);
    const mergedPath = path.join(save_dir, `${save_name}.en.mp4`);
    
    // Skip if merged file exists or if both source files exist
    if (fs.existsSync(mergedPath) ||
        (fs.existsSync(mp4Path) && (!downloadEnglishAudio || fs.existsSync(m4aPath)))) {
        console.log(`Skipping download for ${unitTitle} - files already exist`);
        return;
    }

    const options = { maxBuffer: 1024 * 1024 * 10 };

    try {
        if (machine_os === 'win') {
            let log = await exec(`N_m3u8DL-RE -sv res="1080*":codec=hvc1:for=best "${vData.playbackURL}" --save-dir "${save_dir}" --tmp-dir "${save_dir}" --save-name "${save_name}"`, options);
            let log2 = await exec(`N_m3u8DL-RE --auto-subtitle-fix --sub-format SRT --select-subtitle lang="${subtitle_lang}":for=all "${vData.playbackURL}" --save-dir "${save_dir}" --tmp-dir "${save_dir}" --save-name "${save_name}"${downloadEnglishAudio ? ' -sa lang=en:for=best' : ''}`, options);
        } else {
            let log = await exec(`./N_m3u8DL-RE -sv res="1080*":codec=hvc1:for=best "${vData.playbackURL}" --save-dir "${save_dir}" --tmp-dir "${save_dir}" --save-name "${save_name}"${downloadEnglishAudio ? ' -sa lang=en:for=best' : ''}`);
            let log2 = await exec(`./N_m3u8DL-RE --auto-subtitle-fix --sub-format SRT --select-subtitle lang="${subtitle_lang}":for=all "${vData.playbackURL}" --save-dir "${save_dir}" --tmp-dir "${save_dir}" --save-name "${save_name}"`);
        }

        if (debug) {
            debug_data.push({
                videoURL: vData.playbackURL,
                output: [log, log2],
            });
        }
    } catch (error) {
        console.error(`Error downloading video in unit "${unitTitle}": ${error.message}`);
    }
}

// Function to merge audio and video files

async function checkFinalProjectFolder(courseTitle) {
    const finalProjectPath = `domestika_courses/${courseTitle}/Final project`;
    if (fs.existsSync(finalProjectPath)) {
        const files = fs.readdirSync(finalProjectPath);
        if (files.length === 0) {
            fs.rmdirSync(finalProjectPath);
            console.log(`Removed empty Final project folder: ${finalProjectPath}`);
        }
    }
}

async function mergeAudioVideoFiles(courseTitle) {
    // Check for empty Final project folder
    await checkFinalProjectFolder(courseTitle);
    
    if (!enable_cleanup) {
        console.log('Cleanup: Disabled in configuration');
        return;
    }

    const coursesDir = 'domestika_courses';
    const files = await findFiles(coursesDir, /\.en\.m4a$/);
    let movedFilesCount = 0;
    let existingCleanupFolders = 0;
    const cleanupFolders = new Set();
    
    // Count existing cleanup folders first
    const allCleanupFolders = await findFiles(coursesDir, /_cleanup_/);
    existingCleanupFolders = new Set(allCleanupFolders.map(f => path.dirname(f))).size;
    
    for (const audioFile of files) {
        const videoFile = audioFile.replace('.en.m4a', '.mp4');
        const outputFile = audioFile.replace('.en.m4a', '.en.mp4');
        const baseName = path.basename(audioFile).replace('.en.m4a', '');
        const cleanupDir = path.join(path.dirname(audioFile), `_cleanup_${baseName}`);
        
        // Skip if already in cleanup folder
        if (audioFile.includes('_cleanup_')) {
            continue;
        }

        // Check if merged file exists
        if (fs.existsSync(outputFile)) {
            // Move original files if they exist and merged file is present
            if ((fs.existsSync(videoFile) || fs.existsSync(audioFile)) && enable_cleanup) {
                if (!fs.existsSync(cleanupDir)) {
                    fs.mkdirSync(cleanupDir);
                }

                const movePromises = [];
                if (fs.existsSync(audioFile)) {
                    const newAudioPath = path.join(cleanupDir, path.basename(audioFile));
                    movePromises.push(fs.promises.rename(audioFile, newAudioPath));
                }
                if (fs.existsSync(videoFile)) {
                    const newVideoPath = path.join(cleanupDir, path.basename(videoFile));
                    movePromises.push(fs.promises.rename(videoFile, newVideoPath));
                }

                if (movePromises.length > 0) {
                    await Promise.all(movePromises);
                    movedFilesCount++;
                    cleanupFolders.add(path.dirname(audioFile));
                    console.log(`Cleanup: Moved original files to ${cleanupDir}`);
                }
            }
            continue;
        }
        
        // Proceed with merge if needed
        if (fs.existsSync(videoFile)) {
            try {
                await exec(`ffmpeg -i "${videoFile}" -i "${audioFile}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 "${outputFile}"`);
                console.log(`Merged: ${outputFile}`);
                
                // Move original files after successful merge
                if (enable_cleanup) {
                    if (!fs.existsSync(cleanupDir)) {
                        fs.mkdirSync(cleanupDir);
                    }

                    const movePromises = [];
                    const newAudioPath = path.join(cleanupDir, path.basename(audioFile));
                    movePromises.push(fs.promises.rename(audioFile, newAudioPath));
                    
                    const newVideoPath = path.join(cleanupDir, path.basename(videoFile));
                    movePromises.push(fs.promises.rename(videoFile, newVideoPath));

                    await Promise.all(movePromises);
                    movedFilesCount++;
                    cleanupFolders.add(path.dirname(audioFile));
                    console.log(`Cleanup: Moved original files to ${cleanupDir}`);
                }
                
            } catch (error) {
                console.error(`Error processing ${audioFile}: ${error}`);
            }
        }
    }

    // Consolidate cleanup folders if enabled
    if (enable_cleanup_consolidation) {
        const consolidatedDir = path.join(coursesDir, '_cleanup');
        if (!fs.existsSync(consolidatedDir)) {
            fs.mkdirSync(consolidatedDir, { recursive: true });
        }

        // Find all cleanup folders in the course directory
        const allCleanupFolders = await findFiles(coursesDir, /_cleanup_/);
        const cleanupDirs = new Set();
        
        // Get all unique cleanup directories
        allCleanupFolders.forEach(file => {
            const dir = path.dirname(file);
            if (dir.includes('_cleanup_')) {
                cleanupDirs.add(dir);
            }
        });

        // Process all cleanup directories
        for (const sourceDir of cleanupDirs) {
            try {
                const dirName = path.basename(sourceDir);
                const destDir = path.join(consolidatedDir, dirName);
                
                await fs.promises.rename(sourceDir, destDir);
                console.log(`Cleanup: Moved ${sourceDir} to ${destDir}`);
            } catch (error) {
                console.error(`Error moving ${sourceDir}: ${error}`);
            }
        }
    }

    // Final cleanup status report
    if (movedFilesCount > 0) {
        console.log(`Cleanup: Moved original files for ${movedFilesCount} videos`);
    } else {
        console.log('Cleanup: No new files needed to be moved');
    }
    
    if (existingCleanupFolders > 0) {
        console.log(`Cleanup: Found ${existingCleanupFolders} existing cleanup folders`);
    }
    
    if (enable_cleanup_consolidation) {
        console.log(`Cleanup: Consolidation ${movedFilesCount > 0 || existingCleanupFolders > 0 ? 'completed' : 'skipped - no folders to consolidate'}`);
    }
}

// Helper function to find files recursively
function findFiles(dir, pattern) {
    let results = [];
    
    if (!fs.existsSync(dir)) {
        console.log(`Directory ${dir} does not exist, skipping merge`);
        return results;
    }
    
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            results = results.concat(findFiles(fullPath, pattern));
        } else if (pattern.test(fullPath)) {
            results.push(fullPath);
        }
    }
    
    return results;
}

