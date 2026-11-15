import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './styles.css'
import { App } from './App'
import { reloadOnce } from './LoadBoundary'

// a chunk deleted by a newer deploy: fetch the new page instead of failing (see LoadBoundary)
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnce()) event.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
