# JeevSetu — animal rescue report coordinator

A beginner-friendly full-stack MVP. People submit a report, the app checks required fields, and volunteers can review/update cases. It includes a safe demo mode and a clearly separated adapter for the official Gnani AI speech API.

## Requirements
- Node.js 20.19+ or 22.12+
- npm
- VS Code (recommended)

## Run locally
1. Install Node.js from https://nodejs.org and VS Code from https://code.visualstudio.com.
2. Open this folder in VS Code.
3. In the terminal, run `npm install`.
4. Copy `server/.env.example` to `server/.env`.
5. Run `npm run dev`.
6. Open the URL printed by Vite (usually http://localhost:5173).

The API runs on http://localhost:4000. Reports are stored in `server/data/reports.json`.

## Gnani AI integration — important
The challenge requires a real Gnani AI model/API call. The official API platform and current docs are linked below. API paths and request formats can vary by product/version, so do not guess them. Once you have access, follow the official Prisma quick start and configure the exact endpoint and request shape in `server/src/gnani.js`.
- Challenge: https://www.gnani.ai/internship
- API platform: https://app.gnani.ai/voice
- Developer documentation: https://docs.gnani.ai

Never put the API key in React/client code. Keep it in `server/.env`. Do not commit `.env` or publish real personal information/audio. Use fictional demo reports.

## Current MVP features
- Submit report from typed details or browser dictation where supported.
- Validation for required location and report details.
- Dashboard with search and status filters.
- Status updates: New, Reviewing, Assigned, Resolved.
- Duplicate warning for similar open reports with the same location and animal type.
- JSON persistence for local demo.

## Before public deployment
This is an MVP, not a production emergency service. Add authentication and authorization, rate limiting, secure database storage, abuse prevention, and privacy notice before accepting real public reports. Do not promise rescue or dispatch automatically. A human volunteer must review each report.
