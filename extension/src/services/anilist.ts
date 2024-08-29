export async function fetchAnilistInfo(episodeTitle: string): Promise<{ anilistId: number | null }> {
    const query = `
    query ($title: String) {
        Media (search: $title, type: ANIME) {
            id
        }
    }
    `;

    const variables = { title: episodeTitle };
    try {
        const response = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({ query, variables }),
        });

        if (!response.ok) {
            throw new Error('Anilist API request failed');
        }

        const { data } = await response.json();
        const anilistId = data.Media.id;

        return { anilistId };
    } catch (error) {
        console.error('Error fetching Anilist info:', error);
        return { anilistId: null };
    }
}
