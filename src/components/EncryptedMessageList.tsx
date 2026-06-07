import React, { useEffect, useRef, useState } from 'react';
import { 
  ShieldCheck, 
  Terminal, 
  User, 
  HelpCircle, 
  Cpu, 
  Lock, 
  Search, 
  Eye, 
  EyeOff,
  Image,
  Video,
  FileText,
  File,
  Download
} from 'lucide-react';
import { Message, User as UserType } from '../types.js';

interface EncryptedMessageListProps {
  messages: Message[];
  decryptedMessageMap: Record<string, string>; // messageId -> decrypted text
  currentUser: UserType | null;
  typingUsers: { id: string; name: string }[];
  allUsers: UserType[];
  isSecurityConsoleOpen: boolean;
}

export default function EncryptedMessageList({
  messages,
  decryptedMessageMap,
  currentUser,
  typingUsers,
  allUsers,
  isSecurityConsoleOpen
}: EncryptedMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showRawPayloads, setShowRawPayloads] = useState(false);

  // Auto-scroll on new messages
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, typingUsers]);

  const formatTimestamp = (isoStr: string) => {
    try {
      const time = new Date(isoStr);
      return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const getReadReceiptsInfo = (msg: Message) => {
    const otherReaders = (msg.readBy || []).filter(id => id !== msg.senderId);
    const names = otherReaders.map(id => {
      const found = allUsers.find(u => u.id === id);
      return found ? found.name : id;
    });
    return {
      count: otherReaders.length,
      names: names.join(', '),
      allReadBy: (msg.readBy || [])
    };
  };

  const handleDownloadFile = (dataUrl: string, fileName: string) => {
    try {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed to download file:", err);
    }
  };

  const getFileIcon = (fileType: string) => {
    const type = fileType.toLowerCase();
    if (type.startsWith('image/')) {
      return <Image className="w-5 h-5 text-[#6264A7]" />;
    }
    if (type.startsWith('video/')) {
      return <Video className="w-5 h-5 text-[#6264A7]" />;
    }
    if (type.includes('pdf')) {
      return <FileText className="w-5 h-5 text-rose-600" />;
    }
    return <File className="w-5 h-5 text-slate-600" />;
  };

  const getFileTypeLabel = (fileType: string) => {
    if (!fileType) return 'Binary';
    const type = fileType.toLowerCase();
    if (type.includes('pdf')) return 'PDF Document';
    if (type.startsWith('image/')) return 'Image';
    if (type.startsWith('video/')) return 'Video';
    if (type.includes('zip') || type.includes('tar') || type.includes('rar')) return 'Archive';
    const parts = fileType.split('/');
    return parts[parts.length - 1].toUpperCase();
  };

  return (
    <div className="flex-1 flex flex-col bg-[#f9fafb] overflow-hidden" id="messaging-history">
      {/* Encryption Toggle Bar */}
      <div className="bg-[#f3f4f6] border-b border-[#e5e7eb] px-6 py-3 flex items-center justify-between select-none">
        <span className="text-[11px] text-slate-500 font-bold tracking-wider flex items-center gap-1.5 uppercase">
          <Terminal className="w-3.5 h-3.5 text-[#6264A7] animate-pulse" />
          <span>Interactive Protocol Inspector</span>
        </span>

        <button
          type="button"
          onClick={() => setShowRawPayloads(!showRawPayloads)}
          className={`text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded transition-all flex items-center gap-1.5 shadow-xs cursor-pointer border ${
            showRawPayloads 
              ? 'bg-[#edeef7] text-[#6264A7] border-[#6264A7]/30 font-semibold' 
              : 'bg-white text-slate-600 border-[#d1d5db] hover:bg-slate-50'
          }`}
          title="Toggle view between raw decrypted human-readable texts and standard base64 database cipher text blocks."
        >
          {showRawPayloads ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          <span>{showRawPayloads ? "View Human Decrypted" : "Inspect Raw Ciphertexts"}</span>
        </button>
      </div>

      {/* Main Messages Stream */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-5 bg-[#f9fafb]"
      >
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-10 max-w-sm mx-auto my-auto gap-4 select-none">
            <div className="w-14 h-14 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-450 shadow-sm">
              <Lock className="w-6 h-6 text-[#6264A7] animate-pulse" />
            </div>
            <div className="flex flex-col gap-1.5">
              <h3 className="font-bold text-slate-800 text-sm tracking-tight">Zero-Knowledge Chamber</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                There are no prior decrypted packets logged inside this space segment yet. Introduce a safe handshake and begin chat!
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isSelf = msg.senderId === currentUser?.id;
            const decryptedVal = decryptedMessageMap[msg.id];
            const isBot = msg.senderId.endsWith('.ai') || msg.senderId === '+18005550199';

            let parsedAttachment: {
              type: 'attachment';
              fileName: string;
              fileType: string;
              fileSize: number;
              fileData: string;
              text?: string;
            } | null = null;

            if (decryptedVal) {
              try {
                const trimmed = decryptedVal.trim();
                if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                  const parsed = JSON.parse(trimmed);
                  if (parsed && parsed.type === 'attachment' && parsed.fileData) {
                    parsedAttachment = parsed;
                  }
                }
              } catch (err) {
                // Ignore, keep plaintext
              }
            }

            const receiptInfo = getReadReceiptsInfo(msg);

            return (
              <div 
                key={msg.id}
                className={`flex gap-3.5 max-w-full md:max-w-xlg leading-relaxed ${
                  isSelf ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                {/* Profile Circle Avatar */}
                <div className="shrink-0 select-none">
                  <div className={`w-8.5 h-8.5 rounded-full font-bold text-xs flex items-center justify-center cursor-help border shadow-xs ${
                    isSelf 
                      ? 'bg-[#6264A7] text-white border-transparent shadow' 
                      : isBot 
                        ? 'bg-emerald-650 text-white border-transparent'
                        : 'bg-white text-[#6264A7] border-slate-200 font-semibold shadow-xs'
                  }`}
                  title={`${msg.senderName} (${msg.senderId})`}
                  >
                    {isBot ? "AI" : msg.senderName.slice(0, 2).toUpperCase()}
                  </div>
                </div>

                {/* Message Bubble Column */}
                <div className={`flex flex-col gap-1 ${isSelf ? 'items-end' : 'items-start'} max-w-lg md:max-w-2xl`}>
                  {/* Name and Time Header */}
                  <div className="flex items-center gap-2 text-[10px] select-none">
                    <span className="font-bold text-slate-705">{msg.senderName}</span>
                    <span className="text-slate-400">{formatTimestamp(msg.createdAt)}</span>
                  </div>

                  {/* Message body container */}
                  {showRawPayloads ? (
                    /* Inspecting Cypher Payload */
                    <div className="bg-slate-900 border border-slate-850 rounded-lg p-3.5 text-[10.5px] font-mono leading-relaxed text-[#38bdf8] flex flex-col gap-1.5 shadow-md">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 uppercase text-[9px] font-semibold text-slate-400">
                        <span>Database CIPHER Packet</span>
                        <span className="text-emerald-400 font-sans font-bold">E2EE Verified</span>
                      </div>
                      <div className="flex flex-col font-mono mt-1">
                        <span className="text-[#818cf8] font-bold">URI Segment:</span>
                        <span className="text-slate-300 break-all select-all">/{msg.roomId}/packets/{msg.id}</span>
                      </div>
                      <div className="flex flex-col font-mono gap-0.5">
                        <span className="text-[#a78bfa] font-bold">AES-GCM Ciphertext (Base64):</span>
                        <p className="text-slate-300 break-all select-all leading-normal bg-slate-950/80 p-2 rounded">{msg.encryptedPayload}</p>
                      </div>
                      <div className="flex flex-col font-mono">
                        <span className="text-[#fb923c] font-bold">Initialization Vector IV:</span>
                        <span className="text-slate-300 select-all">{msg.iv}</span>
                      </div>
                      <div className="flex flex-col font-mono">
                        <span className="text-emerald-400 font-bold">Decryption Status:</span>
                        <span className="text-emerald-400 font-sans bg-emerald-500/10 px-2 py-0.5 rounded max-w-max text-[9px] mt-0.5 font-bold">
                          {decryptedVal ? "✓ Decrypted (AES Match)" : "🔐 Locked / Missing Key"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* Clean human Decrypted dialog */
                    <div className={`rounded-xl p-3 text-[13px] shadow-xs selection:bg-slate-200 select-text leading-relaxed border ${
                      isSelf 
                        ? 'bg-[#e2e2f0] text-slate-850 border-transparent font-medium' 
                        : isBot
                          ? 'bg-emerald-50/50 text-slate-850 border-emerald-100 font-medium'
                          : 'bg-white text-slate-800 border-slate-150'
                    }`}>
                      {decryptedVal ? (
                        parsedAttachment ? (
                          <div className="flex flex-col gap-2 min-w-[200px] max-w-full">
                            {/* Attachment info panel */}
                            <div className="flex items-center gap-3 p-2 rounded-lg border border-slate-200/80 bg-white/65 hover:bg-white/90 transition-all select-none">
                              <div className="p-2 bg-slate-50 border border-slate-200 rounded shrink-0">
                                {getFileIcon(parsedAttachment.fileType)}
                              </div>
                              <div className="flex-1 min-w-0 flex flex-col leading-tight gap-0.5">
                                <span className="text-xs font-bold text-slate-850 truncate" title={parsedAttachment.fileName}>
                                  {parsedAttachment.fileName}
                                </span>
                                <span className="text-[10px] text-slate-455 font-semibold uppercase">
                                  {getFileTypeLabel(parsedAttachment.fileType)} · {(parsedAttachment.fileSize / 1024).toFixed(1)} KB
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDownloadFile(parsedAttachment!.fileData, parsedAttachment!.fileName)}
                                className="p-1.5 rounded hover:bg-slate-100 text-[#6264A7] hover:text-[#525493] transition-all cursor-pointer shrink-0"
                                title="Download Secure Attachment"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Inline rendering for image file types */}
                            {parsedAttachment.fileType.toLowerCase().startsWith('image/') && (
                              <div 
                                onClick={() => handleDownloadFile(parsedAttachment!.fileData, parsedAttachment!.fileName)}
                                className="mt-1 max-w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50 flex justify-center cursor-zoom-in group relative"
                                title="Click to Download Image"
                              >
                                <img 
                                  src={parsedAttachment.fileData} 
                                  className="max-h-56 max-w-full object-contain rounded-md hover:opacity-95 transition-opacity" 
                                  alt={parsedAttachment.fileName}
                                />
                              </div>
                            )}

                            {/* Accompanying post message/comment */}
                            {parsedAttachment.text ? (
                              <p className="whitespace-pre-wrap select-text text-slate-800 text-xs mt-1 leading-normal">{parsedAttachment.text}</p>
                            ) : null}
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap select-text">{decryptedVal}</p>
                        )
                      ) : (
                        <div className="flex flex-col gap-1 text-slate-555 italic">
                          <p className="font-semibold text-slate-700">🔒 End-to-End Encrypted Payload Received</p>
                          <p className="text-[10px] text-red-650 font-sans font-bold hover:underline cursor-help" title="To decrypt this, fetch or exchange your team keys in the chat header or re-request invites.">
                            * Handshake signature key unavailable. Click Terminal to inspect.
                          </p>
                        </div>
                      )}

                      {decryptedVal && (
                        <div className={`mt-2 flex items-center gap-1.5 text-[9px] border-t select-none ${
                          isSelf ? 'border-slate-300/40 text-[#6264A7]' : 'border-slate-100 text-slate-450'
                        } pt-1.5`}>
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="font-bold uppercase tracking-wider">E2EE Cryptosecure verified</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Read status checkmarks rendering */}
                  {receiptInfo.count > 0 ? (
                    <div className="flex items-center gap-1 text-[9.5px] font-semibold text-slate-500 mt-1 select-none transition-colors hover:text-[#6264A7]" title={`Seen by: ${receiptInfo.names}`}>
                      <span className="text-[#6264A7] text-[11px] font-bold font-sans tracking-tighter" style={{ letterSpacing: "-0.09em" }}>✓✓</span>
                      <span>Seen by {receiptInfo.count === 1 ? receiptInfo.names : `${receiptInfo.count} members`}</span>
                    </div>
                  ) : (
                    isSelf && (
                      <div className="flex items-center gap-1 text-[9.5px] font-semibold text-slate-400 mt-1 select-none" title="Delivered successfully to secure cluster storage">
                        <span className="font-sans text-[10.5px]">✓</span>
                        <span>Sent</span>
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Typing Indicators */}
        {typingUsers.map(user => (
          <div key={user.id} className="flex gap-2 items-center text-slate-555 text-xs pl-3">
            <div className="flex gap-2 items-center bg-slate-100 border border-slate-200 rounded-full px-3.5 py-1.5 text-[11px] font-bold text-[#6264A7]">
              <span className="bg-[#6bb700] w-1.5 h-1.5 rounded-full animate-ping" />
              <span>{user.name} is drafting...</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
