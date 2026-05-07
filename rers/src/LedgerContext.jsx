import { createContext, useContext, useState, useEffect } from 'react';
import { LedgerClient } from './api/ledger.js';

const LEDGER_URL = '/canton-api';

const LedgerContext = createContext(null);
const PartyContext  = createContext({ parties: [], activeParty: null, setActiveParty: () => {} });

export function useLedger()    { return useContext(LedgerContext); }
export function usePartyCtx()  { return useContext(PartyContext); }

export function LedgerProvider({ children }) {
  const [ledger,      setLedger]      = useState(null);
  const [parties,     setParties]     = useState([]);
  const [activeParty, setActiveParty] = useState(null);
  const [error,       setError]       = useState(null);

  useEffect(() => {
    LedgerClient.getOperatorPartyId(LEDGER_URL)
      .then(async (party) => {
        const client = new LedgerClient({ baseUrl: LEDGER_URL, party, userId: 'operator-user' });
        setLedger(client);
        const { parties: pts } = await client.listAllParties();
        // Exclude the operator party from the login list
        setParties(pts.filter(p => !p.party.startsWith('Operator')));
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error)   return <div className="init-error">Ledger connection failed: {error}</div>;
  if (!ledger) return <div className="init-loading">Connecting to ledger...</div>;

  return (
    <LedgerContext.Provider value={ledger}>
      <PartyContext.Provider value={{ parties, activeParty, setActiveParty }}>
        {children}
      </PartyContext.Provider>
    </LedgerContext.Provider>
  );
}
