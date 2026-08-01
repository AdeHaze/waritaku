export function parseEmbeds(content: string): string {
    if (!content) return '';
    
    let parsedContent = content;

    // YouTube Regex
    // Matches raw URLs or URLs inside basic <p> or <a> tags.
    // E.g. https://youtu.be/5L1CS1xjBaE or https://www.youtube.com/watch?v=5L1CS1xjBaE
    const youtubeRegex = /(?<!["'=])(?:<p>)?\s*(?:<a[^>]*>)?\s*https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:&[^\s<]*)?\s*(?:<\/a>)?\s*(?:<\/p>)?/gi;
    
    parsedContent = parsedContent.replace(youtubeRegex, (match, videoId) => {
        return `
        <div class="my-6 aspect-video rounded-md overflow-hidden bg-muted shadow-sm border border-border">
            <iframe 
                src="https://www.youtube.com/embed/${videoId}" 
                title="YouTube video player" 
                frameborder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                allowfullscreen
                class="w-full h-full"
            ></iframe>
        </div>
        `;
    });

    // Twitter Regex
    // E.g. https://twitter.com/G_Witch_M/status/1609202768635629568
    // E.g. https://x.com/G_Witch_M/status/1609202768635629568
    // Note: (?<!["'=]) ensures we don't accidentally match a URL inside an href="..." attribute!
    const twitterRegex = /(?<!["'=])(?:<p>)?\s*(?:<a[^>]*>)?\s*https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/status\/([0-9]+)\s*(?:<\/a>)?\s*(?:<\/p>)?/gi;
    
    let hasTwitter = false;
    parsedContent = parsedContent.replace(twitterRegex, (match, username, tweetId) => {
        hasTwitter = true;
        return `
        <div class="my-6 flex justify-center w-full overflow-hidden">
            <blockquote class="twitter-tweet" data-dnt="true" data-theme="dark">
                <a href="https://twitter.com/${username}/status/${tweetId}"></a>
            </blockquote>
        </div>
        `;
    });

    // If Twitter was found, append the widgets script so it hydrates correctly
    if (hasTwitter) {
        parsedContent += `
        <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
        `;
    }

    return parsedContent;
}
