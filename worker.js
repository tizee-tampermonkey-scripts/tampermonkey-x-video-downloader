/**
 * Configuration & Constants
 */
const CONFIG = {
  graphqlURL:
    "https://api.x.com/graphql/I9GDzyCGZL2wSoYFFrrTVw/TweetResultByRestId",
  tokenURL: "https://api.x.com/1.1/guest/activate.json",
  tweetFeatures: JSON.stringify({
    creator_subscriptions_tweet_preview_api_enabled: true,
    communities_web_enable_tweet_community_results_fetch: true,
    c9s_tweet_anatomy_moderator_badge_enabled: true,
    articles_preview_enabled: true,
    tweetypie_unmention_optimization_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: true,
    tweet_awards_web_tipping_enabled: false,
    creator_subscriptions_quote_tweet_preview_enabled: false,
    freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    rweb_video_timestamps_enabled: true,
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: true,
    rweb_tipjar_consumption_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_enhance_cards_enabled: false,
  }),
  tweetFieldToggles: JSON.stringify({
    withArticleRichContentState: true,
    withArticlePlainText: false,
    withGrokAnalyze: false,
  }),
  genericUserAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
  commonHeaders: {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    authorization:
      "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
    "x-twitter-client-language": "en",
    "x-twitter-active-user": "yes",
    "accept-language": "en",
  },
  badContainer: {
    start: new Date(1701446400000),
    end: new Date(1702605600000),
  },
  TWITTER_EPOCH: 1288834974657n,
};

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

/**
 * Helper: JSON Response Builder
 */
function createJsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

/**
 * Helper: Standardized Error Response Builder
 */
function createErrorResponse(status, message, details = null) {
  const body = { error: message };
  if (details) body.details = details;
  return createJsonResponse(body, status);
}

/**
 * TokenManager (Singleton Pattern)
 * Encapsulates guest token retrieval and caching logic.
 */
class TokenManager {
  constructor() {
    this._cachedToken = null;
  }

  async getToken(forceReload = false) {
    if (this._cachedToken && !forceReload) return this._cachedToken;
    try {
      const res = await fetch(CONFIG.tokenURL, {
        method: "POST",
        headers: CONFIG.commonHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.guest_token) {
          this._cachedToken = data.guest_token;
          return this._cachedToken;
        }
      }
    } catch (err) {
      console.error("TokenManager error:", err);
    }
    return null;
  }
}

const tokenManager = new TokenManager();

/**
 * MediaExtractor (Strategy / Factory Pattern)
 * Handles extraction and processing of media from tweet data.
 */
class MediaExtractor {
  static needsFixing(media) {
    const repId = media.source_status_id_str ?? media.id_str;
    if (!repId) return false;
    console.log("repId", repId);
    const mediaTimestamp = new Date(
      Number((BigInt(repId) >> 22n) + CONFIG.TWITTER_EPOCH)
    );
    return (
      mediaTimestamp > CONFIG.badContainer.start &&
      mediaTimestamp < CONFIG.badContainer.end
    );
  }

  static getMp4Variants(variants = []) {
    return (variants || [])
      .filter((variant) => variant.content_type === "video/mp4")
      .map((variant) => {
        const match = String(variant.url || "").match(
          /\/(\d{2,5})x(\d{2,5})\//
        );
        return {
          url: variant.url,
          bitrate: Number(variant.bitrate) || 0,
          width: match ? Number(match[1]) : null,
          height: match ? Number(match[2]) : null,
        };
      })
      .sort((a, b) => b.bitrate - a.bitrate);
  }

  static qualityValue(variant) {
    const width = Number(variant.width);
    const height = Number(variant.height);
    if (width > 0 && height > 0) return String(Math.min(width, height));
    return String(variant.bitrate || 0);
  }

  static qualityLabel(variant) {
    const value = this.qualityValue(variant);
    if (variant.width && variant.height) return `${value}p`;
    if (variant.bitrate) return `${Math.round(variant.bitrate / 1000)} kbps`;
    return "Video";
  }

  static getQualityOptions(variants = []) {
    const seen = new Set();
    return this.getMp4Variants(variants)
      .filter((variant) => {
        const value = this.qualityValue(variant);
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
      })
      .map((variant, index) => ({
        value: this.qualityValue(variant),
        label: this.qualityLabel(variant),
        width: variant.width,
        height: variant.height,
        bitrate: variant.bitrate,
        best: index === 0,
      }));
  }

