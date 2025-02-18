// ==UserScript==
// @name         x Video Downloader
// @namespace    https://github.com/tizee/tempermonkey-x-video-downloader
// @version      1.0
// @description  Download X (formerly Twitter) video via a resolver API.
// @downloadURL  https://raw.githubusercontent.com/tizee/tempermonkey-x-video-downloader/main/user.js
// @updateURL    https://raw.githubusercontent.com/tizee/tempermonkey-x-video-downloader/main/user.js
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
            display: flex;
            align-items: center;
            justify-content: center;
            outline: none;
            color: rgb(113, 118, 123);
            background-color: transparent;
            transition: background-color 0.2s, color 0.2s, box-shadow 0.2s;
        }
        .tweet-download-button:hover {
            background-color: rgba(29,155,240,0.1);
            color: rgb(29,155,240);
            cursor: pointer;
        }
    `;
    GM_addStyle(STYLE);

    // --- Configuration & Constants ---
    const RESOLVER_KEY = "X_VIDEO_RESOLVER";
    let videoResolverApi = GM_getValue(RESOLVER_KEY);

    const TWEET_URL_REGEX = /^https:\/\/x\.com\/(?:\w+$|home$|\w+\/status\/\d+$)/;
    const STATUS_PAGE_REGEX = /^https:\/\/x\.com\/\w+\/status\/\d+$/;

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
     * Extracts the tweet ID from a tweet article element.
     * @param {HTMLElement} tweet - The tweet article element.
     * @returns {string|null} The tweet ID, or null if not found.
     */
    function extractTweetId(tweet) {
        // Attempt extraction from timeline tweet
        const userAnchor = tweet.querySelector('div[data-testid="User-Name"] a[aria-label]');
        if (userAnchor) {
            const href = userAnchor.getAttribute("href");
            const parts = href.substring(1).split("/status/");
            if (parts.length === 2) {
                return parts[1];
            }
        }
        // Fallback: for status page tweets
        if (STATUS_PAGE_REGEX.test(window.location.href)) {
            const parts = window.location.href.split("/status/");
            return parts[1] || null;
        }
        return null;
    }

    /**
     * Creates and returns a download button element for a given tweet ID.
     * @param {string} tweetId - The tweet ID.
     * @returns {HTMLElement} The download button element.
     */
    function createDownloadButton(tweetId) {
        const button = document.createElement("div");
        button.dataset.id = tweetId;
        button.classList.add("tweet-download-button");
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

        // Check if tweet contains media. Using tweetPhoto as indicator.
        const mediaIndicator = tweet.querySelector('div[data-testid="tweetPhoto"]');
        if (!mediaIndicator) {
            console.debug(`Tweet does not contain media: ${extractTweetId(tweet)}`);
            return;
        }

        const tweetId = extractTweetId(tweet);
        if (!tweetId) return;

        const button = createDownloadButton(tweetId);
        const actionGroup = tweet.querySelector('div[role="group"]');
        if (actionGroup) {
            actionGroup.appendChild(button);
            tweet.__hasDownloadButton = true; // Mark tweet as processed.
        }
    }

    // --- Mutation Observer ---
    /**
     * Processes newly added nodes to inject download buttons.
     * @param {MutationRecord[]} mutations - List of mutation records.
     */
    function processMutations(mutations) {
        // Only process if URL matches expected pattern.
        if (!TWEET_URL_REGEX.test(window.location.href)) return;

        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (!(node instanceof HTMLElement)) return;
                const tweets = node.querySelectorAll('article[data-testid="tweet"]');
                tweets.forEach(addDownloadButtonIfMedia);
            });
        });
    }

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
