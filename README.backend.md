# CPA Study Buddies - Backend

This adds a minimal Node/Express + SQLite backend to provide persistent storage for accounts, chats, messages, and notifications.

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
