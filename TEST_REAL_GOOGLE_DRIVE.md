# 🧪 Test Real Google Drive Integration

## ✅ **Setup Complete!**

Your Google OAuth credentials are configured and Firebase Functions are deployed. Now let's test the real Google Drive integration.

## 🧪 **Testing Steps:**

### **Step 1: Test the App**

1. **Visit**: https://google-drive-webapp-9xjr.vercel.app
2. **Open Browser DevTools** (F12) → Console tab
3. **Click "Sign in with Google"**
4. **Complete OAuth flow** - Grant Drive/Docs permissions
5. **Check Console** - Should see "OAuth tokens stored successfully"

### **Step 2: Test File Loading**

1. **Click "Refresh Files"** button
2. **Check Network tab** in DevTools
3. **Look for**: `googleDriveOperations` API call
4. **Expected**: Your real Google Drive documents should appear

### **Step 3: Test Document Editing**

1. **Click on a Google Doc** from the file list
2. **Check if document loads** in the middle panel
3. **Try editing** the document content
4. **Click "Save"** button
5. **Check if changes** are saved to Google Drive

### **Step 4: Test AI Chat**

1. **Type a message** in the chat panel
2. **Click "Send"**
3. **Check if AI responds** with helpful content

## 🔍 **What to Look For:**

### **✅ Success Indicators:**
- User signs in successfully
- Real Google Drive files appear in left panel
- Document content loads in middle panel
- AI chat responds to messages
- No console errors

### **❌ Error Indicators:**
- "OAuth tokens not found" error
- "API not enabled" error
- "Insufficient permissions" error
- Console shows authentication errors

## 🚨 **If You See Errors:**

### **Error: "OAuth tokens not found"**
- **Solution**: Sign out and sign in again with Google

### **Error: "API not enabled"**
- **Solution**: Enable Google Drive API and Google Docs API in Google Cloud Console

### **Error: "Insufficient permissions"**
- **Solution**: Check that you granted Drive/Docs permissions during sign-in

## 📊 **Check Firestore Database:**

1. Go to [Firestore Console](https://console.firebase.google.com/project/try-mcp-15e08/firestore)
2. Look for `userTokens` collection
3. You should see a document with your user ID containing:
   - `access_token`
   - `refresh_token`
   - `expiry_date`
   - `created_at`
   - `updated_at`

## 🎯 **Expected Results:**

When everything works correctly, you should be able to:

- ✅ **Sign in** with your Google account
- ✅ **See your real Google Drive documents** in the file list
- ✅ **Open and edit real documents** in the editor
- ✅ **Save changes** directly to Google Drive
- ✅ **Chat with AI** about your documents
- ✅ **Create new documents** (if implemented)

## 🔧 **Debugging Commands:**

If you need to check logs:

```bash
# Check Firebase Functions logs
firebase functions:log

# Check specific function logs
firebase functions:log --only googleDriveOperations
```

## 🎉 **Success!**

If all tests pass, your Google Drive web app is now fully functional with real Google Drive integration!

---

**Status: Ready for Production Testing** 🚀
