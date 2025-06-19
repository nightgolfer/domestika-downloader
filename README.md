# Node JS Tool to download full courses from Domestika (Forced English audio mod)

## Notes on modifications made to original script:

### NOTES

Modified from original version to do the following, if parameter 'eng' is added when running:

- Downloads English audio track in addition to video files. 
- After downloading, merges all video files with the English audio file (replacing the original audio) into a file named '*.en.mp4'.
- - If CONFIGURATION > enable_cleanup is 'true': moves the original video file and the English audio file to a subfolder named '_cleanup_*' post-merge. Also runs cleanup on files in existing merge file ('*.en.mp4') found. Default: 'true'.
- - If CONFIGURATION > enable_cleanup_consolidation is 'true' (and enable_cleanup is also 'true'): moves all '_cleanup_*' folders to a folder named '_cleanup' in the course root download folder. Also moves all existing '_cleanup_*' folders if found. Default: 'true'.
- After running, removes the 'final project' folder if empty.
- Skips downloading files if already downloaded.
- Skips downloading files if '*.en.mp4' (merged) file already present.
- Is _NOT_ capable of discerning language of video files / course! Will happily merge video + English audio file, even if original language of video is English!
- Tested on MacOS; _NOT_ tested on Windows. YMMV.
- Nobody Expects The Spanish Inquisition. 

### RUNNING

A. To Run NORMALLY (no downloading or merging of English audio track):   
   ```$ npm run start```

B. To Run with FORCED ENGLISH AUDIO (merged into '*.en.mp4'):
   ```$ npm run start eng```


### TODO

- Explore if user's "My Courses" page can be parsed to fetch all purchased courses in one go.
- Add ability to add a single course URL as a parameter on Run (ignoring course_urls).
- Explore options for enabling merging other languages than English (not sure if courses are ever dubbed into other languages than English)
- Make terminal output nicer / more informative ("currently downloading [course name]", download progress indicators, etc.)
- Add extra space between 'Ux' and trailing dash in unit folder names (e.g.: "U1-" -> "U1 -")
- Explore options for creating a complete .M3U playlist of the full course.
- Explore making terminal experience interactive (prompt user for course URL if course_urls is empty, custom download folder, etc.)


## Original README content follows.


This script is a simple way to download a full course from Domestika.

> **Warning**
> You need to own the course you want to download. So you either have to have bought it or got it for "free" with your premium account.

## Installation

Once you downloaded the Project, open the "index.js" file.

You will find the following variables:

```javascript
  const course_url = "";
  const subtitle_lang = "en";
  const machine_os = "";
  const cookies;
  const _credentials_ = "";
```

The `course_url` is just the full URL of the course you want to download. For example:

https:www.domestika.org/en/courses/3086-creating-animated-stories-with-after-effects/course

IMPORTANT: you have to be on the "content" page. You know you are on the right site when at the end of the URL it says "/course".

To get the _domestika_session and the \_credentials_ you will need to install a chrome extension called Cookie-Editor.

After you installed the extension, log into domestika and open the extension.

In the window popup, look for "\_domestika_session", click to open it and copy the contents of the Value field into the value field under cookies.

Then look for the "_credentials_" cookie, copy the value of that into the "_credentials_" variable.

If you want to change the subtitles that will be downloaded, just put the preferred language into the "subtitle_lang" variable. But make sure the language is avaiable first.

The machine_os is just to specify whether the machine you are on is Windows or MacOS/Linux. If you are on a Windows machine, be sure to set:
```javascript
const machine_os = "win";
```
Otherwise if you are on MacOS or Linux:
```javascript
const machine_os = "mac";
```

Before you can start it, you have to download N_m3u8DL-RE from here: https:github.com/nilaoda/N_m3u8DL-RE/releases. Get the lastest version binary and place it in the root directory of the folder. To do so, simply scroll down to the 'Assets' section and download the appropriate binary based on your machine. Note there are binaries for Windows (on arm64 and x64 architectures), MacOS (on arm64 and x64 architectures) and Linux (on arm64 and x64 architectures). Download the compressed file that corresponds to your machine and architecture, unzip it, then place the binary in this repo's root folder. 

NOTE: For Windows, the file will be called "N_m3u8DL-RE.exe", while on MacOS and Linux, the file will be called "N_m3u8DL-RE". Do not change these names.

Also be sure you have ffmpeg installed.

After you have done that, navigate to the repo, open a terminal and type

```bash
npm i
```

After that, to start the script type

```bash
npm run start
```

NOTE: On MacOS and Linux, depending on your perimssions, you may encounter an error from `N_m3u8DL-RE`:
```bash
N_m3u8DL-RE: Permission denied
```

If this occurs, open a terminal and grant execute permissions for the binary:
```bash
chmod +x N_m3u8DL-RE
```
This should resolve the issue, and you can re-run the start command.

All the courses will be downloaded in a folder called "domestika_courses/{coursename}/".

## Special Thanks

Special thanks to [@Cybasaint](https:www.github.com/Cybasaint) for helping with the project and giving me access to his domestika account for testing.
