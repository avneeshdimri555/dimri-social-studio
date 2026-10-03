# DIMRI Social Studio

AI-assisted social media content workspace by DIMRI STUDIO. Create captions, content ideas, short-video scripts and hashtags; edit and save drafts; and organize planned content.

## Run locally
- Requires Node.js 18+
- Run npm start
- Open http://localhost:3000

No package dependencies are required. Drafts and calendar entries are stored in browser localStorage.

## Gemini setup
Set GEMINI_API_KEY in the server environment. Optionally set GEMINI_MODEL (default: gemini-2.5-flash). Never expose the API key in frontend code or commit it to Git. Without the key, the generation endpoint returns a setup error.

## Current scope
Functional in source: responsive workspace navigation, content brief, server-side Gemini request, editable results, copy, local draft save, local calendar and JSON export.

Not integrated: social OAuth, direct publishing, live analytics, billing, cloud database, authentication, automated posting or external media storage. No fake account status or performance metrics are displayed.

See PROJECT_STATUS.md for verification status and next steps.
