# CPA Study Buddies - Backend

This adds a minimal Node/Express + SQLite backend to provide persistent storage for accounts, chats, messages, and notifications.

Files added:
- package.json
- server.js
- data.sqlite3 (created at runtime)

How to run locally
1. Install dependencies:
   npm install
2. Start the server:
   npm run start
   or for development with auto-restart:
   npm run dev
3. Open the frontend at http://localhost:3000 (the server serves the repository root, including index.html)

Notes
- The backend seeds an Admin account (email: athayacraven+admin@gmail.com password: Admin) on first run.
- Passwords are hashed with bcrypt.
- This is a minimal API for local development. It does not include sessions or token-based authentication yet; endpoints are simple and intended for iterative development.
- Next steps: integrate frontend to call these endpoints instead of using localStorage, add JWT or session-based auth, add input validation and rate-limiting, and consider production hardening.
