// ==UserScript==
// @name         x Video Downloader
// @namespace    https://github.com/tizee/tempermonkey-x-video-downloader
// @version      1.1
// @description  Download X (formerly Twitter) video via a resolver API.
// @downloadURL  https://raw.githubusercontent.com/tizee-tampermonkey-scripts/tampermonkey-x-video-downloader/refs/heads/main/user.js
// @updateURL    https://raw.githubusercontent.com/tizee-tampermonkey-scripts/tampermonkey-x-video-downloader/refs/heads/main/user.js
// @author       tizee
// @match        https://x.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=x.com
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    "use strict";

    // --- CSS Injection ---
    const STYLE = `
        .tweet-download-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 auto;
            width: 34px;
            height: 34px;
            padding: 0;
            border: 0;
            border-radius: 9999px;
            outline: none;
            color: rgb(113, 118, 123);
            background-color: transparent;
            cursor: pointer;
            transition: background-color 0.2s, color 0.2s, box-shadow 0.2s;
        }
        .tweet-download-button:hover {
            background-color: rgba(29,155,240,0.1);
            color: rgb(29,155,240);
        }
        .tweet-download-button svg {
            width: 18.75px;
            height: 18.75px;
        }
    `;
    GM_addStyle(STYLE);

    // --- Configuration & Constants ---
    const RESOLVER_KEY = "X_VIDEO_RESOLVER";
    let videoResolverApi = GM_getValue(RESOLVER_KEY);

    // New X layout: [data-engagement-action="media"]. Old layout: data-testid.
    const MEDIA_SELECTORS = [
        'div[data-testid="tweetPhoto"]',
        'div[data-testid="videoPlayer"]',
        'div[data-testid="videoComponent"]',
        "video",
        '[data-engagement-action="media"]',
    ];

    // --- Helper Functions ---
    /**
     * Opens a new tab with the resolved media URL.
     * @param {string} tweetId - The tweet ID to resolve.
     */
    async function openTweetMedia(tweetId) {
        if (videoResolverApi) {
            const apiUrl = `${videoResolverApi}?tweet=${encodeURIComponent(tweetId)}`;
            window.open(apiUrl, "_blank");
        } else {
            alert("Please set your video resolver API URL via the menu command.");
        }
    }

    /**
     * Extracts a tweet ID from a path or URL.
     * @param {string} value - A URL or path that contains /status/<id>.
     * @returns {string|null} The tweet ID, or null if not found.
     */
    function parseTweetId(value) {
        const match = String(value || "").match(/\/status\/(\d+)/);
        return match ? match[1] : null;
    }

    /**
     * Checks that an element belongs to this tweet, not to a quoted tweet.
     * @param {HTMLElement} tweet - The tweet article element.
     * @param {Element} element - The element to check.
     * @returns {boolean} True when the element is owned by this tweet.
     */
    function belongsToTweet(tweet, element) {
        const containingArticle = element.closest("article");
        if (containingArticle && containingArticle !== tweet) return false;
        if (element.closest('[data-slot="embedded-tweet-frame"]')) return false;
        if (element.closest('[data-testid="card.wrapper"]')) return false;
        return true;
    }

    /**
     * Finds the first matching element owned by this tweet.
     * @param {HTMLElement} tweet - The tweet article element.
     * @param {string} selector - The selector to match.
     * @returns {Element|null} The matching element, or null.
     */
    function findOwnElement(tweet, selector) {
        return (
            Array.from(tweet.querySelectorAll(selector)).find((element) =>
                belongsToTweet(tweet, element)
            ) || null
        );
    }

    /**
     * Extracts the tweet ID from a tweet article element.
     * @param {HTMLElement} tweet - The tweet article element.
     * @returns {string|null} The tweet ID, or null if not found.
     */
    function extractTweetId(tweet) {
        // New layout: the timeline entry or permalink wrapper carries data-href.
        const entry = tweet.closest(
            '[data-timeline-entry][data-href], [data-href*="/status/"]'
        );
        const entryId = parseTweetId(entry?.getAttribute("data-href"));
        if (entryId) return entryId;

        // Old layout and status pages: use a status link owned by this tweet.
        const statusLink = findOwnElement(tweet, 'a[href*="/status/"]');
        const linkId = parseTweetId(statusLink?.getAttribute("href"));
        if (linkId) return linkId;

        // Fallback for a tweet detail page with no usable link.
        return parseTweetId(window.location.pathname);
    }

    /**
     * Returns true if the tweet contains media owned by itself.
     * @param {HTMLElement} tweet - The tweet article element.
     * @returns {boolean} True when the tweet has media.
     */
    function hasMedia(tweet) {
        return MEDIA_SELECTORS.some(
            (selector) => findOwnElement(tweet, selector) !== null
        );
    }

    /**
     * Finds the action bar that belongs to this tweet.
     * @param {HTMLElement} tweet - The tweet article element.
     * @returns {Element|null} The action bar, or null.
     */
    function findActionGroup(tweet) {
        const reply = findOwnElement(
            tweet,
            '[data-engagement-action="reply"], [data-testid="reply"]'
        );
        if (reply) return reply.closest('div[role="group"]');

        const share = findOwnElement(
            tweet,
            '[data-engagement-action="share"], [data-testid="share"]'
        );
        return share?.closest('div[role="group"]') || null;
    }

    /**
     * Creates and returns a download button element for a given tweet ID.
     * @param {string} tweetId - The tweet ID.
     * @returns {HTMLElement} The download button element.
     */
    function createDownloadButton(tweetId) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.id = tweetId;
        button.classList.add("tweet-download-button");
        button.title = "Download media";
        button.setAttribute("aria-label", "Download media");
        button.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="1.5em" height="1.5em" viewBox="0 0 24 24" fill="none">
                <path d="M11 5C11 4.44772 11.4477 4 12 4C12.5523 4 13 4.44772 13 5V12.1578L16.2428 8.91501L17.657 10.3292L12.0001 15.9861L6.34326 10.3292L7.75748 8.91501L11 12.1575V5Z" fill="currentColor"></path>
                <path d="M4 14H6V18H18V14H20V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V14Z" fill="currentColor"></path>
            </svg>
        `;
        button.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            openTweetMedia(tweetId);
        });
        return button;
    }

    /**
     * Appends a download button to the tweet if it contains media.
     * @param {HTMLElement} tweet - The tweet article element.
     */
    function addDownloadButtonIfMedia(tweet) {
        // Avoid duplicates.
        if (tweet.__hasDownloadButton) return;

        if (!hasMedia(tweet)) return;

        const tweetId = extractTweetId(tweet);
        if (!tweetId) return;

        const actionGroup = findActionGroup(tweet);
        if (!actionGroup) return;

        actionGroup.appendChild(createDownloadButton(tweetId));
        tweet.__hasDownloadButton = true; // Mark tweet as processed.
    }

    /**
     * Collects tweet articles related to an added node.
     * @param {HTMLElement} node - A node added to the document.
     * @returns {Set<HTMLElement>} Related tweet articles.
     */
    function collectTweetArticles(node) {
        const tweets = new Set();

        if (node.matches("article")) tweets.add(node);

        // Media and action bars can be added after the article itself.
        const parentTweet = node.closest("article");
        if (parentTweet) tweets.add(parentTweet);

        node.querySelectorAll("article").forEach((tweet) => tweets.add(tweet));
        return tweets;
    }

    // --- Mutation Observer ---
    /**
     * Processes newly added nodes to inject download buttons.
     * @param {MutationRecord[]} mutations - List of mutation records.
     */
    function processMutations(mutations) {
        const tweets = new Set();

        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (!(node instanceof HTMLElement)) return;
                collectTweetArticles(node).forEach((tweet) => tweets.add(tweet));
            });
        });

        tweets.forEach(addDownloadButtonIfMedia);
    }

    // Process tweets that already exist before the observer starts.
    document.querySelectorAll("article").forEach(addDownloadButtonIfMedia);

    const observer = new MutationObserver(processMutations);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // --- Menu Command ---
    GM_registerMenuCommand("Set x Video Resolver API URL", () => {
        const resolver = prompt("Enter your x video resolver API URL:");
        if (resolver) {
            GM_setValue(RESOLVER_KEY, resolver);
            videoResolverApi = resolver;
            alert("Resolver API URL saved successfully!");
        }
    });
})();
