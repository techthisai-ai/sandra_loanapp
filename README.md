# LoanWeb

A loan management web application built with **React**, **Vite**, **Tailwind CSS v4**, and **Firebase**.

## Tech Stack

- [React 19](https://react.dev/)
- [Vite 8](https://vite.dev/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Firebase 12](https://firebase.google.com/) — Auth, Firestore, Analytics

## Project Structure

```
src/
├── firebase/
│   └── config.js        # Firebase initialization (Auth, Firestore, Analytics)
├── components/
│   └── Navbar.jsx        # Top navigation bar
├── pages/
│   ├── Home.jsx          # Landing page
│   ├── Login.jsx         # Firebase email/password login
│   └── Dashboard.jsx     # Loan stats dashboard with logout
├── App.jsx               # Path-based routing
├── main.jsx              # React entry point
└── index.css             # Tailwind CSS import
```

## Pages

| Route        | Page      | Description                  |
|--------------|-----------|------------------------------|
| `/`          | Home      | Welcome landing page         |
| `/login`     | Login     | Firebase email/password auth |
| `/dashboard` | Dashboard | Loan stats + logout          |

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/your-username/loan-web.git
cd loan-web
```

### 2. Install dependencies

```bash
npm install
```

### 3. Setup environment variables

Create a `.env` file in the root and add your Firebase config:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

> **Never hardcode Firebase credentials in source code.** Use `.env` variables and make sure `.env` is listed in `.gitignore`.

Update `src/firebase/config.js` to use env variables:

```js
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};
```

### 4. Run the development server

```bash
npm run dev
```

### 5. Build for production

```bash
npm run build
```

### 6. Deploy to Firebase Hosting

Production uses **Firebase Hosting only** (project `sandraloanapp-85985`, live URL https://sandraloanapp-85985.web.app).

- **Automatic:** merge to `main` → GitHub Action deploys hosting (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for `FIREBASE_SERVICE_ACCOUNT` secret setup).
- **Manual:**

```bash
npm run build
firebase deploy --only hosting
```

## Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Enable **Authentication** → Email/Password
3. Enable **Firestore Database**
4. Copy your config into `.env`

## Security Note

- Never commit `.env` to version control
- Add `.env` to `.gitignore`
- Restrict your Firebase API key in [Google Cloud Console](https://console.cloud.google.com/)
