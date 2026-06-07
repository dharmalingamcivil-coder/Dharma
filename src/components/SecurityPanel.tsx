import React, { useState } from 'react';
import { 
  Shield, 
  Key, 
  FileLock, 
  Download, 
  Eye, 
  EyeOff, 
  Check, 
  Cpu 
} from 'lucide-react';
import { SecurityBackup } from '../types.js';

interface SecurityPanelProps {
  currentUser: { id: string; name: string; email: string };
  publicKeyJwk: string;
  privateKeyJwk: string;
  activeRoomAesKeyBase64: string | null;
  activeRoomId: string | null;
  activeRoomName: string;
  onImportPrivateKeys: (privateJwk: string, publicJwk: string) => void;
}

export default function SecurityPanel({
  currentUser,
  publicKeyJwk,
  privateKeyJwk,
  activeRoomAesKeyBase64,
  activeRoomId,
  activeRoomName,
  onImportPrivateKeys
}: SecurityPanelProps) {
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [showAesKey, setShowAesKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState<'public' | 'private' | 'aes' | null>(null);
  const [importPubText, setImportPubText] = useState('');
  const [importPrivText, setImportPrivText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  const handleCopy = (text: string, type: 'public' | 'private' | 'aes') => {
    navigator.clipboard.writeText(text);
    setCopiedKey(type);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleBackupExport = () => {
    const backup: SecurityBackup = {
      userId: currentUser.id,
      username: currentUser.name,
      publicKeyJwk: publicKeyJwk,
      privateKeyJwk: privateKeyJwk,
      exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `e2ee_backup_${currentUser.email.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.FormEvent) => {
    e.preventDefault();
    setImportError(null);
    setImportSuccess(false);

    try {
      // Validate JSON shapes
      const testPub = JSON.parse(importPubText);
      const testPriv = JSON.parse(importPrivText);

      if (testPub.kty !== 'RSA' || testPriv.kty !== 'RSA') {
        throw new Error("Invalid RSA Key specification (kty must be 'RSA').");
      }

      onImportPrivateKeys(importPrivText, importPubText);
      setImportSuccess(true);
      setImportPubText('');
      setImportPrivText('');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Invalid JSON JWK schemas.");
    }
  };

  // Helper to slice key for visual cleanliness
  const formatKeyPreview = (keyStr: string) => {
    if (!keyStr) return 'Not available';
    try {
      const obj = JSON.parse(keyStr);
      return JSON.stringify(obj, null, 2);
    } catch {
      return keyStr.slice(0, 40) + '...';
    }
  };

  return (
    <div className="bg-white border-l border-[#e5e7eb] w-full lg:w-96 p-6 flex flex-col gap-6 overflow-y-auto shrink-0 select-none shadow-xs" id="crypto-panel">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
        <Shield className="w-5 h-5 text-emerald-600 animate-pulse" />
        <h2 className="text-[15px] font-bold tracking-tight text-slate-800">Security & Keys Console</h2>
      </div>

      {/* User Asymmetric RSA Certificate */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-550 font-bold tracking-wider uppercase">
            <Key className="w-3.5 h-3.5 text-[#6264A7]" />
            <span>RSA-OAEP 2048 Identity Keys</span>
          </div>
          <button 
            type="button"
            onClick={handleBackupExport}
            className="text-xs text-emerald-700 hover:text-emerald-800 flex items-center gap-1 bg-[#ecfdf5] px-2 py-1 rounded border border-[#a7f3d0] transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-3 h-3" />
            <span className="font-bold">Backup</span>
          </button>
        </div>

        {/* Public Key */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 font-bold">Public Key (Shared with team)</span>
            <button
              type="button"
              onClick={() => handleCopy(publicKeyJwk, 'public')}
              className="text-[#6264A7] hover:underline flex items-center gap-1 font-bold text-[11px]"
            >
              {copiedKey === 'public' ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : null}
              <span>{copiedKey === 'public' ? 'Copied' : 'Copy JWK'}</span>
            </button>
          </div>
          <div className="bg-[#f9fafb] rounded p-2.5 text-[10px] font-mono text-slate-700 max-h-24 overflow-y-auto border border-[#d1d5db] leading-relaxed whitespace-pre select-all shadow-xs">
            {formatKeyPreview(publicKeyJwk)}
          </div>
        </div>

        {/* Private Key */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-amber-700 font-bold">Private Key (Never uploads!)</span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowPrivateKey(!showPrivateKey)}
                className="text-slate-500 hover:text-[#6264A7] flex items-center gap-1 text-[11px] font-bold"
              >
                {showPrivateKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showPrivateKey ? 'Hide' : 'Reveal'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleCopy(privateKeyJwk, 'private')}
                className="text-amber-700 hover:underline flex items-center gap-1 text-[11px] font-bold"
              >
                {copiedKey === 'private' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : null}
                <span>{copiedKey === 'private' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
          <div className="bg-[#f9fafb] rounded p-2.5 text-[10px] font-mono text-slate-755 max-h-24 overflow-y-auto border border-[#d1d5db] leading-relaxed whitespace-pre select-all shadow-xs">
            {showPrivateKey ? formatKeyPreview(privateKeyJwk) : "•••••\n(Kept safe inside local storage)"}
          </div>
        </div>
      </div>

      {/* Active Symmetric Key Details */}
      <div className="flex flex-col gap-3.5 p-4 bg-slate-50 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold tracking-wider uppercase">
          <Cpu className="w-3.5 h-3.5 text-[#6264A7] animate-pulse" />
          <span>Active Session Channel Key</span>
        </div>

        <div className="text-xs text-slate-600 flex flex-col gap-1.5">
          <div className="flex justify-between">
            <span className="text-slate-450">Active Workspace:</span>
            <span className="font-bold text-slate-850">{activeRoomName || 'None selected'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-450">Symmetric Protocol:</span>
            <span className="text-emerald-600 font-bold font-mono">AES-GCM (256-bit)</span>
          </div>
        </div>

        <div className="mt-1 flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 font-bold">Decrypted Session Key</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAesKey(!showAesKey)}
                className="text-slate-500 hover:text-[#6264A7] cursor-pointer"
              >
                {showAesKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              {activeRoomAesKeyBase64 && (
                <button
                  type="button"
                  onClick={() => handleCopy(activeRoomAesKeyBase64, 'aes')}
                  className="text-[#6264A7] hover:underline flex items-center gap-0.5 text-[11px] font-bold cursor-pointer"
                >
                  {copiedKey === 'aes' ? <Check className="w-3 h-3 text-emerald-600" /> : null}
                  <span>Copy</span>
                </button>
              )}
            </div>
          </div>
          <div className="bg-[#edeef7] rounded p-2 text-center text-[11.5px] font-mono text-[#6264A7] border border-[#6264A7]/20 whitespace-pre overflow-x-auto truncate font-semibold">
            {activeRoomAesKeyBase64 
              ? (showAesKey 
                  ? activeRoomAesKeyBase64 
                  : `🔑 ${activeRoomAesKeyBase64.slice(0, 10)}... (E2EE Decrypted)`)
              : '🔴 Key Unavailable (Require RSA Decrypt)'}
          </div>
          <p className="text-[10px] text-slate-450 leading-relaxed md:leading-normal">
            * This key was encrypted on the sender's client with your RSA Public Key, uploaded, and then decrypted locally using your private RSA key in your browser. Live message packets use GCM tags for authentication.
          </p>
        </div>
      </div>

      {/* Manual Key Injection (Developer/Testing tool) */}
      <form onSubmit={handleImport} className="mt-auto flex flex-col gap-3 pt-4 border-t border-slate-100">
        <h3 className="text-[10px] font-bold text-slate-500 flex items-center gap-1 uppercase tracking-wider">
          <FileLock className="w-3.5 h-3.5 text-[#6264A7]" />
          <span>Import Cryptographic Keys</span>
        </h3>
        <p className="text-[10px] text-slate-450 leading-relaxed">
          Simulate a different user by pasting their exported JWK key pair structures here.
        </p>
        <div className="flex flex-col gap-2">
          <textarea
            value={importPubText}
            onChange={(e) => setImportPubText(e.target.value)}
            placeholder="Paste Public JWK Key JSON..."
            rows={2}
            className="w-full bg-[#f9fafb] hover:bg-white text-[10px] font-mono border border-slate-300 rounded p-2 focus:border-[#6264A7] outline-none text-slate-800 resize-none transition-all shadow-xs"
            required
          />
          <textarea
            value={importPrivText}
            onChange={(e) => setImportPrivText(e.target.value)}
            placeholder="Paste Private JWK Key JSON..."
            rows={2}
            className="w-full bg-[#f9fafb] hover:bg-white text-[10px] font-mono border border-slate-300 rounded p-2 focus:border-[#6264A7] outline-none text-slate-800 resize-none transition-all shadow-xs"
            required
          />
        </div>
        
        {importError && (
          <div className="text-[10px] bg-red-50 border border-red-150 text-red-750 font-semibold rounded p-2">
            {importError}
          </div>
        )}

        {importSuccess && (
          <div className="text-[10px] bg-emerald-50 border border-emerald-150 text-emerald-800 font-semibold rounded p-2">
            Keys imported & binded successfully!
          </div>
        )}

        <button
          type="submit"
          className="w-full bg-[#6264A7] hover:bg-[#525493] text-white py-1.5 rounded text-xs font-bold tracking-wider uppercase border border-transparent shadow-xs transition-colors cursor-pointer"
        >
          Import Handshake Pair
        </button>
      </form>
    </div>
  );
}
