# NOVA Recall on iPhone and Android

The mobile version is an installable web app (a PWA). It runs entirely on the phone, so no computer or Python server needs to be on. It uses the same interface, with a bottom tab bar on phones.

`docs/` is the ready-to-publish app. Rebuild it after any change with `python3 build_pwa.py`.

## 1. Publish it (free, about 5 minutes)

1. On github.com, create a repository (or use the one you have) and upload this whole project, **including the `docs` folder**.
2. Open the repository's **Settings -> Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*, **Branch** to `main`, and **Folder** to `/docs`. Click **Save**.
4. Wait a minute, then refresh. The page shows your address, like `https://YOUR-USERNAME.github.io/YOUR-REPO/`.

Open that address on your computer first to check it loads.

## 2. Install it on a phone

**iPhone (Safari):** open the address in Safari, tap the **Share** button, choose **Add to Home Screen**, then **Add**.

**Android (Chrome):** open the address in Chrome, tap the **three-dot menu**, choose **Install app** (or **Add to Home screen**), then confirm.

An icon named NOVA appears on the home screen. It opens full screen and works offline.

## What works on a phone

| Feature | Android (Chrome) | iPhone |
|---|---|---|
| Questions read aloud | Yes | Yes |
| Answering by voice | Yes | In a Safari tab only. The installed home-screen app can't use speech recognition, so type or open the address in Safari |
| Typing answers | Yes | Yes |
| Quizzes, flashcards, dashboard, timer, notes | Yes, offline too | Yes, offline too |
| Wikipedia definitions, PDF import | Need internet | Need internet |

Notes and progress are stored on that phone only. They don't sync between devices.

## Using it on stage or in class

1. Install it, then open it once with internet so it saves itself for offline use.
2. Use headphones if you want voice answers, to avoid echo.
3. Press **Run demo** on the Quiz tab for a scripted run.

## Real App Store / Play Store apps (optional, later)

The same web app can be wrapped with Capacitor into native iOS and Android packages. Publishing needs an Apple Developer account (about $99 per year) and a Mac with Xcode for iOS, and a Google Play account ($25 one-time) for Android. Inside a native wrapper, voice answers need an extra speech-recognition plugin, so start with the installable version above.
