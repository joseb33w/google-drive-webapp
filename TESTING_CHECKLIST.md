# 🧪 Testing Checklist - Google Drive Web App

## ✅ Phase 1: Verify Deployment Infrastructure
- [x] App successfully deployed to Vercel
- [x] Build process completes without errors
- [x] Production URL is accessible

## 🔧 Phase 2: Configure Environment Variables

### A. Vercel Frontend Environment Variables
Set these in Vercel Dashboard → Project Settings → Environment Variables:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAxYh5DqiWjgt1q-1-zeHd568YBb9kIZjI
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=try-mcp-15e08.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=try-mcp-15e08
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=try-mcp-15e08.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=224471734463
NEXT_PUBLIC_FIREBASE_APP_ID=1:224471734463:web:01044be3106794273cce0a
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-FC9N82JT2J
NEXT_PUBLIC_RAILWAY_API_URL=https://google-mcp-tools-access-production.up.railway.app
NEXT_PUBLIC_GOOGLE_REDIRECT_URI=https://triamit.com/api/auth/callback
```

**Status:** ⬜ Not configured yet

### B. Firebase Functions Environment Variables
Set these in `google-drive-webapp/functions/.env`:

```bash
OPENAI_API_KEY=your_openai_api_key_here
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
RAILWAY_API_URL=https://google-mcp-tools-access-production.up.railway.app
```

**Status:** ⬜ Not configured yet
**Action Required:** You need to provide your API keys

---

## 🧪 Phase 3: Test Individual Components

### Test 1: Basic Page Load
- [ ] Visit Vercel URL: `google-drive-webapp-9xjr.vercel.app`
- [ ] Check if page loads without console errors
- [ ] Verify three-panel layout appears

**Expected Result:** Page should load, but Firebase will show errors if env vars not set

---

### Test 2: Firebase Authentication
**Prerequisites:** Frontend env vars must be set in Vercel

- [ ] Click "Sign in with Google" button
- [ ] Complete Google OAuth flow
- [ ] Check if user info appears in left panel
- [ ] Verify no Firebase initialization errors in console

**Expected Result:** User can sign in and see their profile

---

### Test 3: Google Drive File Loading
**Prerequisites:** 
- User must be signed in
- Firebase Functions env vars must be set
- OAuth tokens need to be properly implemented

- [ ] Click "Refresh Files" button
- [ ] Check Network tab for API call to Firebase Function
- [ ] Verify if files appear in left panel

**Expected Result:** Currently will FAIL because of placeholder OAuth tokens

---

### Test 4: Document Editor
**Prerequisites:** Same as Test 3 + a file must be selected

- [ ] Click on a Google Doc in file list
- [ ] Check if document loads in middle panel
- [ ] Try editing the document
- [ ] Click "Save" button

**Expected Result:** Currently will FAIL because of placeholder OAuth tokens

---

### Test 5: AI Chat
**Prerequisites:** Firebase Functions env vars must be set (OpenAI API key)

- [ ] Type a message in chat panel
- [ ] Click "Send"
- [ ] Check if AI responds

**Expected Result:** Will FAIL if OpenAI API key not set in Firebase Functions

---

## 🚨 Known Issues to Fix

### Issue 1: Placeholder OAuth Tokens
**Location:** 
- `src/components/FileList.tsx` (lines 88-89)
- `src/components/DocumentEditor.tsx` (lines 68-71, 118-121)

**Problem:** Code uses `access_token: 'placeholder'` which won't work with real Google APIs

**Fix Required:** Implement proper OAuth token retrieval from Firebase Auth

### Issue 2: Missing Environment Variables
**Location:** Vercel Dashboard + Firebase Functions

**Problem:** App will crash without these

**Fix Required:** Set all environment variables

### Issue 3: Firebase Functions Health Checks
**Location:** Firebase Functions deployment

**Problem:** Cloud Run health checks still failing (known issue)

**Fix Required:** Not critical - functions work despite health check warnings

---

## 📋 Quick Test (5 minutes)

**What You Can Test RIGHT NOW:**

1. **Visit the URL:** `https://google-drive-webapp-9xjr.vercel.app`
2. **Open Browser DevTools** (F12) → Console tab
3. **Look for errors**

**What You'll See:**
- ❌ Firebase initialization error (if env vars not set)
- ✅ Page structure loads correctly
- ❌ Google Sign-in won't work (if env vars not set)

---

## ✅ Definition of "Fully Working"

The app will be **100% functional** when:

1. ✅ All Vercel environment variables are set
2. ✅ All Firebase Functions environment variables are set
3. ✅ Placeholder OAuth tokens are replaced with real implementation
4. ✅ User can sign in with Google
5. ✅ User can see their Google Drive files
6. ✅ User can open and edit documents
7. ✅ User can save changes to documents
8. ✅ AI chat responds to messages

**Current Status:** 30% complete (deployment infrastructure only)

---

## 🎯 Next Action Items

1. **Set Vercel environment variables** (10 minutes)
2. **Set Firebase Functions environment variables** (5 minutes)
3. **Test basic page load** (2 minutes)
4. **Test Google Sign-in** (3 minutes)
5. **Fix OAuth token placeholders** (30-60 minutes of coding)
6. **Test end-to-end functionality** (10 minutes)

---

**Want me to guide you through each step?** 🚀

