import type { TuiScreenContext } from './types';
import React, { type ReactNode, createContext, useContext } from 'react';

const TuiScreenContextStore = createContext<TuiScreenContext | null>(null);

export const useTuiScreenContext = (): TuiScreenContext => {
  const context = useContext(TuiScreenContextStore);
  if (!context) {
    throw new Error('useScreenContext must be used within a context provider');
  }
  return context;
};

interface ProviderProps {
  context: TuiScreenContext;
  children: ReactNode;
}

export const TuiScreenContextProvider: React.FC<ProviderProps> = ({ context, children }) => {
  return (
    <TuiScreenContextStore.Provider
      value={{
        ...context,
        logger: context.logger.child('tui'),
        telemetryClient: context.telemetryClient.child('mode', 'tui'),
      }}
    >
      {children}
    </TuiScreenContextStore.Provider>
  );
};
