# Deployment (Firebase Hosting)

Production Firebase project: **`sandraloanapp-85985`** (same project as Firestore data)  
Live URL: **https://sandraloanapp-85985.web.app**

Hosting deploys the React app only. **Customer, employee, and loan data live in Firestore** on this project — not inside the hosting files.

## Why data can exist in Firebase Console but not on the website

| Cause | What to check |
|--------|----------------|
| **Wrong hosted URL** | Open `https://sandraloanapp-85985.web.app` (not an old project like `cafe-c396e.web.app`). |
| **Not signed in** | The app loads Firestore data only after admin/employee login. |
| **Authorized domain missing** | Firebase Console → **Authentication** → **Settings** → **Authorized domains** → add your hosting URL (e.g. `sandraloanapp-85985.web.app`). |
| **Stale deploy** | Run `npm run build` then `firebase deploy --only hosting` so the latest app is published. |
| **Employee centre filter** | Employees only see customers in their **assigned centres**; use admin login to see all customers. |

## Automatic deploy (main branch)

`.github/workflows/firebase-hosting.yml` → **Build** then **Deploy** to `sandraloanapp-85985`.

1. `npm ci` → `npm run build` → `dist/`
2. Deploy **hosting only** to `sandraloanapp-85985.web.app`

### GitHub secret (one-time)

**Settings → Secrets and variables → Actions**

| Name | Value |
|------|--------|
| `FIREBASE_SERVICE_ACCOUNT` | Full JSON key for project **sandraloanapp-85985** |

Create key: [Firebase Console → Service accounts](https://console.firebase.google.com/project/sandraloanapp-85985/settings/serviceaccounts/adminsdk) → **Generate new private key**

Service account needs **Firebase Hosting Admin** (`roles/firebasehosting.admin`).

## Manual deploy (recommended after local changes)

```bash
npm run build
firebase deploy --only hosting
```

Or:

```bash
npm run deploy:hosting
```

(Also updates Firestore rules if you changed `firestore.rules`.)

## Local development vs production data

| Environment | Database |
|-------------|----------|
| `npm run emulators` + `npm run dev` | **Local emulator** — does not affect deployed site |
| `npm run build` + deploy | **Live Firestore** `sandraloanapp-85985` |

## Firebase config in the app

All environments use `src/firebase/config.js` with project id **`sandraloanapp-85985`**.  
Production builds never connect to localhost emulators.
