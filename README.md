# API subs for asbplayer

Web app: https://zakwarsame.github.io/asbplayer/

This is a fork of [asbplayer](https://github.com/killergerbah/asbplayer) that adds automatic subtitle search and download functionality for anime sites. It works with the [Jimaku API](https://jimaku.cc/login) and [Anilist API](https://anilist.co/docs/api) to automatically detect anime titles and episodes on supported streaming sites.

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

- **Automatic Anime Detection**: Automatically detects anime titles and episodes on supported streaming sites
- **Subtitle Search**: Search and download subtitles directly through the asbplayer interface using the Jimaku API
- **Supported Sites**:
    - hianime.to
    - miruro.tv
    - More sites can be easily added

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

1. Detects when you're on a supported anime site
2. Extracts the anime title and episode number
3. Uses the Anilist API to find the correct anime ID
4. Searches for subtitles using the Jimaku API
5. Loads the subtitles directly into asbplayer

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
