import { createContext, useContext, useState, useEffect } from 'react';
import { LedgerClient } from './api/ledger.js';

const LEDGER_URL = '/ledger';

export const LedgerContext = createContext(null);

export function useLedger() {
  return useContext(LedgerContext);
}

export function LedgerProvider({ children }) {
  const [ledger, setLedger] = useState(null);
  const [error, setError]   = useState(null);

  useEffect(() => {
    LedgerClient.getOperatorPartyId(LEDGER_URL)
      .then((party) => setLedger(new LedgerClient({ baseUrl: LEDGER_URL, party, userId: 'operator-user' })))
      .catch((e)    => setError(e.message));
  }, []);

  if (error)  return <div className="init-error">Ledger connection failed: {error}</div>;
  if (!ledger) return <div className="init-loading">Connecting to ledger...</div>;

  return <LedgerContext.Provider value={ledger}>{children}</LedgerContext.Provider>;
}
