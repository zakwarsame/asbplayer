# API subs for asbplayer

This is a fork of [asbplayer](https://github.com/killergerbah/asbplayer) that adds automatic subtitle search and download functionality for anime sites. I'll try my best to keep it up to date with the original repo.

## New Features

- **Automatic Anime Detection**: Automatically detects anime titles and episodes on supported streaming sites
- **Subtitle Search**: Search and download subtitles directly through the asbplayer interface using the Jimaku API
- **Supported Sites**:
    - hianime.to
    - miruro.tv
    - More sites can be easily added

## Setup

1. Install the extension from releases
2. Get an API key from [jimaku.cc](https://jimaku.cc)
3. Open asbplayer settings, click on the "Misc" tab and enter your API key in the "API Key" field

## Usage

1. Go to a supported anime streaming site
2. Open the side panel (click the asbplayer icon from the extensions section and click "Open Side Panel")
3. Choose "Load Subtitles"
4. When you open the subtitle selector, you'll see additional fields for episode number and a search button
5. The anime title and episode will be automatically detected
6. Click search to find and load available subtitles

**Demo:**

![Demo](https://github.com/user-attachments/assets/08be7905-fe75-4ef4-8424-0ea20753e5af)

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
