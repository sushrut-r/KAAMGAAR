# 🚀 Is folder ko GitHub pe kaise push karein

Ye folder GitHub-push ready hai — `.env.local`, photos backup, APK, WPR/PPT,
aur saare secrets **bahar** hain. `.gitignore` sab cover karta hai.

## Tarika 1 — Asaan (browser se, bina git commands ke)
1. github.com pe login karo → **New repository** banao (naam: `kaamgaar`)
   ⚠️ README/.gitignore **add mat karo** (folder mein pehle se hain)
2. "uploading an existing file" wala link pe click karo
3. Is folder ke saare files+folders drag-drop karo → **Commit**

## Tarika 2 — VS Code / terminal se (git ke saath)
```bash
cd kaamgaar            # extract kiye folder mein
git init
git add .
git commit -m "KaamGaar — hiring platform for skilled workers (initial commit)"
# apna repo GitHub pe bana ke:
git remote add origin https://github.com/APNA-USERNAME/kaamgaar.git
git branch -M main
git push -u origin main
```

## ⚠️ Yaad rakho
- `functions/otp_send.js` ab safe template hai (khali placeholders)
- Real keys `functions/otp_send.js.local` mein hain — **wo file GitHub pe kabhi mat push karo**
  (`.gitignore` khud rokta hai)
- `.env.local` bhi kabhi push nahi hota (`.gitignore` mein hai)
- Agar kabhi galti se push ho jaye toh: GitHub se file hatao + key Turant rotate karo
  (InsForge console se nayi admin key banao)
