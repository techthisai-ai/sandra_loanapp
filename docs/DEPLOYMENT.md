# Deployment (Firebase Hosting only)

Production: **Firebase Hosting** on project `cafe-c396e`  
Live URL: https://cafe-c396e.web.app

This repo does **not** use Netlify or Vercel for deployment.

## Automatic deploy (main branch)

When changes are **merged or pushed to `main`**, GitHub Actions runs:

`.github/workflows/firebase-hosting.yml` → **Build (Vite → dist)** then **Deploy production (cafe-c396e.web.app)**

1. `npm ci` → `npm run build` → `dist/`
2. Deploy **hosting only** to the live channel (`cafe-c396e.web.app`)

Pull requests to `main` run **Build** and **Deploy PR preview** (requires the secret below).

**Safety:** The workflow never runs `firebase deploy` without `--only hosting`. It does not modify Firestore data, Auth users, or Storage.

### One-time setup: GitHub secret (required)

**Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|------|--------|
| `FIREBASE_SERVICE_ACCOUNT` | Entire JSON from a Firebase/GCP service account key |

**Create the key:**

1. [Firebase Console → Service accounts](https://console.firebase.google.com/project/cafe-c396e/settings/serviceaccounts/adminsdk) → **Generate new private key**
2. Paste the full JSON into the secret (never commit the file)

**IAM roles** for that service account (GCP → IAM):

- `Firebase Hosting Admin` — `roles/firebasehosting.admin`
- `Firebase Authentication Admin` — `roles/firebaseauth.admin` (preview URL auth domains)
- `API Keys Viewer` — `roles/serviceusage.apiKeysViewer`

### Branch protection (recommended)

**Settings → Branches → `main` → Required status checks:**

- `Build (Vite → dist)` — always
- `Deploy production (cafe-c396e.web.app)` — after the secret is set and one successful main deploy

**Do not require** Netlify/Vercel check names (`Header rules`, `Redirect rules`, `netlify/*`, `Vercel`).

### Remove legacy Netlify / Vercel (fixes stuck “queued” checks)

Checks like **Header rules**, **Redirect rules**, or **netlify/…/deploy-preview** come from the **Netlify GitHub App**, not this repo. They can stay **queued** forever and block merges.

1. https://github.com/techthisai-ai/loan-web/settings/installations → **Netlify** → Configure → remove this repository, or uninstall  
2. Same for **Vercel** if installed  
3. **About** (repo home): set website to `https://cafe-c396e.web.app` (remove `loan-web-mu.vercel.app`)  
4. **Settings → Environments**: if a `production` environment exists with **Required reviewers**, either remove reviewers or delete the environment — the workflow no longer uses GitHub Environments (avoids deploy jobs stuck in **queued**)

### Troubleshooting

| Symptom | Fix |
|--------|-----|
| “This branch has not been deployed” on a PR | Add `FIREBASE_SERVICE_ACCOUNT`; re-run **Firebase Hosting** workflow |
| Deploy job queued for minutes | Remove Netlify required checks; disable `production` environment approval |
| Deploy job fails immediately | Secret missing or invalid JSON; fix IAM roles above |
| Build fails | Run `npm ci && npm run build` locally; fix errors, push again |
| Push to `main` does not deploy | Confirm `.github/workflows/firebase-hosting.yml` exists on `main` |

### Manual deploy (fallback)

```bash
npm run build
firebase deploy --only hosting
```

Use `npm run deploy:hosting` only when you also intend to update Firestore rules.

**Do not** run seed/reset scripts against production.

## Manual workflow trigger

**Actions → Firebase Hosting → Run workflow** (branch `main`, requires secret).

## Firebase config

`firebase.json` → `hosting.public: "dist"`, SPA rewrite to `/index.html`.
