# API subs for asbplayer

Web app: https://zakwarsame.github.io/asbplayer/

<<<<<<< HEAD
[![GitHub Workflow Status (with event)](https://img.shields.io/github/actions/workflow/status/killergerbah/asbplayer/verify.yml)](https://github.com/killergerbah/asbplayer/actions/workflows/verify.yml)
[![Github All Releases](https://img.shields.io/github/downloads/killergerbah/asbplayer/total.svg)](https://github.com/killergerbah/asbplayer/releases)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/killergerbah)](https://github.com/sponsors/killergerbah)
[![Static Badge](https://img.shields.io/badge/donate-ko--fi-ed6760?label=donate)](https://ko-fi.com/killergerbah)
[![GitHub License](https://img.shields.io/github/license/killergerbah/asbplayer)](https://github.com/killergerbah/asbplayer?tab=MIT-1-ov-file)
[![Discord](https://img.shields.io/discord/962412001810849814?color=%237785cc)](https://discord.gg/ad7VAQru7m)
=======
This is a fork of [asbplayer](https://github.com/killergerbah/asbplayer) that adds automatic subtitle search and download functionality for anime sites. It works with the [Jimaku API](https://jimaku.cc/login) and [Anilist API](https://anilist.co/docs/api) to automatically detect anime titles and episodes on supported streaming sites.
>>>>>>> 4eab7df3 (feat: add automatically fetched subs dialog)

## Extension Installation

🦊 Firefox Addon: https://addons.mozilla.org/en-CA/firefox/addon/api-subs-for-asbplayer/

1. Go to the [Releases](https://github.com/zakwarsame/asbplayer/releases) page
2. Find the latest release
3. Under "Assets", download the appropriate file:

    - For Chrome/Chromium browsers: `api-subs-for-asbplayer-1.0.0-chromium.zip`
    - For Firefox: `api-subs-for-asbplayer-1.0.0-firefox.zip`
    - For Firefox Android: `api-subs-for-asbplayer-1.0.0-firefoxandroid.zip`

4. Install in your browser:
    - **Chrome/Chromium**:
        - Go to `chrome://extensions/`
        - Enable "Developer mode" (top right)
        - Drag and drop the downloaded ZIP file into the extensions page OR click "Load unpacked" and select the folder containing the extension files
    - **Firefox**:
        - Go to `about:addons`
        - Click the gear icon ⚙️ and select "Install Add-on From File..."
        - Select the downloaded ZIP file

## Extension Setup

1. Get an API key from [jimaku.cc](https://jimaku.cc)
    - You can get a free key by signing up on the site: https://jimaku.cc/account
    - Generate an API key under the "API" heading and copy it
2. Open asbplayer settings, click on the "Misc" tab and enter your API key in the "API Key" field

## New Features

### Extension Features

<<<<<<< HEAD
[@Renji-XD](https://www.github.com/Renji-XD),
[@MatiasIslaA](https://www.github.com/MatiasIslaA),
[@cyphar](https://www.github.com/cyphar),
[@alexbofa](https://www.github.com/alexbofa),
[@Zyphdoz](https://github.com/Zyphdoz),
[@artjomsR](https://github.com/artjomsR),
[@iam6lake](https://github.com/iam6lake),
[@bpwhelan](https://github.com/bpwhelan),
[@pooky-programs](https://github.com/pooky-programs),
[@m-edlund](https://github.com/m-edlund),
[@nekorushi](https://github.com/nekorushi),
[@Viterkim](https://github.com/Viterkim),
[@s-cork](https://github.com/s-cork),
[@shekhirin](https://github.com/shekhirin),
[@ShanaryS](https://github.com/ShanaryS),
[@kayden1940](https://github.com/kayden1940),
[@eltociear](https://github.com/eltociear),
[@MarvNC](https://github.com/MarvNC),
[@mcgrizzz](https://github.com/mcgrizzz)
=======
- **Automatic Anime Detection**: Automatically detects anime titles and episodes on supported streaming sites
- **Subtitle Search**: Search and download subtitles directly through the asbplayer interface using the Jimaku API
- **Supported Sites**:
    - hianime.to
    - miruro.tv
    - More sites can be easily added
>>>>>>> 4eab7df3 (feat: add automatically fetched subs dialog)

### Web app features

[Click here to view the web app](https://zakwarsame.github.io/asbplayer/)

- A new button in the top left corner next to the "files" icon that allows you to search for subtitles
- Clicking opens a modal with fields for API key, anime title, episode number and a search button
- When a result is found, it will be loaded into the player automatically

## Usage

1. Go to a supported anime streaming site
2. Open the side panel (click the asbplayer icon from the extensions section and click "Open Side Panel")
3. Choose "Load Subtitles"
4. When you open the subtitle selector, you'll see additional fields for episode number and a search button
5. The anime title and episode will be automatically detected
6. Click search to find and load available subtitles

**Extension demo:**

https://github.com/user-attachments/assets/08be7905-fe75-4ef4-8424-0ea20753e5af

**Web app demo:**

https://github.com/user-attachments/assets/5a7f0c93-5c30-49bc-a816-04441a53bddc

## How it Works

The extension:

<<<<<<< HEAD
## Community guides

Text guides:

-   [Shiki's Lazy Sentence Mining Workflow (Japanese)](https://docs.google.com/document/d/e/2PACX-1vQuEAoZFoJbULZzCJ3_tW7ayT_DcQl9eDlrXMnuPGTwDk62r5fQrXak3ayxBsEgkL85_Z-YY5W4yUom/pub)
-   [Sentence mining from Netflix and YouTube with asbplayer (Japanese)](https://soyuz18.notion.site/Sentence-mining-from-Netflix-and-YouTube-with-asbplayer-83a03590cd8349ba81ca10340645b565)
-   [Refold's Anki guide](https://refold.la/roadmap/stage-1/a/anki-setup)

Video guides:

-   [Refold's installation and basic usage guide](https://www.youtube.com/watch?v=GYsf-NOVoYc)
-   [Refold's sentence mining guide (European languages)](https://youtu.be/jXO4gmCmcNE?si=u-8F7L7PWgdsXK5t&t=678)
-   [Sentence Mining: Learning Japanese From Anime (Japanese)](https://www.youtube.com/watch?v=B60cj69MSmA)
-   [How to Setup and Use ASBPlayer for Vocab Mining (Japanese)](https://www.youtube.com/watch?v=D1tlb7zo8Og&ab_channel=pooks_)

## Demos

-   [3 ways to mine streaming video with asbplayer](https://www.youtube.com/watch?v=HrIJZ6cUMFw)
-   [Sentence mining a video file with asbplayer](https://www.youtube.com/watch?v=BSr_JusW8E8)

## Detailed usage

To use asbplayer with streaming video, install the [browser extension](https://github.com/killergerbah/asbplayer/releases/latest). Otherwise, use the [website](https://killergerbah.github.io/asbplayer/).

In order to make use of any of asbplayer's features, subtitles (or an empty subtitle track) must first be loaded, either onto a streaming video or a local video file. The following section instructs how to do this.

---

### Subtitle features

#### Enhancing streaming video with asbplayer-controlled subtitles

There are a number of ways to load subtitles onto streaming video:

1. Drag-and-drop a subtitle file into the video element you want to enhance.
2. Load a subtitle file into the [asbplayer website](https://killergerbah.github.io/asbplayer/) and click on the camera in the bottom right to pick a video element to enhance. This is the recommended way to load BluRay subtitle files onto streaming video.
3. Use <kbd>Ctrl + Shift + F</kbd> to select a video element to enhance. From the dialog that appears you can choose whether to load an [auto-detected subtitle track](#subtitle-track-detection-for-streaming-video) or an empty one.
4. Open the side panel (<kbd>\`</kbd> button or `Open Side Panel` from the extension popup). When a video element is on screen, click on the `Load Subtitles` button to open the same subtitle track selector in (3).
5. Right click on a video element and click "asbplayer" → "Load subtitles."

asbplayer features will then be accessible for that video.

#### Enhancing local video files with asbplayer-controlled subtitles

Drag-and-drop media and subtitle files into the [asbplayer website](https://killergerbah.github.io/asbplayer/) to load them. asbplayer features will then be accessible for those files. Not all media files may be compatible - see the [Browser Compatibility](#browser-compatibility) section.

#### Adjusting subtitle offset

Use <kbd>Ctrl + Left/Right</kbd> to adjust subtitle offset so that the previous/next subtitle appears at the current timestamp. Then use <kbd>Ctrl + Shift + Left/Right</kbd> for finer adjustment by 100ms increments.

If you are using the asblayer website, you can also use the `Subtitle Offset` text field available in the controls UI.

#### Subtitle track detection for streaming video

Use <kbd>Ctrl + Shift + F</kbd> to see auto-detected subtitle tracks for streaming video. Below are the sites where automatic subtitle detection is supported:

-   Netflix
-   Youtube
-   Disney Plus (known issues: flakey video detection, subtitles sometimes off by ~5 seconds)
-   Hulu
-   TVer
-   Bandai Channel
-   Amazon Prime (known issue: subtitles sometimes off by ~30 seconds)
-   Emby
-   Jellyfin
-   Rakuten Viki
-   osnplus
-   BiliBili
-   Yle Areena

<kbd>Ctrl + Shift + F</kbd> also allows you to load an empty subtitle track so that you can extract audio and screenshots from streaming video without loading subtitles.

#### Filtering subtitle text

If you'd like to filter out specific instances subtitle text, one way to do so is by using a regular expression (regex). asbplayer can match any sequence following a specified regex pattern and remove the matches.

Under the MISC section in asbplayer settings, locate the "Subtitle regex filter" textbox. Enter an appropriate regex to filter desired content.
You can replace filtered content similarly by entering a string into the "Subtitle regex filter text replacement" textbox. Leaving this blank will simply remove the content.

Useful examples of regular expressions:

-   `([\(（]([^\(\)（）]|(([\(（][^\(\)（）]+[\)）])))+[\)）])` : Remove names enclosed by parenthesis to indicate speakers (e.g. "**（山田）**　元気ですか？")
-   `(.*)\n+(?!-)(.*)` : Some subtitles are split in several lines and this regex forces them into a single line. For this filter to work, you must also put `$1 $2` in the "Subtitle regex filter text replacement" field.
    -   **NB**: When using this regex pattern in combination with other patterns (using the `|` operator, see below), place this pattern at the end. This ensures that all other regex transformations are applied first, and then the results are finally combined into a single line.
-   `-?\[.*\]` : Remove indications enclosed by square brackets that sound or music that is playing (e.g. "**\[PLAYFUL MUSIC]**" or "**\-[GASPS]**")
    -   `^[\-\(\)\.\s\p{Lu}]+$` : As an alternative to the above, filter out descriptions written in capital letters, but without the square brackets (e.g. "**PLAYFUL MUSIC**"). If your language has additional letters with diacritics, you feel free to add them to this list.
-   `[♪♬#～〜]+` : Any combination of symbols on their own that represent playing music (e.g. `♪♬♪`)

Regular expressions can be combined with the character `|` (no spaces needed inbetween). E.g., if you want to use the 2 last regexes from this list, you can use `-?\[.*\]|[♪♬#～〜]+`. You can combine as many regexes as you wish this way.

Learn how to write and test custom regular expressions at [Regex Learn - Playground](https://regexlearn.com/playground).

#### Downloading subtitle files

Once loaded into the extension, you can download the subtitles by opening the side panel and clicking the `Download Subtitles as SRT` button in the top-right. You can also download subtitles via the website by clicking the same download button in the top-left.

> Note: Using the [regex feature](#filtering-subtitle-text) will alter the .srt that is downloaded.

---

### Anki integration

#### Creating Anki flashcards

Make sure [Anki](https://apps.ankiweb.net/) and [AnkiConnect](https://ankiweb.net/shared/info/2055492159) are installed. Integration with AnkiConnect can be configured in the [settings](https://killergerbah.github.io/asbplayer/?view=settings) as in this [video](https://youtu.be/Mv7fEVb6PHo?t=44).

When a subtitle that you want to mine appears, use <kbd>Ctrl + Shift + X</kbd> to open the flashcard creator.

See the [keyboard shortcuts](https://killergerbah.github.io/asbplayer/?view=settings#keyboard-shortcuts) for other ways to interact with and create cards.

#### Adjusting Anki flashcards

All text fields can be edited from the flashcard creator prior to flashcard creation.

Adjust the selected time interval for the card using the slider at the bottom of the export dialog.
The newly selected time interval can be applied to the card using the buttons available in the sentence and audio sections of the card. See this [video](https://youtu.be/BSr_JusW8E8?t=34) for a demo.

---

### Other basic features

#### Keyboard shortcuts

Keyboard shortcuts are customizable from the [settings](https://killergerbah.github.io/asbplayer/?view=settings#keyboard-shortcuts) or from accessing the extension directly. Once asbplayer has been bound to a video, you can use the keyboard shortcuts to access most of asbplayer's features.

#### Extension side panel UI

Most of the extension features detailed above can be accessed through the extension's side panel UI. The side panel can be opened with the <kbd>\`</kbd> button or `Open Side Panel` from the extension popup.

#### Extension video overlay

By default some UI appears at the top of streaming video when it is paused. It can be toggled on/off from the [settings](https://killergerbah.github.io/asbplayer/?view=settings#streaming-video). It exists primarily to make it possible to sentence mine on Kiwi Browser for Android, with buttons/fields to mine a subtitle, load subtitles, and adjust subtitle offset.

#### Audio track selection for mkv files

An audio track selector will appear for `mkv` files if experimental web platform features are enabled from `chrome://flags`. Note that enabling this flag may cause issues with other features of asbplayer, such as card creation through the Chrome extension.

---

### Advanced features

#### One-click mining flow

asbplayer can be setup to support one-click mining workflows by integrating with other tools via its [WebSocket interface](#websocket-interface) and a locally-running proxy that intercepts AnkiConnect traffic. Below are steps to set up such a workflow using Yomitan:

1. Install [Go](https://go.dev/doc/install).
2. Clone this repository and start the AnkiConnect proxy server:
    ```
    cd scripts/web-socket-server
    go run main.go
    ```
3. Enable asbplayer's WebSocket client from the [settings](https://killergerbah.github.io/asbplayer?view=settings#misc-settings).
4. Point Yomitan at the proxy by configuring `http://127.0.0.1:8766` for the AnkiConnect URL.
5. Configure Yomitan to use the same note type you have configured for asbplayer.
6. Using Yomitan's `+` button on asbplayer subtitles will now trigger the flashcard creator with word and definition fields pre-populated by Yomitan.

The proxy is very lightweight, so it's fine to leave it running in the background. On Windows, [RBTray](https://github.com/benbuck/rbtray) can be used to minimise it to the taskbar.

See the proxy's [example configuration file](https://github.com/killergerbah/asbplayer/blob/main/scripts/web-socket-server/.env.example) for how to further configure it.

#### WebSocket interface

The asbplayer website can be controlled remotely through a WebSocket connection, which enables [one-click mining flows](#one-click-mining-flow) with the right setup. Currently asbplayer responds to three types of payloads:

-   `mine-subtitle` request:

    ```javascript
    {
        "command": "mine-subtitle",
        // Message ID to correlate with asbplayer's response
        "messageId": "10281760-d787-4356-8572-f698d8ff3884",
        "body": {
            // 0 = "None", 1 = "Show anki dialog", 2 = "Update last card", 3 = "Export card"
            "postMineAction": 1,
            // Key-value pairs corresponding to an Anki note type
            "fields": {
                "key1": "value1",
                "key2": "value2"
            }
        }
    }
    ```

    `mine-subtitle` response:

    ```javascript
    {
        "command": "response",
        // Same message ID received in request
        "messageId": "10281760-d787-4356-8572-f698d8ff3884",
        "body": {
            // Whether the command was successfully published to an asbplayer client
            "published": true
        }
    }
    ```

-   `load-subtitles` request:

    ```javascript
    {
        "command": "load-subtitles",
        // Message ID to correlate with asbplayer's response
        "messageId": "3565510c-342f-4cec-ad2e-dee81af88d75",
        "body": {
            "files": [{
                // Name of the file, including its extension
                "name": "some-file.srt",
                // Base64-encoded file contents
                "base64": "Zm9vYmFyY..."
            }]
        }
    }
    ```

    `load-subtitles` response:

    ```javascript
    {
        "command": "response",
        // Same message ID received in request
        "messageId": "3565510c-342f-4cec-ad2e-dee81af88d75",
        "body": {}
    }
    ```

-   `seek-timestamp` request:

    ```javascript
    {
        "command": "seek-timestamp",
        // Message ID to correlate with asbplayer's response
        "messageId": "6e4b2d8f-3a1c-4d9e-8f7b-2c0a9d5e1f3b",
        "body": {
            //The timestamp to seek in seconds
            "timestamp": 30.5,
        }
    }
    ```

    `seek-timestamp` response:

    ```javascript
    {
        "command": "response",
        // Same message ID received in request
        "messageId": "6e4b2d8f-3a1c-4d9e-8f7b-2c0a9d5e1f3b",
        "body": {}
    }
    ```

    The [Web Socket server](https://github.com/killergerbah/asbplayer/blob/main/scripts/web-socket-server) implements this protocol and also implements an HTTP interface that can trigger these commands:

    - `POST asbplayer/load-subtitles` ([script](https://github.com/killergerbah/asbplayer/blob/main/scripts/web-socket-server/cli/load-subtitles))
    - `POST asbplayer/seek` ([script](https://github.com/killergerbah/asbplayer/blob/main/scripts/web-socket-server/cli/seek))

## Usage on Android

> [!WARNING]
> asbplayer has a very limited feature set on Android. Most notably, you will not be able to take screenshots, use keyboard shortcuts, or use the side panel. As with the Firefox desktop browser version, the mobile version also cannot record audio from DRM-protected streams.

asbplayer is best used on computers using Chromium-based browsers, but it is also usable on Android.

1. Install either Kiwi Browser (preferred for DRM-protected stream audio capture) or Firefox for Android.
2. Install the extension via the extension store for your browser: [Chrome Web Store](https://chromewebstore.google.com/detail/asbplayer-language-learni/hkledmpjpaehamkiehglnbelcpdflcab) or [AMO](https://addons.mozilla.org/firefox/addon/asbplayer-android/).
3. On webpages with video elements, select the asbplayer button from your browser's main menu to open the subtitle track selector.
4. When the video is paused, use asbplayer's overlay UI to access asbplayer features.
5. Use [AnkiConnect Android](https://github.com/KamWithK/AnkiconnectAndroid) for Anki integration.

## Offline usage

The asbplayer website can be used offline thanks to offline PWA support provided by [vite-pwa](https://vite-pwa-org.netlify.app/). Updates will be fetched the next time you use the website with an Internet connection.

## Common issues

### asbplayer can't connect to Anki. It shows an error message e.g. 'Failed to fetch.'

-   If you're using Brave, make sure asbplayer isn't being blocked by Shield.
-   Make sure that asbplayer is allowed by AnkiConnect, as in this [video](https://youtu.be/Mv7fEVb6PHo?t=44).
-   Make sure that the origin you add to the AnkiConnect settings is exactly `https://killergerbah.github.io` with no slash at the end (and not `https://killergerbah.github.io/asbplayer`).
-   Check that your browser or an ad blocker isn't blocking the request. A good place to start is by opening your browser's developer console and looking for errors.
-   As of this writing enabling experimental web platform features is known to cause this issue. Try disabling this flag from `chrome://flags`.
-   On later versions of macOS, AnkiConnect will not respond when Anki is backgrounded. See "Notes for MacOS Users" on the [AnkiConnect developer's website](https://foosoft.net/projects/anki-connect/).

### When using the 'update last card' feature, the card does not update in Anki.

Make sure Anki's card browser is closed when using 'update last card.' There is a [known issue](https://github.com/FooSoft/anki-connect/issues/82) with AnkiConnect where cards will not appear to update when the card browser is open.

### When loading a local file asbplayer either shows a black screen, or doesn't play audio.

See the [Browser Compatibility](#browser-compatibility) section.

### My popup dictionary extension (e.g. Yomitan) doesn't work on the side panel

Chrome does not allow other extension scripts to be injected into extension UI, so there is no fix for this. If you want to scan text with other extensions then you will need to do it from the subtitles displayed inside the video element, or from the subtitle list on the asbplayer website.

### asbplayer isn't detecting streaming video.

-   Try refreshing both the asbplayer tab and the video in the other tab.
-   Make sure that in the extension details, the extension has access to all sites.

### Keyboard shortcuts aren't working.

-   Check the [keyboard shortcut settings](https://killergerbah.github.io/asbplayer/?view=settings#keyboard-shortcuts).
-   If you are using the extension:
    -   Check `chrome://extensions/shortcuts`.
    -   Try refreshing the page and loading subtitles again.
    -   Try uninstalling and reinstalling the extension, and restarting Chrome.
    -   Make sure the extension isn't installed twice.

### asbplayer isn't including audio/screenshot in flashcards.

If you're mining streaming video via the Chrome extension, make sure that the streaming video tab is selected and in the foreground when you use a mining keyboard shortcut

### asbplayer isn't properly cropping screenshots from streaming video.

-   Make sure the browser zoom setting is at 100%.
-   You can disable cropping altogether using the extension settings menu.

### I'm having trouble creating cards using JP mining note.

See this [issue](https://github.com/killergerbah/asbplayer/issues/220#issuecomment-1501124166).

## Browser compatibility

### Website

Local video file playback is supported only for codecs supported by the browser. Firefox does not support many popular video codecs. Later versions of Chrome can decode H.265 video as long as hardware acceleration is enabled. See the [animebook](https://github.com/animebook/animebook.github.io?tab=readme-ov-file#video-format-support-last-update-january-2023) readme for a detailed explanation of this and links to browsers that have good compatibility.

### Extension

The extension is compatible with most Chromium-based browsers. It is also compatible with Firefox, but on Firefox version of the extension is missing feaures like the side panel and the ability to record DRM-protected audio.
=======
1. Detects when you're on a supported anime site
2. Extracts the anime title and episode number
3. Uses the Anilist API to find the correct anime ID
4. Searches for subtitles using the Jimaku API
5. Loads the subtitles directly into asbplayer
>>>>>>> 4eab7df3 (feat: add automatically fetched subs dialog)

## Contributing

To add support for additional anime sites:

1. Add the site configuration to `animeSites` in `extension/src/services/anime-sites.ts`
2. Define the title and episode selectors for the site
3. Submit a pull request

## Credits

This project is based on [asbplayer](https://github.com/killergerbah/asbplayer) by killergerbah.
Inspired by [asb-auto-subs](https://github.com/GodPepe7/asb-auto-subs) by GodPepe7.

## License

MIT License
