import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import '@vscode/codicons/dist/codicon.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
