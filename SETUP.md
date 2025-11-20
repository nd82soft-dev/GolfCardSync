# Local Development Setup

This guide will help you set up the project for local development.

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Firebase project with Firestore enabled
- Google Gemini API key

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Firebase Configuration (Client-side)
VITE_APP_ID=golfcardsync
VITE_FIREBASE_API_KEY=your-api-key-here
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
VITE_INITIAL_AUTH_TOKEN=

# API Server Configuration (Server-side)
GEMINI_API_KEY=your-gemini-api-key-here
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account-email@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
API_PORT=3001
```

**Where to find these values:**
- **Firebase config**: Firebase Console > Project Settings > General > Your apps
- **Firebase Admin credentials**: Firebase Console > Project Settings > Service Accounts > Generate new private key
- **Gemini API key**: Google AI Studio (https://aistudio.google.com/)

### 3. Run the Development Servers

You need to run two servers:

**Terminal 1 - API Server:**
```bash
npm run dev:api
```

**Terminal 2 - Frontend Dev Server:**
```bash
npm run dev
```

The frontend will be available at `http://localhost:5173` (or the port Vite assigns).
The API server will run on `http://localhost:3001`.

### 4. Building for Production

```bash
npm run build
npm run preview
```

## Troubleshooting

### Firebase config is missing
- Make sure your `.env` file exists in the root directory
- Verify all `VITE_FIREBASE_*` variables are set
- Restart the dev server after changing `.env` files

### 404 Error for /api/analyze-scorecard
- Make sure the API server is running (`npm run dev:api`)
- Check that the API server is running on port 3001
- Verify the Vite proxy configuration in `vite.config.js`

### API Server Errors
- Verify `GEMINI_API_KEY` is set correctly
- Check Firebase Admin credentials (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)
- Ensure Firestore is enabled in your Firebase project