  static selectQuality(variants = [], quality = null) {
    const mp4Variants = this.getMp4Variants(variants);
    if (!mp4Variants.length) {
      throw new Error("No MP4 video variants available");
    }

    const requested = quality == null ? "" : String(quality).toLowerCase();
    if (!requested || requested === "best") return mp4Variants[0];

    const target = requested.replace(/p$/, "");
    return (
      mp4Variants.find(
        (variant) => this.qualityValue(variant) === target
      ) || null
    );
  }

  static extractAllMedia(tweetResult) {
    let baseTweet = tweetResult.legacy;
    if (tweetResult.__typename === "TweetWithVisibilityResults") {
      baseTweet = tweetResult.tweet.legacy;
    }

    const retweetedMedia =
      baseTweet?.retweeted_status_result?.result?.legacy?.extended_entities?.media;
    const mediaItems = retweetedMedia || baseTweet?.extended_entities?.media;
    if (!mediaItems || mediaItems.length === 0) {
      throw new Error("No media found in tweet");
    }
    return mediaItems;
  }
}

/**
 * Extract tweet ID from URL or return null if invalid.
 */
function extractTweetId(tweetUrl) {
  try {
    const parsedUrl = new URL(tweetUrl);
    const parts = parsedUrl.pathname.split("/");
    const statusIndex = parts.indexOf("status");
    if (statusIndex !== -1 && parts.length > statusIndex + 1) {
      return parts[statusIndex + 1];
    }
  } catch (e) {
    // If parsing fails, assume tweetUrl might already be a tweet ID.
  }
  return null;
}

/**
 * Request tweet data using the provided tweet ID and guest token.
 */
async function requestTweet(tweetId, token) {
  const url = new URL(CONFIG.graphqlURL);
  url.searchParams.set(
    "variables",
    JSON.stringify({
      tweetId,
      withCommunity: false,
      includePromotedContent: false,
      withVoice: false,
    })
  );
  url.searchParams.set("features", CONFIG.tweetFeatures);
  url.searchParams.set("fieldToggles", CONFIG.tweetFieldToggles);

  const headers = {
    ...CONFIG.commonHeaders,
    "content-type": "application/json",
    "x-guest-token": token,
  };

  return fetch(url.toString(), { headers });
}

/**
 * Rate Limit Middleware (Chain of Responsibility Pattern)
 * Ensures request count is within allowed bounds using Cloudflare KV.
 */
