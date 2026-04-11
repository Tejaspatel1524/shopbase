# 🏪 ShopBase — Smart Customer Manager

> A modern, offline-first Progressive Web App (PWA) for shopkeepers to manage customers, track purchases, generate receipts, and share them via WhatsApp — all from their phone.

[![Deploy with Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

---

## 📱 Live Demo

🔗 **[Try ShopBase Live →](https://shopbase-six.vercel.app)**

---

## ✨ Features

### 🔐 Authentication
- **Phone + PIN Login** — Sign up with your phone number and set a 4-digit PIN
- **Google/Gmail Login** — Quick sign-in with your email address
- **Session Persistence** — Stay logged in across visits, auto-login on return
- **Secure Logout** — Log out with a confirmation prompt

### 👤 Shop Owner Profile
- Personalized dashboard with owner name and avatar
- Shop details: name, category, phone, address, GST number
- Edit shop settings anytime
- One-click data export (JSON backup)

### 👥 Customer Management
- **Add Customers** — Name, phone, email, address, and notes
- **Edit & Delete** — Full CRUD operations
- **Search** — Instant search by name or phone number
- **Smart Sorting** — Most recent customers appear first

### 💰 Transaction Tracking
- Record purchases with item name, amount, date
- **Payment Status** — Paid ✅, Pending ⏳, or Partial 🔄
- Partial payment tracking (amount paid vs remaining)
- Transaction notes for warranty info, IMEI numbers, etc.

### 🧾 Receipt Generation
- Professional receipt layout with shop branding
- Auto-generated receipt numbers (SB-0001, SB-0002...)
- Payment status displayed on receipt
- **Print** receipts directly from the app

### 📱 WhatsApp Integration
- Share receipts directly to customer's WhatsApp
- Beautifully formatted text receipt with emojis
- Auto-opens WhatsApp with pre-filled message
- Quick share from transaction list or receipt view

### 📊 Quick Stats Dashboard
- Total customers count
- Total transactions
- Revenue overview
- Pending payments tracker

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Structure** | HTML5 (Single Page Application) |
| **Styling** | Vanilla CSS (Dark theme, responsive) |
| **Logic** | Vanilla JavaScript (ES6+, IIFE pattern) |
| **Storage** | Browser localStorage (offline-first) |
| **Fonts** | [Inter](https://fonts.google.com/specimen/Inter) from Google Fonts |
| **Deployment** | [Vercel](https://vercel.com) (auto-deploy from GitHub) |
| **PWA** | Web App Manifest for installability |

**Zero dependencies. No frameworks. No build step. Pure HTML/CSS/JS.**

---

## 📂 Project Structure

```
shopbase/
├── index.html          # All views, modals & layout (SPA)
├── styles.css          # Complete design system & styles
├── app.js              # Application logic & state management
├── manifest.json       # PWA manifest for installability
└── README.md           # This file
```

---

## 🚀 Getting Started

### Run Locally

No build step required! Just serve the files:

```bash
# Using npx (recommended)
npx http-server . -p 8080

# Or using Python
python -m http.server 8080

# Or just open index.html directly in your browser
```

Then visit `http://localhost:8080`

### Deploy to Vercel

1. **Fork** this repository
2. Go to [vercel.com](https://vercel.com) → New Project
3. Import your forked repo
4. Click **Deploy** — that's it!

Every push to `main` auto-deploys.

---

## 📖 How It Works

### First Time Setup
1. Open the app → **Welcome screen** appears
2. Choose **"Continue with Phone"** or **"Continue with Google"**
3. **Phone flow:** Enter phone number → Create a 4-digit PIN → Set up shop details
4. **Google flow:** Enter Gmail → Set up shop details
5. You're in! Start adding customers 🎉

### Returning Users
1. Open the app → **Auto-login** (session is remembered)
2. All your customers, transactions & settings are exactly as you left them

### Data Storage
All data is stored **locally in your browser** using `localStorage`:

| Key | Purpose |
|---|---|
| `shopbase_auth` | Login session state |
| `shopbase_users` | Registered user accounts |
| `shopbase_data` | Customer & transaction records |
| `shopbase_settings` | Shop configuration |
| `shopbase_receipt_count` | Receipt number counter |

> ⚠️ Data is per-browser. Clearing browser data will erase your records. Use the **Export Data** feature in your profile to create backups.

---

## 🎨 Design

- **Dark theme** with refined indigo/violet accent colors
- **Mobile-first** responsive layout
- **Glass morphism** effects on auth cards
- **Smooth animations** — splash screen, view transitions, fade-ups
- **Professional typography** using Inter font family
- **Touch-optimized** — FAB button, swipe-friendly cards, tap targets

---

## 🗺️ Roadmap

- [ ] Edit transaction status (mark pending → paid)
- [ ] Customer categories/tags (Regular, Wholesale, VIP)
- [ ] Date range filters on stats
- [ ] Multi-item receipts
- [ ] Dark/Light theme toggle
- [ ] Firebase/Supabase cloud sync
- [ ] Service Worker for full offline support
- [ ] Import data from backup
- [ ] CSV/PDF export

---

## 🤝 Contributing

Contributions are welcome! Feel free to:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

## 👨‍💻 Author

**Tejas Patel** — [@Tejaspatel1524](https://github.com/Tejaspatel1524)

---

<p align="center">
  Built with ❤️ for small shopkeepers across India
  <br>
  <strong>ShopBase</strong> — Your Customers, Your Data
</p>
