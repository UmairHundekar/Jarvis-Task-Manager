# Jarvis Task Scheduler

An intelligent task management assistant powered by Cloudflare Workers AI (Llama 3), built on Cloudflare Workers, Durable Objects, and Pages. Inspired by Jarvis from Iron Man, this application provides real-time task scheduling with AI-generated schedules and personalized commentary. Should be accessible from https://jarvis-task-manager.pages.dev/.

## Features

- 🤖 **Jarvis-style AI Assistant**: Get personalized, Iron Man-style commentary on your progress
- 📅 **Smart Task Scheduling**: AI-generated schedules optimized for your tasks with realistic time estimates
- ⏰ **Real-time Progress Tracking**: Live updates on task progress, time remaining, and break times
- 💬 **Interactive Chat**: Chat with Jarvis to ask questions about your schedule
- 💾 **Persistent State**: Your schedule is saved using Durable Objects

## Architecture

- **Frontend**: Cloudflare Pages (HTML/CSS/JavaScript)
- **Backend**: Cloudflare Workers
- **State Management**: Durable Objects (SQLite-based)
- **AI**: Workers AI (Llama 3.1 / Llama 2 / Mistral with fallback)

## Quick Start

Should be accessible from https://jarvis-task-manager.pages.dev/ but to host locally instructions below

### Prerequisites

Need Cloudflare account and Node.js

### Setup Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Authenticate with Cloudflare:**
   ```bash
   npx wrangler login
   ```

3. **Enable Workers AI:**
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - Navigate to **Workers & Pages** → **Workers AI**
   - Click **Enable Workers AI**

4. **Enable Durable Objects (for production):**
   - Go to **Workers & Pages** → **Overview**
   - Upgrade to **Workers Paid** plan ($5/month) for production
   - Note: Local testing works on free tier

5. **Deploy the Worker:**
   ```bash
   npm run deploy
   # OR
   npx wrangler deploy
   ```
   
   After deployment, note your Worker URL (e.g., `jarvis-task-scheduler.your-subdomain.workers.dev`)

6. **Update frontend API URL:**
   
   Edit `public/app.js` and update line 2:
   ```javascript
   const API_BASE_URL = 'https://jarvis-task-scheduler.your-subdomain.workers.dev';
   ```
   Replace `your-subdomain` with your actual Cloudflare subdomain.

7. **Deploy the Frontend:**
   
   **Option A: Cloudflare Pages (Dashboard)**
   - Go to **Workers & Pages** → **Create application** → **Pages**
   - Choose **Upload assets**
   - Upload the `public` folder
   - Click **Deploy**
   
   **Option B: Cloudflare Pages (CLI)**
   ```bash
   cd public
   npx wrangler pages deploy . --project-name=jarvis-frontend
   ```

## Local Development

### Run the Worker Locally

```bash
npm run dev
# OR
npx wrangler dev
```

This starts the Worker on `http://localhost:8787`

### Test the Frontend Locally

1. Update `public/app.js` temporarily:
   ```javascript
   const API_BASE_URL = 'http://localhost:8787';
   ```

2. Serve the frontend:
   ```bash
   cd public
   python3 -m http.server 8000
   # OR
   npx http-server -p 8000
   ```

3. Open `http://localhost:8000` in your browser

## Usage

1. **Create a Schedule:**
   - Enter your tasks for the day (one per line or comma-separated)
   - Click "Create Schedule"
   - Jarvis will create an optimized schedule with realistic time estimates

2. **Track Progress:**
   - Tasks automatically become active when their start time arrives
   - See real-time progress, time remaining, and break times
   - Get Jarvis-style commentary on your progress

3. **Chat with Jarvis:**
   - Use the chat interface to ask questions about your schedule
   - Get help and guidance from your AI assistant

## Project Structure

```
.
├── src/
│   ├── index.ts              # Main Worker entry point
│   ├── durable-object.ts     # Durable Object for state management
│   └── llm-service.ts        # LLM integration service
├── public/
│   ├── index.html            # Frontend HTML
│   ├── app.js                # Frontend JavaScript
│   └── styles.css            # Frontend styles
├── wrangler.toml             # Cloudflare configuration
├── package.json              # Dependencies
└── README.md                 # This file
```

## Configuration

### Worker Configuration (`wrangler.toml`)

The `wrangler.toml` is pre-configured with:
- Worker name and entry point
- Durable Object bindings
- Workers AI binding
- Migrations for Durable Objects

### Frontend Configuration (`public/app.js`)

Update the `API_BASE_URL` constant with your Worker URL after deployment.

## Troubleshooting

### Workers AI Issues

- **Model not found errors**: The code automatically tries multiple models:
  - `@cf/meta/llama-3.1-8b-instruct` (primary)
  - `@cf/meta/llama-2-7b-chat-int8` (fallback)
  - `@cf/mistral/mistral-7b-instruct-v0.1` (fallback)
- Check that Workers AI is enabled in your Cloudflare dashboard
- Verify you have sufficient Workers AI quota

### Durable Objects Issues

- **Local development**: Works on free tier with `wrangler dev`
- **Production**: Requires Workers Paid plan ($5/month)
- Check your `wrangler.toml` has the correct migrations

### Timezone Issues

- Times are stored in UTC and automatically converted to user's local timezone
- The frontend uses `toLocaleTimeString()` for display

### Chat Not Working

- Check Worker logs: `npx wrangler tail`
- Ensure Workers AI is enabled and has quota
- The system will automatically try fallback models

## API Endpoints

- `POST /api/initialize` - Create a new schedule with tasks
- `GET /api/state/:userId` - Get current state
- `GET /api/progress/:userId` - Get current progress with commentary
- `POST /api/task/update` - Update task completion status
- `POST /api/chat` - Send a chat message to Jarvis

## Cost Estimate

- **Free Tier**: 
  - Workers AI: 10,000 requests/day
  - Workers: 100,000 requests/day
  - Durable Objects: Local testing only
  
- **Paid Tier ($5/month)**:
  - Everything above +
  - Durable Objects for production
  - More Workers AI requests
  - More Workers requests

## Technology Stack

- **Cloudflare Workers** - Serverless runtime
- **Cloudflare Durable Objects** - Persistent state
- **Cloudflare Workers AI** - LLM inference
- **Cloudflare Pages** - Frontend hosting
- **TypeScript** - Type safety
- **itty-router** - HTTP routing

## License

MIT License - feel free to use this for your own projects!

---

**Made with ❤️ using Cloudflare Workers, Durable Objects, and Workers AI**
