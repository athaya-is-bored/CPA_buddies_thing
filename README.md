# CPA_buddies_thing — Layout scaffold

This commit adds a frontend-only layout scaffold for the CPA Study Buddies site.

Files added:
- index.html — main layout, topbar, sidebar, sign-in/up modals
- styles.css — base styles implementing your color palette and fonts
- script.js — JS to control sidebar open/close, simple auth gate and seed admin account

Notes:
- This is a purely client-side scaffold (no database). I used localStorage to simulate accounts and a seeded Admin account so you can interact with the auth UI.
- Next steps: hook these screens to a backend or add account management, approval flows, and the pages mentioned in your spec (Messages, Study Buddies, Users, etc.).

If you want, I can now implement a specific page (e.g., Users list) or wire up the Account Setup / approval flow next.
