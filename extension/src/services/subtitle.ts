interface Subs {
    name: string;
    url: string;
}

export async function fetchSubtitles(anilistId: number, episode: number, apiKey: string): Promise<Subs[] | string> {
    const BASE_URL = 'https://jimaku.cc/api';
    const jimakuErrors = new Map([
        [400, "Something went wrong! This shouldn't happen"],
        [401, 'Authentication failed. Check your API Key'],
        [404, 'Entry not found'],
        [429, 'You downloaded too many subs in a short amount of time. Try again in a short bit'],
    ]);

    try {
        const searchResponse = await fetch(`${BASE_URL}/entries/search?anilist_id=${anilistId}`, {
            method: 'GET',
            headers: {
                Authorization: `${apiKey}`,
            },
        });

        if (!searchResponse.ok) {
            const error = jimakuErrors.get(searchResponse.status) || 'Something went wrong';
            throw new Error(error);
        }

        const jimakuEntry = await searchResponse.json();
        if (jimakuEntry.length === 0) {
            throw new Error('No subs found for this anime');
        }

        const id = jimakuEntry[0].id;
        const filesResponse = await fetch(`${BASE_URL}/entries/${id}/files?episode=${episode}`, {
            method: 'GET',
            headers: {
                Authorization: `${apiKey}`,
            },
        });

        if (!filesResponse.ok) {
            const error = jimakuErrors.get(filesResponse.status) || 'Something went wrong';
            throw new Error(error);
        }

        const subs: Subs[] = await filesResponse.json();
        if (subs.length === 0) {
            throw new Error(`No subs for episode ${episode} found`);
        }

        return subs;
    } catch (err) {
        if (err instanceof Error) {
            return err.message;
        }
        return 'An error occurred while fetching subtitles';
    }
}
