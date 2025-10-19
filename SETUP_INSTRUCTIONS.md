# Google Drive Web App - Setup Instructions

## 🎉 What We've Built

A three-panel Google Drive web application similar to Cursor, with:
- **Left Panel**: Google Drive file browser with authentication
- **Middle Panel**: Rich text editor for Google Docs
- **Right Panel**: AI chat assistant for document help

## 🚀 Current Status

✅ **Completed:**
- Next.js project with TypeScript and Tailwind CSS
- Firebase configuration and authentication
- Three-panel layout with responsive design
- Google Drive file listing and selection
- Rich text editor with TipTap
- AI chat interface with OpenAI integration
- Railway backend integration

## 🔧 Environment Setup

Create a `.env.local` file in the root directory with:

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

## 🏃‍♂️ Running the App

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Open in browser:**
   - Local: http://localhost:3000
   - The app will automatically use port 3002 if 3000 is busy

## 🔑 Required API Keys

1. **Firebase Configuration**: Get from Firebase Console > Project Settings > General
2. **Railway API**: Already configured (your deployed backend)
3. **Firebase Functions**: All sensitive API keys (OpenAI, Google OAuth) are securely stored in Firebase Functions

## 🎯 Features

### File Management
- Sign in with Google
- Browse Google Drive files
- Filter to show only Google Docs
- Select files for editing

### Document Editor
- Rich text editing with TipTap
- Real-time content updates
- Save changes to Google Docs
- Reload document content

### AI Assistant
- Chat with AI about your documents
- Get writing suggestions
- Ask for document improvements
- Context-aware responses

## 🚀 Next Steps

1. **Add environment variables** to `.env.local`
2. **Test the app** by signing in with Google
3. **Deploy to Vercel** when ready
4. **Configure custom domain** (triamit.com)

## 🐛 Troubleshooting

- **Sign-in issues**: Check Google OAuth credentials
- **File loading**: Verify Railway backend is running
- **AI chat**: Ensure OpenAI API key is valid
- **CORS errors**: Check Railway CORS configuration

## 📁 Project Structure

```
src/
├── app/
│   ├── api/chat/          # AI chat API endpoint
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main three-panel layout
├── components/
│   ├── FileList.tsx       # Google Drive file browser
│   ├── DocumentEditor.tsx # Rich text editor
│   └── ChatPanel.tsx      # AI chat interface
└── lib/
    └── firebase.ts        # Firebase configuration
```

## 🎨 Styling

- **Tailwind CSS** for styling
- **Responsive design** for all screen sizes
- **Dark/light mode** support
- **Professional UI** similar to Cursor

The app is ready for testing and deployment! 🚀
