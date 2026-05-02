import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AgentSessionProvider } from './context/AgentSessionContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AgentSessionProvider>
      <App />
    </AgentSessionProvider>
  </StrictMode>,
)
