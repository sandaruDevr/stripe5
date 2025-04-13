# Summary.gg Server

Backend server for Summary.gg - AI-powered video summarization platform.

## Features

- Stripe integration for subscription management
- Firebase Admin integration for user management
- Express.js REST API
- TypeScript support

## Prerequisites

- Node.js 18+
- npm or yarn
- Firebase project
- Stripe account

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_PRO_PLAN_PRICE_ID=price_your_price_id

# Firebase Admin
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email

# Server
PORT=3000
CLIENT_URL=http://localhost:5173
```

## Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## API Endpoints

### Health Check
- `GET /health` - Check server status

### Stripe Integration
- `POST /webhooks/stripe` - Stripe webhook endpoint
- `POST /api/stripe/create-checkout-session` - Create Stripe checkout session
- `POST /api/stripe/create-portal-session` - Create Stripe customer portal session

## License

MIT