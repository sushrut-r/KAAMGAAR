# कामगार — Android APK Build Guide

## Ready-made APK
`releases/kaamgaar-debug.apk` (9.6 MB) — **test/debug version**, kisi bhi Android 7.0+ phone par directly install ho sakta hai.
Play Store ke liye release version baad mein sign karna hoga (keystore chahiye).

**Install karne ka tarika:** APK file ko phone par daalein → tap → "Unknown source install allow karein" → install.

## APK mein kya hai
- **App:** कामगार (app.kaamgaar.in), version 1.0
- **Web bundle:** APK ke andar latest web app embedded hai (camera, GPS native plugins ke saath)
- **Min SDK:** 24 (Android 7.0+) — India ke almost saare phones cover
- **Target SDK:** 36

## Naya APK kab chahiye?
Web app mein koi bhi change aane ke baad (jaise OTP login live hone par), APK rebuild karna hota hai.

### Rebuild steps (apne machine par)
Prerequisites: **JDK 21** (17 kaafi nahi), **Android SDK** (platform 36 + build-tools 36), **Node.js 18+**.

```bash
# 1. Project mein jaayein
cd kaamgaar

# 2. Dependencies install
npm install

# 3. Web app build
npm run build

# 4. Android folder ko web build ke saath sync
npx cap sync android

# 5. APK build
cd android
./gradlew assembleDebug
# (Windows par: gradlew.bat assembleDebug)
```

**Output:** `android/app/build/outputs/apk/debug/app-debug.apk`

### Android Studio se build (optional)
`android/` folder ko Android Studio mein open karein → **Build > Build APK(s)** — ya Run button se phone par directly install.

## Important notes
- `android/local.properties` mein apna `sdk.dir` path set karo (SDK kahan installed hai).
- **2GB RAM wali machine par** gradle OOM ho sakta hai — `android/gradle.properties` mein memory limits pehle se set hain (jvmargs -Xmx900m, in-process Kotlin compiler, 1 worker). Zyada RAM wali machine par default values wapas daal sakte ho.
- **Versions (2026-09-09 build ke liye):** compileSdk 36, targetSdk 36, minSdk 24, Android Gradle Plugin 8.10.1, Capacitor 8.x, Gradle 8.11.1.
- Camera plugin (Capacitor 8) **minSdk 24** require karta hai — 23 par build fail hoga.
- `ic_launcher_background` color sirf `android/app/src/main/res/values/colors.xml` mein hota hai (#FAF6F0 cream) — `ic_launcher_background.xml` khali hai (duplicate resource error se bachav).

## Release APK (Play Store ke liye) — jab chahiye
1. Keystore banao: `keytool -genkey -v -keystore kaamgaar-release.keystore -alias kaamgaar -keyalg RSA -keysize 2048 -validity 10000`
2. Keystore + password ko safe jagah rakho (Play Store account se joda rahega)
3. `cd android && ./gradlew assembleRelease` (signing config `android/app/build.gradle` mein add karna hota hai)
4. `app-release.apk` ko Play Console par upload

## Files is zip mein
| File/Folder | Kaam |
|---|---|
| `kaamgaar-debug.apk` | Ready-to-install test APK |
| `android/` | Complete Android project (Gradle, manifest, res, synced web bundle) |
| `capacitor.config.ts` | Capacitor configuration (app id, name, webDir) |
| `package.json` | JS dependencies + Capacitor plugins (rebuild ke liye zaroori) |
| `APK-BUILD-README.md` | Ye guide |
