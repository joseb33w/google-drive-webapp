# Environment Variables Setup

Create a `.env.local` file in the root directory with the following variables:

```bash
# Railway Backend API
NEXT_PUBLIC_RAILWAY_API_URL=https://google-mcp-tools-access-production.up.railway.app

# Firebase Configuration (Public keys - safe to expose)
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=try-mcp-15e08.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=try-mcp-15e08
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=try-mcp-15e08.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=224471734463
NEXT_PUBLIC_FIREBASE_APP_ID=1:224471734463:web:01044be3106794273cce0a
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-FC9N82JT2J

# Google OAuth Redirect URI
NEXT_PUBLIC_GOOGLE_REDIRECT_URI=https://triamit.com/api/auth/callback
```

## 🔒 **SECURITY NOTE:**
- **OpenAI API Key**: Securely stored in Firebase Functions environment
- **Google OAuth Credentials**: Securely stored in Firebase Functions environment
- **Firebase API Key**: Public key (safe to expose in frontend)
- **Railway Backend**: No longer needs sensitive credentials

## Required Setup:

1. **Firebase Configuration**: Get from Firebase Console > Project Settings > General
2. **Firebase Functions Environment**: Set up API keys in Firebase Functions
3. **Railway API**: Optional fallback (no sensitive credentials needed)

## Firebase Functions Environment Variables:
```bash
# Set these in Firebase Functions
OPENAI_API_KEY=your_openai_api_key_here
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
RAILWAY_API_URL=https://google-mcp-tools-access-production.up.railway.app
```

## 🔐 **Complete Security Migration:**
- ✅ All API keys moved to Firebase Functions
- ✅ Frontend only contains public Firebase configuration
- ✅ Google OAuth handled server-side in Firebase Functions
- ✅ OpenAI API calls routed through secure Firebase Functions
- ✅ Railway backend no longer needs sensitive credentials