async function rateLimitMiddleware(request, env, next) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = `rate:${ip}`;
  const limit = 100;
  const windowSeconds = 60;
  const now = Date.now();

  let record = await env.RATE_LIMIT_KV.get(key);
  let data;
  try {
    data = record ? JSON.parse(record) : { count: 0, reset: now + windowSeconds * 1000 };
  } catch (err) {
    data = { count: 0, reset: now + windowSeconds * 1000 };
  }

  if (now > data.reset) {
    data = { count: 0, reset: now + windowSeconds * 1000 };
  }
  data.count++;

  const rawTtl = Math.ceil((data.reset - now) / 1000);
  const ttl = Math.max(rawTtl, 60);
  await env.RATE_LIMIT_KV.put(key, JSON.stringify(data), { expirationTtl: ttl });

  if (data.count > limit) {
    const retryAfter = Math.ceil((data.reset - now) / 1000);
    return new Response("Rate limit exceeded. Try again later.", {
      status: 429,
      headers: {
        "Retry-After": retryAfter.toString(),
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return next();
}

async function requestSyndication(tweetId) {
  // https://github.com/yt-dlp/yt-dlp/blob/05c8023a27dd37c49163c0498bf98e3e3c1cb4b9/yt_dlp/extractor/twitter.py#L1334
  const token = (id) => ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
  const syndicationUrl = new URL("https://cdn.syndication.twimg.com/tweet-result");

  syndicationUrl.searchParams.set("id", tweetId);
  syndicationUrl.searchParams.set("token", token(tweetId));

  const result = await fetch(syndicationUrl, {
    method: "GET",
    headers: {
      "user-agent": CONFIG.genericUserAgent,
      "content-type": "application/json"
    }
  });
  // console.log("syndication", await result.json());
  return result;
}

/**
 * Builds a media URL with the requested size name.
 */
function buildNamedMediaUrl(mediaUrl, name) {
  if (!mediaUrl) return null;
  try {
    const url = new URL(mediaUrl);
    url.searchParams.set("name", name);
    return url.toString();
  } catch (error) {
    return null;
  }
}

/**
 * Builds a media thumbnail URL for the media picker.
 */
function buildMediaPreview(mediaUrl) {
  return buildNamedMediaUrl(mediaUrl, "small");
}

/**
 * Builds the media metadata returned to selection clients.
 */
function createMediaInfo(tweetId, mediaItems, selectedIndex) {
  const media = mediaItems.map((mediaItem, index) => ({
    index,
    type: mediaItem.type,
    preview: buildMediaPreview(mediaItem.media_url_https),
    qualities: ["video", "animated_gif"].includes(mediaItem.type)
      ? MediaExtractor.getQualityOptions(mediaItem.video_info?.variants)
      : [],
  }));
  const selected = media[selectedIndex];
  return {
    tweetId,
    index: selected.index,
    type: selected.type,
    qualities: selected.qualities,
    media,
  };
}

/**
 * Core Business Logic Handler
 */
async function handleRequest(request, env) {
  try {
    const { searchParams } = new URL(request.url);
    const tweetParam = searchParams.get("tweet");
    if (!tweetParam) {
      return createErrorResponse(400, "Missing tweet parameter");
    }
    const tweetId = extractTweetId(tweetParam) || tweetParam;
    const indexParam = searchParams.get("index");
    const mediaIndex = indexParam ? parseInt(indexParam, 10) : 0;
    const qualityParam = searchParams.get("quality");
    const infoRequested = searchParams.get("info") === "1";
    let syndication = false;

    let guestToken = await tokenManager.getToken();
    if (!guestToken) {
      return createErrorResponse(500, "Failed to obtain guest token");
    }
    console.log(`guest token: ${guestToken}`);
    let tweetRes = await requestTweet(tweetId, guestToken);

    if ([403, 429].includes(tweetRes.status)) {
      guestToken = await tokenManager.getToken(true);
      tweetRes = await requestTweet(tweetId, guestToken);
    }

    // if graphql requests fail, then resort to tweet embed api
    if (!tweetRes.ok) {
      syndication = true;
      tweetRes = await requestSyndication(tweetId);
      if (!tweetRes.ok) {
        console.log("syndication:", tweetRes);
        return createErrorResponse(tweetRes.status, `Failed to fetch tweet data}`);
      }
    }

    const tweetData = await tweetRes.json();
    console.log("tweetData", tweetData);
    const tweetResult = syndication ? tweetData.mediaDetails : tweetData?.data?.tweetResult?.result;
    if (!tweetResult) {
      return createErrorResponse(404, "Tweet not found or unavailable");
    }

    // Extract and validate media using MediaExtractor

    const mediaItems = syndication
      ? tweetResult
      : MediaExtractor.extractAllMedia(tweetResult);
    if (!Array.isArray(mediaItems) || mediaItems.length === 0) {
      return createErrorResponse(404, "No media found in tweet");
    }
    if (
      !Number.isInteger(mediaIndex) ||
      mediaIndex < 0 ||
      mediaIndex >= mediaItems.length
    ) {
      return createErrorResponse(
        400,
        "Requested media index is not available",
        { available: mediaItems.length }
      );
    }
    const mediaItem = mediaItems[mediaIndex];
    let mediaUrl = "";

    if (!["photo", "video", "animated_gif"].includes(mediaItem.type)) {
      return createErrorResponse(400, "Unsupported media type");
    }

    if (infoRequested) {
      return createJsonResponse(
        createMediaInfo(tweetId, mediaItems, mediaIndex)
      );
    }

    if (mediaItem.type === "photo") {
      mediaUrl = buildNamedMediaUrl(mediaItem.media_url_https, "4096x4096");
      if (!mediaUrl) {
        return createErrorResponse(500, "Invalid media URL");
      }
    } else {
      const variant = MediaExtractor.selectQuality(
        mediaItem.video_info?.variants,
        qualityParam
      );
      if (!variant) {
        return createErrorResponse(
          400,
          "Requested quality is not available",
          {
            available: MediaExtractor.getQualityOptions(
              mediaItem.video_info?.variants
            ),
          }
        );
      }
      mediaUrl = variant.url;
    }
    console.log("mediaUrl", mediaUrl);
    // Optionally handle container bug issues.
    if (MediaExtractor.needsFixing(mediaItem)) {
      // Custom processing can be applied here if needed.
    }

    return Response.redirect(mediaUrl, 302);
  } catch (error) {
    return createErrorResponse(500, "Processing failed", error.message);
  }
}

/**
 * Exported Worker Entry Point
 */
export default {
  async fetch(request, env) {
    return rateLimitMiddleware(request, env, () =>
      handleRequest(request, env)
    );
  },
};

