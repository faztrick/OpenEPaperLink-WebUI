import dynamic from 'next/dynamic';
import { useUI } from '../context/UIContext';

const AIChatBody = dynamic(() => import('../features/ai/AIChat').then(m => m.AIChat), { ssr: false, loading: () => <div style={{ padding: 8 }}>Loading AI assistant…</div> });

export function Modals() {
  const { showProgress, showAIChat, showAIConfig, closeAIChat, closeAIConfig, closeProgress } = useUI();
  return (
    <div data-component-root="modals">
      {showProgress && <ProgressModal onClose={closeProgress} />}
      {showAIChat && <AIChatModal onClose={closeAIChat}><AIChatBody /></AIChatModal>}
      {showAIConfig && <AIConfigModal onClose={closeAIConfig} />}
    </div>
  );
}

function BaseModal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div className="modal-content" style={{ background: '#161b22', padding: '1rem', width: 'min(700px,95%)', border: '1px solid #30363d', borderRadius: 8, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function ProgressModal({ onClose }: { onClose: () => void }) {
  return (
    <BaseModal onClose={onClose}>
      <h3 style={{ marginTop: 0 }}>Processing...</h3>
      <div style={{ height: 8, background: '#30363d', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ width: '30%', height: '100%', background: 'var(--accent)', transition: 'width .3s' }} />
      </div>
      <div style={{ fontSize: '.85rem', opacity: .8 }}>Starting...</div>
    </BaseModal>
  );
}

function AIChatModal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <BaseModal onClose={onClose}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}><i className="fas fa-robot" /> AI Assistant</h3>
        <button onClick={onClose}>&times;</button>
      </div>
      <div style={{ margin: '1rem 0' }}>{children}</div>
    </BaseModal>
  );
}

function AIConfigModal({ onClose }: { onClose: () => void }) {
  return (
    <BaseModal onClose={onClose}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}><i className="fas fa-robot" /> AI Configuration</h3>
        <button onClick={onClose}>&times;</button>
      </div>
      <div style={{ marginTop: '1rem' }}>Configuration form pending...</div>
    </BaseModal>
  );
}
