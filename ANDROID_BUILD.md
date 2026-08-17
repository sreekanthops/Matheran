# Matheran Trek 2025 — Android APK Build Guide

This app supports **two modes**:
1. **PWA (Recommended)** — Install directly on Android via Chrome. No app store needed.
2. **Native APK** — Built with Capacitor + Android Studio.

---

## Option 1: PWA — Install on Android (Easiest, Recommended)

> Everyone just visits the URL in Chrome and taps "Add to Home Screen". Done.

### Step 1 — Set up Firebase (Free, Real-time sync for all 13 members)

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it `matheran-trek`
3. Enable **Realtime Database** → Start in **test mode**
4. Enable **Storage** → Start in **test mode**
5. Go to **Project Settings → General → Your apps → Add Web App**
6. Copy the config object and replace in `public/index.html`:

```js
const FB_CONFIG = {
  apiKey:            "YOUR_ACTUAL_KEY",
  authDomain:        "matheran-trek.firebaseapp.com",
  databaseURL:       "https://matheran-trek-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "matheran-trek",
  storageBucket:     "matheran-trek.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123"
};
```

### Step 2 — Deploy / Host the app

**Option A: Firebase Hosting (free)**
```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # select public/ as web root
firebase deploy
```

**Option B: Railway / Render (free tier)**
- Push this repo to GitHub
- Connect to [railway.app](https://railway.app) or [render.com](https://render.com)
- Set start command: `node server.js`
- Get a URL like `https://matheran-trek.railway.app`

### Step 3 — Install on Android (all 13 members)

1. Open the hosted URL in **Chrome on Android**
2. Tap the **⋮ menu → Add to Home Screen**
3. The app installs like a native app with the mountain icon
4. Works offline too (service worker caches the UI)

---

## Option 2: Native APK with Capacitor

### Prerequisites
- [Android Studio](https://developer.android.com/studio) installed
- Java 17+ (already installed)
- Node.js 18+

### Steps

```bash
# 1. Install Capacitor
npm install @capacitor/core @capacitor/cli @capacitor/android

# 2. Update capacitor.config.json — set "url" to your hosted Firebase URL
#    (The app points to your live server, so data stays in sync)

# 3. Initialize and add Android platform
npx cap init "Matheran Trek 2025" "com.matherantrek.app" --web-dir public
npx cap add android

# 4. Open in Android Studio
npx cap open android

# 5. In Android Studio:
#    Build → Generate Signed Bundle/APK → APK
#    Share the APK file with all 13 members via WhatsApp

# 6. To update the app after changes:
npx cap sync
npx cap open android
```

### Share APK via WhatsApp
- Build the APK in Android Studio (debug APK is fine for internal use)
- The APK file is at: `android/app/build/outputs/apk/debug/app-debug.apk`
- Send it on the WhatsApp group — everyone installs it
- Since the app points to Firebase, **all data is live and shared in real-time**

---

## Architecture

```
┌─────────────────────────────────────────┐
│           Firebase (Free Tier)           │
│                                          │
│  Realtime DB ──── members               │
│               ──── expenses             │
│               ──── checklist            │
│               ──── folders              │
│               ──── photos (metadata)    │
│                                          │
│  Storage     ──── photos (actual files) │
└────────────────────┬────────────────────┘
                     │ real-time sync
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   Phone 1       Phone 2      Phone 3
  (Sreekanth)    (Pooja)       (Sai)
   PWA/APK       PWA/APK      PWA/APK
```

**Any change by one person → instantly visible to all others.**

---

## Local Development (without Firebase)

```bash
npm install
node server.js
# Open http://localhost:3000
```

The app auto-detects if Firebase is not configured and falls back to the local SQLite server.
