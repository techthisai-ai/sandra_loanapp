import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { resetAuthSessionOnAppLaunch } from './utils/authSession.js'
import { initAdminTheme } from './utils/adminTheme.js'

resetAuthSessionOnAppLaunch()
initAdminTheme()

function removeInitialSplash() {
  document.getElementById('app-splash')?.remove()
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

removeInitialSplash()
