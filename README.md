# ZeroDollars – Every Dollar Has a Job

*A beautiful, offline-first, envelope-budgeting web app inspired by YNAB® methodology – 100% client-side, no accounts, no tracking.*

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0) [![PWA](https://img.shields.io/badge/PWA-Installable-green)](https://web.dev/progressive-web-apps/) ![No Tracking](https://img.shields.io/badge/Privacy-No_Tracking-ff69b4)

![App Screenshot](https://github.com/ciphernom/ZeroDollars/blob/434ab6f37cfb30e441ece78648d6a353c8a02b00/budgetscreen.png)

## Features

- **Zero-Based Budgeting** – Give every dollar a job (or you have Zero Dollars).
- **Envelope System** – Classic envelope categories (jars) with real-time balances.
- **Smart-Fund™** – One-click intelligent allocation to scheduled bills, monthly goals & sinking funds.
- **Goal Tracking** – Target balance or monthly funding goals with progress bars.
- **Full Offline PWA** – Works without internet; installable on desktop & mobile.
- **Device Sync via PeerJS** – Real-time sync between phone, tablet & desktop (no server).
- **CSV Import with AI Categorisation** – Smart payee matching + clustering of recurring transactions.
- **Credit Card Support** – Automatic payment jars and debt handling.
- **Reconciliation, Reports, Charts, Age of Money** – Everything you expect from a serious budgeting tool.
- **PIN Lock** – Optional 4-digit PIN protection.
- **Dark/Light Theme** – Beautiful, fully responsive design.
- **Export / Import** – Full JSON backup & restore.

All data stays **on your device**. No analytics, no cloud, no third-party anything.

## Browser Requirements

Requires a modern browser (Chrome, Edge, Safari, Firefox) with ES6+ support for:
- **Crypto API** (for PIN hashing and Sync security)
- **Web Workers** (for background ML processing)
- **IndexedDB** (for local storage)

## Live Demo

Open in your browser: https://ciphernom.github.io/ZeroDollars/  
(or host it yourself – see below)


## Installation (as PWA)

1. Open the app in Chrome / Edge / Safari.
2. Click the install icon in the address bar (or Add to Home Screen on mobile).
3. Done – it now works offline forever.

## Self-Hosting (30 seconds)

```bash
# 1. Clone or download this repo
git clone https://github.com/ciphernom/ZeroDollars.git
cd zerodollars

# 2. serve with any static server:
npx serve .
# Then visit http://localhost:3000
```

## Tech Stack

This project is built with **Vanilla JS** (ES Modules) and **CSS Variables**.

- **Core:** `HTML5`, `CSS3`, `JavaScript (ES6+)`
- **Storage:** `IndexedDB` (via internal wrapper)
- **Sync:** `PeerJS` (WebRTC) + `Merkle Trees` (for state consistency)
- **ML:** `Web Workers` (for background transaction categorization)
- **Security:** `Web Crypto API` (PBKDF2 for PIN hashing, HMAC for Sync signatures)
