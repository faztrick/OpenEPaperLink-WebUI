import { createContext, ReactNode, useCallback, useContext, useState } from 'react';

interface UIState {
  showProgress:boolean; showAIChat:boolean; showAIConfig:boolean;
  openProgress:()=>void; closeProgress:()=>void;
  openAIChat:()=>void; closeAIChat:()=>void;
  openAIConfig:()=>void; closeAIConfig:()=>void;
}

const UIContext = createContext<UIState|undefined>(undefined);

export function UIProvider({children}:{children:ReactNode}){
  const [showProgress, setShowProgress] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const [showAIConfig, setShowAIConfig] = useState(false);

  const openProgress = useCallback(()=> setShowProgress(true), []);
  const closeProgress = useCallback(()=> setShowProgress(false), []);
  const openAIChat = useCallback(()=> setShowAIChat(true), []);
  const closeAIChat = useCallback(()=> setShowAIChat(false), []);
  const openAIConfig = useCallback(()=> setShowAIConfig(true), []);
  const closeAIConfig = useCallback(()=> setShowAIConfig(false), []);

  return (
    <UIContext.Provider value={{showProgress, showAIChat, showAIConfig, openProgress, closeProgress, openAIChat, closeAIChat, openAIConfig, closeAIConfig}}>
      {children}
    </UIContext.Provider>
  );
}

export function useUI(){
  const ctx = useContext(UIContext);
  if(!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}
