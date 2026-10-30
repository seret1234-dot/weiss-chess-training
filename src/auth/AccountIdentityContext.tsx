import { createContext, useContext } from 'react'
import { accountStorageKey } from './accountBrowserStorage'

// Captured by each mounted account tree, not a mutable global "current user".
// Late callbacks retain their original owner's storage namespace.
export const AccountIdentityContext = createContext<string | null>(null)
export const useAccountIdentity = () => useContext(AccountIdentityContext)
export const useAccountStorageKey = (key: string) => accountStorageKey(key, useAccountIdentity())
