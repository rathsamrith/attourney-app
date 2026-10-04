import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from 'react-oidc-context'
import { BrowserRouter } from 'react-router'
import '@/i18n'
import '@/api/client'
import { AuthGate } from '@/app/auth-gate'
import { AppRoutes } from '@/app/router'
import { oidcConfig, onSigninCallback } from '@/auth/oidc'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider {...oidcConfig} onSigninCallback={onSigninCallback}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <BrowserRouter>
            <AuthGate>
              <AppRoutes />
            </AuthGate>
          </BrowserRouter>
          <Toaster richColors />
        </TooltipProvider>
      </QueryClientProvider>
    </AuthProvider>
  </StrictMode>,
)
