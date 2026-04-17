# ShopBase - Customer Manager

ShopBase is a smart, mobile-friendly customer management application designed specifically for shopkeepers. It helps retail business owners easily track customers, record purchases, and manage pending payments all from their browser or mobile device.

## Features

- **Secure Authentication:** Multi-method login using Google Account or Phone Number with a 4-digit PIN.
- **Dashboard & Analytics:** Quick overview of your store's performance with stats on Total Customers, Transactions, Total Revenue, and Pending Collections.
- **Customer Directory:** Add new customers, search instantly by name or phone, and maintain a detailed profile for each customer including notes and visit history.
- **Transaction Tracking:** Record items sold or services provided, track amounts, and update payment statuses (Paid, Pending, Partial).
- **Digital Receipts:** Generate professional digital receipts for any transaction. Options to print or share directly with customers via WhatsApp.
- **Shop Settings:** Customize your shop profile, add GST details, category, and a tagline to be displayed on receipts.
- **Offline & Secure:** Customer data is securely persisted locally in the browser. Export your data whenever you need it.
- **Progressive Web App (PWA):** Fully responsive design that feels like a native app. Can be installed directly on mobile devices (iOS and Android).

## Technologies Used

- **HTML5** for semantic structure and accessible layout.
- **Vanilla CSS3** for modern, responsive styling, utilizing custom properties (variables) and grid/flexbox layouts.
- **Vanilla JavaScript** for dynamic DOM manipulation, client-side routing, object-oriented state management, and local storage interactions.

## Getting Started

1. Clone or download the repository.
2. Open `index.html` in any modern web browser or serve it via a local development server (e.g., `Live Server` extension in VS Code).
3. Follow the onboarding flow to set up your shop profile and start managing your customers!

## Deployment

The application is fully client-side and can be hosted for free on static hosting platforms like [Vercel](https://vercel.com/), [Netlify](https://netlify.com/), or GitHub Pages.

## Project Structure

- `index.html`: The main entry point containing the application's structure.
- `styles.css`: All the styling rules, animations, and responsive designs.
- `app.js`: The core logic handling UI state, authentication flow, and data management.
- `manifest.json`: Web app manifest for PWA installation.
