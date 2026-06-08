import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { resetAuthSessionOnAppLaunch } from './utils/authSession.js'

resetAuthSessionOnAppLaunch()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
