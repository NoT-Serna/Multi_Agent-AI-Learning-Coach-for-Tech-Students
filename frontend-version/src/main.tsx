import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AgentSessionProvider } from './context/AgentSessionContext.tsx'
import { ChatHistoryProvider } from './context/ChatHistoryContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AgentSessionProvider>
      <ChatHistoryProvider>
        <App />
      </ChatHistoryProvider>
    </AgentSessionProvider>
  </StrictMode>,
)
