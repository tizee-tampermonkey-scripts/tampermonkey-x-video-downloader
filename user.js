// ==UserScript==
// @name         x Video Downloader
// @namespace    https://github.com/tizee/tempermonkey-x-video-downloader
// @version      1.5
// @description  Download X (formerly Twitter) video via a resolver API.
// @downloadURL  https://raw.githubusercontent.com/tizee-tampermonkey-scripts/tampermonkey-x-video-downloader/refs/heads/main/user.js
// @updateURL    https://raw.githubusercontent.com/tizee-tampermonkey-scripts/tampermonkey-x-video-downloader/refs/heads/main/user.js
// @author       tizee
// @match        https://x.com/*
// @connect      get-x-video.pobomp.workers.dev
// @icon         https://www.google.com/s2/favicons?sz=64&domain=x.com
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
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
            color: var(--tweet-download-color, rgb(113, 118, 123));
            background-color: transparent;
            cursor: pointer;
            transition: background-color 0.2s, color 0.2s, box-shadow 0.2s;
        }
        .tweet-download-button:hover {
            background-color: rgba(29,155,240,0.1);
            color: rgb(29,155,240);
        }
        .tweet-download-button:focus-visible {
            outline: 2px solid rgb(29,155,240);
            outline-offset: 2px;
        }
        .tweet-download-button svg {
            width: var(--tweet-download-icon-size, 18.75px);
            height: var(--tweet-download-icon-size, 18.75px);
        }
        .tweet-download-button.is-loading {
            opacity: 0.55;
            cursor: wait;
        }
        .tweet-quality-menu {
            position: fixed;
            z-index: 2147483647;
            min-width: 224px;
            max-width: calc(100vw - 16px);
            padding: 4px 0;
            border: 1px solid var(--tweet-menu-border);
            border-radius: 16px;
            background-color: var(--tweet-menu-bg);
            box-shadow: var(--tweet-menu-shadow);
            color: var(--tweet-menu-text);
            font-family: inherit;
            overflow: hidden;
        }
        .tweet-quality-menu-title {
            padding: 8px 16px 4px;
            color: var(--tweet-menu-muted);
            font-size: 13px;
            font-weight: 400;
            line-height: 20px;
        }
        .tweet-quality-option {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 24px;
            width: 100%;
            padding: 12px 16px;
            border: 0;
            background: transparent;
            color: inherit;
            cursor: pointer;
            font-family: inherit;
            font-size: 15px;
            line-height: 20px;
            text-align: left;
        }
        .tweet-quality-option:hover {
            background-color: var(--tweet-menu-hover);
        }
        .tweet-quality-option:focus-visible {
            outline: 2px solid rgb(29,155,240);
            outline-offset: -2px;
        }
        .tweet-quality-option-label {
            font-weight: 400;
        }
        .tweet-quality-option-detail {
            color: var(--tweet-menu-muted);
            font-size: 13px;
            white-space: nowrap;
        }
        .tweet-media-menu {
            min-width: 280px;
        }
        .tweet-media-option {
            display: flex;
            align-items: center;
            gap: 12px;
            width: 100%;
            padding: 8px 16px;
            border: 0;
            background: transparent;
            color: inherit;
            cursor: pointer;
            font-family: inherit;
            text-align: left;
        }
        .tweet-media-option:hover {
            background-color: var(--tweet-menu-hover);
        }
        .tweet-media-option:focus-visible {
            outline: 2px solid rgb(29,155,240);
            outline-offset: -2px;
        }
        .tweet-media-option-thumb,
        .tweet-media-option-thumb-placeholder {
            width: 48px;
            height: 48px;
            flex: 0 0 auto;
            border-radius: 8px;
            background-color: var(--tweet-menu-hover);
        }
        .tweet-media-option-thumb {
            object-fit: cover;
        }
        .tweet-media-option-thumb-placeholder {
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--tweet-menu-muted);
            font-size: 12px;
        }
        .tweet-media-option-info {
            display: flex;
            min-width: 0;
            flex-direction: column;
            gap: 2px;
        }
        .tweet-media-option-label {
            font-size: 15px;
            font-weight: 700;
            line-height: 20px;
        }
        .tweet-media-option-detail {
            overflow: hidden;
            color: var(--tweet-menu-muted);
            font-size: 13px;
            line-height: 18px;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    `;
    GM_addStyle(STYLE);

    // --- Configuration & Constants ---
    const RESOLVER_KEY = "X_VIDEO_RESOLVER";
    let videoResolverApi = GM_getValue(RESOLVER_KEY);

    const MEDIA_INFO_CACHE_TTL_MS = 5 * 60 * 1000;
    const MEDIA_INFO_TIMEOUT_MS = 10 * 1000;
    const mediaInfoCache = new Map();
    let activeDownloadMenu = null;

    // New X layout: [data-engagement-action="media"]. Old layout: data-testid.
    const MEDIA_SELECTORS = [
        'div[data-testid="tweetPhoto"]',
        'div[data-testid="videoPlayer"]',
        'div[data-testid="videoComponent"]',
        "video",
        '[data-engagement-action="media"]',
    ];

    // Use an official action icon as the style reference.
    const ACTION_ICON_SELECTORS = [
        '[data-engagement-action="reply"] svg',
        '[data-testid="reply"] svg',
        '[data-engagement-action="share"] svg',
        '[data-testid="share"] svg',
    ];

    // --- Helper Functions ---
    /**
     * Builds a resolver API URL with query parameters.
     * @param {Record<string, string|number|undefined|null>} params - Query parameters.
     * @returns {string} The resolver URL.
     */
    function buildResolverUrl(params) {
        const url = new URL(videoResolverApi);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== "") {
                url.searchParams.set(key, String(value));
            }
        });
        return url.toString();
    }

    /**
     * Opens a new tab with the resolved media URL.
     * @param {string} tweetId - The tweet ID to resolve.
     * @param {string|undefined} quality - The selected quality value.
     */
    function openTweetMedia(tweetId, quality, mediaIndex = 0) {
        if (!videoResolverApi) {
            alert("Please set your video resolver API URL via the menu command.");
            return;
        }

        let apiUrl;
        try {
            apiUrl = buildResolverUrl({
                tweet: tweetId,
                index: mediaIndex > 0 ? mediaIndex : undefined,
                quality,
            });
        } catch (error) {
            console.error("[x Video Downloader] Invalid resolver URL:", error);
            alert("The resolver API URL is invalid. Set it again via the menu command.");
            return;
        }
        window.open(apiUrl, "_blank", "noopener,noreferrer");
    }

    /**
     * Formats a bitrate for the quality menu.
     * @param {number} bitrate - Bitrate in bits per second.
     * @returns {string} A compact bitrate label.
     */
    function formatBitrate(bitrate) {
        const value = Number(bitrate);
        if (!Number.isFinite(value) || value <= 0) return "";
        if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} Mbps`;
        return `${Math.round(value / 1_000)} kbps`;
    }

    /**
     * Detects whether the current X theme is dark.
     * @returns {boolean} True for a dark theme.
     */
    function isDarkPage() {
        for (const element of [document.body, document.documentElement]) {
            const background = getComputedStyle(element).backgroundColor;
            const match = background.match(
                /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/
            );
            if (!match) continue;

            const alpha = background.match(/rgba\([^)]*,\s*([\d.]+)\s*\)/);
            if (alpha && Number(alpha[1]) === 0) continue;

            const [r, g, b] = match.slice(1).map(Number);
            return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
        }
        return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
    }

    /**
     * Applies X-like colors to a quality menu.
     * @param {HTMLElement} menu - The quality menu element.
     */
    function applyMenuTheme(menu) {
        const dark = isDarkPage();
        menu.style.setProperty(
            "--tweet-menu-bg",
            dark ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)"
        );
        menu.style.setProperty(
            "--tweet-menu-text",
            dark ? "rgb(231, 233, 234)" : "rgb(15, 20, 25)"
        );
        menu.style.setProperty(
            "--tweet-menu-muted",
            dark ? "rgb(153, 153, 153)" : "rgb(83, 100, 113)"
        );
        menu.style.setProperty(
            "--tweet-menu-border",
            dark ? "rgb(51, 54, 57)" : "rgb(207, 217, 222)"
        );
        menu.style.setProperty(
            "--tweet-menu-hover",
            dark ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.03)"
        );
        menu.style.setProperty(
            "--tweet-menu-shadow",
            dark
                ? "rgba(255, 255, 255, 0.2) 0px 0px 15px, rgba(255, 255, 255, 0.15) 0px 0px 3px 1px"
                : "rgba(101, 119, 134, 0.2) 0px 0px 15px, rgba(101, 119, 134, 0.15) 0px 0px 3px 1px"
        );
    }

    /**
     * Closes the active download menu.
     */
    function closeDownloadMenu() {
        if (!activeDownloadMenu) return;
        const { menu, trigger, cleanup } = activeDownloadMenu;
        activeDownloadMenu = null;
        cleanup();
        menu.remove();
        trigger.setAttribute("aria-expanded", "false");
    }

    /**
     * Creates a themed menu with a title.
     * @param {string} titleText - Menu title.
     * @returns {HTMLElement} The menu element.
     */
    function createMenu(titleText) {
        const menu = document.createElement("div");
        menu.className = "tweet-quality-menu";
        menu.setAttribute("role", "menu");
        menu.setAttribute("aria-label", titleText);
        applyMenuTheme(menu);

        const title = document.createElement("div");
        title.className = "tweet-quality-menu-title";
        title.textContent = titleText;
        menu.appendChild(title);
        return menu;
    }

    /**
     * Anchors a menu to the download button and manages its lifecycle.
     * @param {HTMLElement} button - The download button.
     * @param {HTMLElement} menu - The menu to display.
     */
    function openDownloadMenu(button, menu) {
        closeDownloadMenu();
        document.body.appendChild(menu);

        const rect = button.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const viewportPadding = 8;
        let top = rect.top - menuRect.height - viewportPadding;
        if (top < viewportPadding) {
            top = Math.min(
                rect.bottom + viewportPadding,
                window.innerHeight - menuRect.height - viewportPadding
            );
        }
        top = Math.max(viewportPadding, top);

        let left = rect.right - menuRect.width;
        left = Math.max(
            viewportPadding,
            Math.min(left, window.innerWidth - menuRect.width - viewportPadding)
        );
        menu.style.top = `${Math.round(top)}px`;
        menu.style.left = `${Math.round(left)}px`;

        const onPointerDown = (event) => {
            if (menu.contains(event.target) || button.contains(event.target)) return;
            closeDownloadMenu();
        };
        const onKeyDown = (event) => {
            if (event.key === "Escape") closeDownloadMenu();
        };
        const onViewportChange = () => closeDownloadMenu();
        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("resize", onViewportChange);
        window.addEventListener("scroll", onViewportChange, true);

        const cleanup = () => {
            document.removeEventListener("pointerdown", onPointerDown, true);
            document.removeEventListener("keydown", onKeyDown, true);
            window.removeEventListener("resize", onViewportChange);
            window.removeEventListener("scroll", onViewportChange, true);
        };

        button.setAttribute("aria-expanded", "true");
        activeDownloadMenu = { menu, trigger: button, cleanup };
        requestAnimationFrame(() => {
            menu.querySelector('[role="menuitem"]')?.focus();
        });
    }

    /**
     * Shows quality options above the download button.
     * @param {HTMLElement} button - The download button.
     * @param {string} tweetId - The tweet ID.
     * @param {number} mediaIndex - The selected media index.
     * @param {Array<object>} qualities - Available quality options.
     * @param {string} titleText - Menu title.
     */
    function showQualityMenu(
        button,
        tweetId,
        mediaIndex,
        qualities,
        titleText = "Download quality"
    ) {
        const menu = createMenu(titleText);
        qualities.forEach((quality) => {
            const option = document.createElement("button");
            option.type = "button";
            option.className = "tweet-quality-option";
            option.setAttribute("role", "menuitem");

            const label = document.createElement("span");
            label.className = "tweet-quality-option-label";
            label.textContent = quality.label;

            const detail = document.createElement("span");
            detail.className = "tweet-quality-option-detail";
            const details = [formatBitrate(quality.bitrate)];
            if (quality.best) details.push("Best");
            detail.textContent = details.filter(Boolean).join(" · ");

            option.append(label, detail);
            option.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                closeDownloadMenu();
                openTweetMedia(tweetId, quality.value, mediaIndex);
            });
            menu.appendChild(option);
        });
        openDownloadMenu(button, menu);
    }

    /**
     * Shows media choices above the download button.
     * @param {HTMLElement} button - The download button.
     * @param {string} tweetId - The tweet ID.
     * @param {Array<object>} mediaItems - All media in the tweet.
     */
    function showMediaMenu(button, tweetId, mediaItems) {
        const menu = createMenu("Select media");
        menu.classList.add("tweet-media-menu");

        mediaItems.forEach((mediaItem) => {
            const typeLabel =
                mediaItem.type === "photo"
                    ? "Photo"
                    : mediaItem.type === "animated_gif"
                      ? "GIF"
                      : "Video";
            const qualityLabels = (mediaItem.qualities || [])
                .map((quality) => quality.label)
                .join(", ");

            const option = document.createElement("button");
            option.type = "button";
            option.className = "tweet-media-option";
            option.setAttribute("role", "menuitem");

            let thumbnail;
            if (mediaItem.preview) {
                thumbnail = document.createElement("img");
                thumbnail.className = "tweet-media-option-thumb";
                thumbnail.src = mediaItem.preview;
                thumbnail.alt = "";
                thumbnail.loading = "lazy";
            } else {
                thumbnail = document.createElement("div");
                thumbnail.className = "tweet-media-option-thumb-placeholder";
                thumbnail.textContent = typeLabel;
            }

            const info = document.createElement("div");
            info.className = "tweet-media-option-info";
            const label = document.createElement("span");
            label.className = "tweet-media-option-label";
            label.textContent = `Media ${mediaItem.index + 1}`;
            const detail = document.createElement("span");
            detail.className = "tweet-media-option-detail";
            detail.textContent = [typeLabel, qualityLabels]
                .filter(Boolean)
                .join(" · ");
            info.append(label, detail);

            option.append(thumbnail, info);
            option.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                closeDownloadMenu();
                openSelectedMedia(
                    button,
                    tweetId,
                    mediaItem,
                    mediaItems.length
                );
            });
            menu.appendChild(option);
        });
        openDownloadMenu(button, menu);
    }

    /**
     * Opens a selected media item, prompting for quality when needed.
     * @param {HTMLElement} button - The download button.
     * @param {string} tweetId - The tweet ID.
     * @param {object} mediaItem - The selected media metadata.
     * @param {number} mediaCount - Number of media items in the tweet.
     */
    function openSelectedMedia(button, tweetId, mediaItem, mediaCount) {
        const qualities = mediaItem.qualities || [];
        if (
            ["video", "animated_gif"].includes(mediaItem.type) &&
            qualities.length > 1
        ) {
            const titleText =
                mediaCount > 1
                    ? `Media ${mediaItem.index + 1} quality`
                    : "Download quality";
            showQualityMenu(
                button,
                tweetId,
                mediaItem.index,
                qualities,
                titleText
            );
            return;
        }

        openTweetMedia(tweetId, qualities[0]?.value, mediaItem.index);
    }

    /**
     * Requests resolver metadata through Tampermonkey to bypass page CSP.
     * @param {string} url - The resolver metadata URL.
     * @returns {Promise<{status: number, contentType: string, text: string}>}
     */
    function requestResolverInfo(url) {
        if (typeof GM_xmlhttpRequest === "function") {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url,
                    timeout: MEDIA_INFO_TIMEOUT_MS,
                    headers: { Accept: "application/json" },
                    onload: (response) => {
                        const headers = response.responseHeaders || "";
                        const contentType =
                            headers.match(/^content-type:\s*(.+)$/im)?.[1]?.trim() ||
                            "";
                        resolve({
                            status: response.status,
                            contentType,
                            text: response.responseText || "",
                        });
                    },
                    onerror: () =>
                        reject(
                            new Error(
                                "Resolver request failed. Check @connect and the resolver URL."
                            )
                        ),
                    ontimeout: () =>
                        reject(new Error("Resolver request timed out.")),
                    onabort: () =>
                        reject(new Error("Resolver request aborted.")),
                });
            });
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(
            () => controller.abort(),
            MEDIA_INFO_TIMEOUT_MS
        );
        return fetch(url, {
            credentials: "omit",
            signal: controller.signal,
        })
            .then(async (response) => ({
                status: response.status,
                contentType: response.headers.get("content-type") || "",
                text: await response.text(),
            }))
            .finally(() => clearTimeout(timeoutId));
    }

    /**
     * Fetches media and quality metadata for a tweet.
     * @param {string} tweetId - The tweet ID.
     * @returns {Promise<object>} The resolver media metadata.
     */
    async function fetchMediaInfo(tweetId) {
        const cached = mediaInfoCache.get(tweetId);
        if (cached && cached.expiresAt > Date.now()) return cached.data;

        const response = await requestResolverInfo(
            buildResolverUrl({ tweet: tweetId, info: 1 })
        );
        if (response.status < 200 || response.status >= 300) {
            throw new Error(
                `Resolver returned ${response.status}${response.text ? `: ${response.text}` : ""}`
            );
        }
        if (!response.contentType.includes("application/json")) {
            throw new Error(
                "Resolver does not support media selection. Redeploy worker.js."
            );
        }

        let data;
        try {
            data = JSON.parse(response.text);
        } catch (error) {
            throw new Error("Resolver returned invalid JSON.");
        }
        if (!Array.isArray(data.qualities)) {
            throw new Error("Resolver returned invalid media metadata.");
        }

        mediaInfoCache.set(tweetId, {
            expiresAt: Date.now() + MEDIA_INFO_CACHE_TTL_MS,
            data,
        });
        return data;
    }

    /**
     * Loads media metadata and opens a media menu, quality menu, or media.
     * @param {string} tweetId - The tweet ID.
     * @param {HTMLElement} button - The download button.
     */
    async function handleDownloadClick(tweetId, button) {
        if (activeDownloadMenu?.trigger === button) {
            closeDownloadMenu();
            return;
        }
        if (!videoResolverApi) {
            alert("Please set your video resolver API URL via the menu command.");
            return;
        }
        if (button.classList.contains("is-loading")) return;

        button.classList.add("is-loading");
        button.setAttribute("aria-busy", "true");
        try {
            const data = await fetchMediaInfo(tweetId);
            if (Array.isArray(data.media)) {
                if (data.media.length > 1) {
                    showMediaMenu(button, tweetId, data.media);
                } else if (data.media.length === 1) {
                    openSelectedMedia(button, tweetId, data.media[0], 1);
                } else {
                    openTweetMedia(tweetId);
                }
                return;
            }

            const qualities = data.qualities;
            if (qualities.length <= 1) {
                openTweetMedia(tweetId, qualities[0]?.value);
            } else {
                showQualityMenu(button, tweetId, 0, qualities);
            }
        } catch (error) {
            console.error("[x Video Downloader] Media lookup failed:", error);
            alert(
                "Failed to load media options.\n" +
                    `${error.message}\n\n` +
                    "Check the resolver URL, @connect, and worker version."
            );
        } finally {
            button.classList.remove("is-loading");
            button.removeAttribute("aria-busy");
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
        button.setAttribute("aria-haspopup", "menu");
        button.setAttribute("aria-expanded", "false");
        button.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3.75V14.25M12 14.25L16.5 9.75M12 14.25L7.5 9.75"></path>
                <path d="M4.5 15.75V18C4.5 18.8284 5.17157 19.5 6 19.5H18C18.8284 19.5 19.5 18.8284 19.5 18V15.75"></path>
            </svg>
        `;
        button.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            void handleDownloadClick(tweetId, button);
        });
        return button;
    }

    /**
     * Matches the button icon color and size to an official action icon.
     * @param {HTMLElement} tweet - The tweet article element.
     * @param {HTMLElement} button - The download button element.
     */
    function matchActionIconStyle(tweet, button) {
        for (const selector of ACTION_ICON_SELECTORS) {
            const referenceIcon = findOwnElement(tweet, selector);
            if (!referenceIcon) continue;

            const referenceStyle = getComputedStyle(referenceIcon);
            if (referenceStyle.color) {
                button.style.setProperty("--tweet-download-color", referenceStyle.color);
            }

            const size =
                referenceIcon.getBoundingClientRect().width ||
                Number.parseFloat(referenceStyle.width);
            if (size > 0) {
                button.style.setProperty("--tweet-download-icon-size", `${size}px`);
            }
            return;
        }
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

        const button = createDownloadButton(tweetId);
        matchActionIconStyle(tweet, button);
        actionGroup.appendChild(button);
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
            mediaInfoCache.clear();
            alert("Resolver API URL saved successfully!");
        }
    });
})();
