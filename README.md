# X Video Downloader Suite

Tampermonkey script + Cloudflare Worker combo for downloading media from X (Twitter)

## Features

- 🎥 One-click video/download button on X tweets
- 🌩️ Cloudflare Worker backend for reliable media resolution
- 🔒 Rate limiting protection (100 requests/min per IP)
- 📷 Supports both videos and images
- 🔧 Configurable API endpoint via Tampermonkey menu

## Installation

### 1. Cloudflare Worker Deployment

1. Create new Cloudflare Worker
2. Add KV namespace named `RATE_LIMIT_KV`
3. Deploy this worker code

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

## Usage

1. Navigate to any X (Twitter) tweet page or timeline
2. Look for download button (↓ icon) in tweet actions
3. Click to open media in new tab
4. Right-click video/image to save

## Technical Notes

- Rate limiting uses Cloudflare KV storage
- Media extraction handles multiple quality levels
- Automatic guest token management

## Troubleshooting

1. If downloads stop working:

   - Check for script updates
   - Re-validate Cloudflare Worker URL
   - Use Tampermonkey's "Check for updates" feature

2. Common error messages:
   - "Rate limit exceeded" - Wait 1 minute before new requests
   - "Failed to obtain guest token" - Worker needs re-deployment
   - "No media found" - Tweet doesn't contain downloadable media

## License

MIT License
