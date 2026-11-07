# X Video Downloader Suite

Tampermonkey script + Cloudflare Worker combo for downloading media from X (Twitter)

Inspired from https://github.com/imputnet/cobalt

## Features

- 🎥 One-click video/download button on X tweets
- 🖼️ Select media when a tweet contains multiple photos or videos
- 🎚️ Choose video quality from an X-style menu (for example 720p or 360p)
- 🌩️ Cloudflare Worker backend for reliable media resolution
- 🔒 Rate limiting protection (100 requests/min per IP)
- 📷 Supports both videos and images
- 🔧 Configurable API endpoint via Tampermonkey menu

## Installation

### 1. Cloudflare Worker Deployment

1. Create new Cloudflare Worker
2. Add KV namespace named `RATE_LIMIT_KV`
3. Deploy this worker code
   - Redeploy if you previously deployed an older version. The quality menu requires the updated worker.

```javascript
// worker.js contents from provided codebase
```

4. Note your worker URL (format: `your-subdomain.workers.dev`)

### 2. Tampermonkey Script Installation

1. Install Tampermonkey browser extension
2. Create new user script and paste contents of `user.js`
3. Configure worker URL:
   - Click Tampermonkey icon > "Set x Video Resolver API URL"
   - Enter your Cloudflare Worker URL (e.g., `https://your-worker.workers.dev`)
   - The host must match the `@connect` entry in `user.js`. Update it if you use a custom domain.

## Usage

1. Navigate to any X (Twitter) tweet page or timeline
2. Look for download button (↓ icon) in tweet actions
3. Click it:
   - If the tweet has multiple media items, choose one from the media menu.
   - If the selected video has multiple qualities, choose one from the quality menu.
   - Photos and single-quality videos open directly.
4. Right-click video/image to save

## Technical Notes

- Rate limiting uses Cloudflare KV storage
- Media extraction handles multiple media items and quality levels
- Automatic guest token management
- Metadata uses `GM_xmlhttpRequest` because x.com CSP blocks direct `fetch` to `*.workers.dev`
- `@connect` in `user.js` must include the resolver host
- `?tweet=<id>&info=1` returns all media and quality metadata with CORS enabled
- `?tweet=<id>&index=<n>` selects a zero-based media index (default 0)
- `?tweet=<id>&quality=<height>` redirects to the selected MP4 variant
- Without `quality`, the worker keeps returning the highest-bitrate MP4

## Troubleshooting

1. If downloads stop working:

   - Check for script updates
   - Re-validate Cloudflare Worker URL
   - Use Tampermonkey's "Check for updates" feature

2. Common error messages:
   - "Rate limit exceeded" - Wait 1 minute before new requests
   - "Failed to obtain guest token" - Worker needs re-deployment
   - "No media found" - Tweet doesn't contain downloadable media
   - "Resolver does not support media selection" - Redeploy the updated `worker.js`
   - No media or quality menu - Confirm `user.js` is version 1.5 or newer
   - Metadata request fails - Check that the configured resolver host matches `@connect` in `user.js`

## License

MIT License
