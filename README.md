# DeskFlow — Support Ticket Triage Board

DeskFlow is a modern, responsive Support Ticket Triage Board designed for support teams to manage and prioritize tickets. It enforces strict status transitions, monitors SLA targets, flags breaches in real-time, and provides advanced filters and statistics.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/rajvansh-rv/deskflow-triage-board)

## Live URLs
- **Frontend App (Netlify)**: [https://deskflow-triage-board.netlify.app](https://deskflow-triage-board.netlify.app)
- **Backend API (Tunnelling localhost:5000)**: [https://635681703eaa54.lhr.life](https://635681703eaa54.lhr.life)

---

## Tech Stack
- **Frontend**: React, Vite, CSS Variables (Dark theme, glassmorphic UI, responsive Flexbox/Grid).
- **Backend**: Node.js, Express.js, Mongoose, MongoDB.

---

## Features

### 1. Board Columns
Four status columns:
- **Open**: Newly filed tickets.
- **In Progress**: Active issues.
- **Resolved**: Addressed issues (stores `resolvedAt`).
- **Closed**: Completed issues.

### 2. SLA Breach Tracking
Dynamically calculates age and SLA breaches based on priority:
- **Urgent**: 1 hour limit.
- **High**: 4 hours limit.
- **Medium**: 24 hours limit.
- **Low**: 72 hours limit.

### 3. Transition Rules
- **Forward only**: `open` ➔ `in_progress` ➔ `resolved` ➔ `closed`.
- **Backward**: Only `resolved` ➔ `in_progress` is allowed (clears `resolvedAt`).
- **Invalid movements** (e.g. `open` ➔ `resolved`) are rejected with `400 Bad Request`.

### 4. Interactive Elements
- Stats strip updating in real-time.
- Priority and SLA breach filter controls.
- Inline creation form with client and server-side validations.

---

## Local Setup

### Backend
1. Go to `backend/`
2. Run `npm install`
3. Create `.env` file:
   ```env
   PORT=5000
   MONGODB_URI=your_mongodb_connection_uri
   ```
4. Run `npm run dev` to start server.

### Frontend
1. Go to `frontend/`
2. Run `npm install`
3. Create `.env` file:
   ```env
   VITE_API_URL=http://localhost:5000
   ```
4. Run `npm run dev` to start Vite dev server.
