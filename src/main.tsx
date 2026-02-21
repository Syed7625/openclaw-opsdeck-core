import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App'
import CommandPage from './pages/CommandPage'
import SitesPage from './pages/SitesPage'
import CronsPage from './pages/CronsPage'
import ForgePage from './pages/ForgePage'
import ReposPage from './pages/ReposPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <CommandPage /> },
      { path: 'sites', element: <SitesPage /> },
      { path: 'crons', element: <CronsPage /> },
      { path: 'forge', element: <ForgePage /> },
      { path: 'repos', element: <ReposPage /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
