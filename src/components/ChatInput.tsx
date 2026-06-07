import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Smile, 
  Paperclip, 
  Bold, 
  Italic, 
  Code, 
  Lock,
  X,
  FileCheck,
  AlertTriangle
} from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  onSendTyping: (isTyping: boolean) => void;
  activeRoomId: string | null;
  hasAESKey: boolean;
}

export default function ChatInput({
  onSendMessage,
  onSendTyping,
  activeRoomId,
  hasAESKey
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isTyping, setIsTyping] = useState(false);

  // Reset typing and file state on room/channel boundary shift
  useEffect(() => {
    setText('');
    setSelectedFile(null);
    setFileError(null);
    setIsTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  }, [activeRoomId]);

  const handleFileSelect = (file: File) => {
    setFileError(null);
    // Limit to 10MB to avoid oversized base64 strings crashing the browser WebSocket stream
    const maxSize = 10 * 1024 * 1024; 
    if (file.size > maxSize) {
      setFileError("Payload exceeds secure limit. Maximum size allowed is 10 MB.");
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!text.trim() && !selectedFile) || !activeRoomId || !hasAESKey) return;

    if (selectedFile) {
      try {
        // Implement local file-to-blob transformation (a File is already a Blob, but standard casting)
        const fileBlob = new Blob([selectedFile], { type: selectedFile.type });
        
        // Convert Blob to Base64 data URL
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (typeof reader.result === 'string') {
              resolve(reader.result);
            } else {
              reject(new Error("Failed to read file as data URL"));
            }
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(fileBlob);
        });

        const attachmentPayload = {
          type: "attachment",
          fileName: selectedFile.name,
          fileType: selectedFile.type || "application/octet-stream",
          fileSize: selectedFile.size,
          fileData: base64Data,
          text: text.trim() || undefined
        };

        // Send JSON-serialized attachment info as plainText, which gets AES-GCM encrypted immediately
        onSendMessage(JSON.stringify(attachmentPayload));
      } catch (err) {
        console.error("Local E2EE file pre-conversion pipeline failed:", err);
        setFileError("Failed to decrypt-prepare this payload. Try another file.");
        return;
      }
    } else {
      // Send regular plain text
      onSendMessage(text.trim());
    }
    
    setText('');
    handleClearFile();

    // Clear typing status immediately
    if (isTyping) {
      setIsTyping(false);
      onSendTyping(false);
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  };

  const handleKeyDown = () => {
    if (!text.trim() || !hasAESKey) return;

    if (!isTyping) {
      setIsTyping(true);
      onSendTyping(true);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      onSendTyping(false);
    }, 2000);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (hasAESKey) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!hasAESKey) return;
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  return (
    <div 
      className={`p-5 border-t border-[#e5e7eb] bg-white transition-colors duration-200 select-none ${
        isDragging ? 'bg-[#edeef7]' : ''
      }`} 
      id="chat-input-area"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-0 max-w-5xl mx-auto">
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          className="hidden" 
          disabled={!hasAESKey}
        />
        
        {/* Drag and Drop Overlap Visual Guard */}
        {isDragging && (
          <div className="flex items-center justify-center py-2 px-4 border border-dashed border-[#6264A7] bg-[#edeef7] text-[#6264A7] text-xs font-bold rounded-t-lg gap-2 animate-pulse">
            <Paperclip className="w-4 h-4" />
            <span>Drop file here to stage for End-to-End Encryption... (Max 10MB)</span>
          </div>
        )}

        {/* Size Warning / Error Alert banner */}
        {fileError && (
          <div className="flex items-center justify-between px-4 py-2 bg-rose-50 border-t border-x border-rose-200 text-rose-700 text-xs rounded-t-lg">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span>{fileError}</span>
            </div>
            <button type="button" onClick={() => setFileError(null)} className="text-rose-500 hover:text-rose-850 p-1 rounded hover:bg-rose-100 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Selected File Stage banner */}
        {selectedFile && !fileError && (
          <div className="flex items-center justify-between px-4 py-2 bg-emerald-50 border-t border-x border-emerald-200 text-emerald-800 text-xs rounded-t-lg">
            <div className="flex items-center gap-2 font-bold min-w-0">
              <FileCheck className="w-4 h-4 text-emerald-600 shrink-0 animate-bounce" />
              <span className="truncate">{selectedFile.name}</span>
              <span className="text-[10px] text-emerald-500 shrink-0 font-semibold uppercase">
                ({(selectedFile.size / 1024).toFixed(1)} KB staged)
              </span>
            </div>
            <button
              type="button"
              onClick={handleClearFile}
              className="text-slate-450 hover:text-red-500 font-bold p-1 rounded hover:bg-emerald-100/60 transition-colors text-[10.5px]"
              title="Cancel file upload"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Teams Editor formatting shortcuts */}
        <div className={`flex items-center gap-1.5 px-4 py-2 bg-[#f9fafb] border-t border-x border-[#e5e7eb] select-none ${
          (selectedFile || fileError || isDragging) ? '' : 'rounded-t-lg'
        }`}>
          <button type="button" className="text-slate-500 hover:text-[#6264A7] p-1 rounded hover:bg-slate-100 transition-colors" title="Format Bold">
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button type="button" className="text-slate-500 hover:text-[#6264A7] p-1 rounded hover:bg-slate-100 transition-colors" title="Format Italic">
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button type="button" className="text-slate-500 hover:text-[#6264A7] p-1 rounded hover:bg-slate-100 transition-colors" title="Source Code block">
            <Code className="w-3.5 h-3.5" />
          </button>
          <div className="h-4 w-px bg-slate-205 mx-1" />
          <button 
            type="button" 
            onClick={() => fileInputRef.current?.click()}
            disabled={!hasAESKey}
            className={`p-1 rounded transition-colors ${
              selectedFile 
                ? 'text-emerald-650 bg-emerald-50 hover:bg-emerald-100' 
                : 'text-slate-500 hover:text-[#6264A7] hover:bg-slate-100'
            }`} 
            title="Insert Encrypted File Attachment (Manual select or Drag & Drop)"
          >
            <Paperclip className="w-3.5 h-3.5" />
          </button>
          <button type="button" className="text-slate-500 hover:text-[#6264A7] p-1 rounded hover:bg-slate-100 transition-colors" title="Emojis">
            <Smile className="w-3.5 h-3.5" />
          </button>

          {/* Crypto lock info indicator in panel bar */}
          <div className="ml-auto flex items-center gap-1.5 text-[10px] text-[#065f46] bg-[#ecfdf5] px-2 py-0.5 rounded border border-[#a7f3d0] font-bold">
            <Lock className="w-3 h-3" />
            <span className="uppercase tracking-wider">AES-GCM ACTIVE</span>
          </div>
        </div>

        {/* Real Dynamic Message inputs */}
        <div className="flex bg-white border-b border-x border-[#e5e7eb] rounded-b-lg items-center shadow-xs focus-within:border-[#6264A7]/60 focus-within:shadow-sm transition-all">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              !hasAESKey 
                ? "🔴 Handshake key missing. Establish encrypted channel keys first..."
                : selectedFile
                  ? `Write an optional caption for ${selectedFile.name}... @Gemini to ask security AI assistant`
                  : "Type message... @Gemini to ask security AI assistant"
            }
            disabled={!hasAESKey}
            className="flex-1 bg-transparent px-4 py-4 text-xs outline-none focus:ring-0 text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed leading-relaxed placeholder-slate-400"
          />
          
          <button
            type="submit"
            disabled={(!text.trim() && !selectedFile) || !hasAESKey}
            className="mr-2.5 p-2 rounded-full bg-[#6264A7] hover:bg-[#525493] text-white disabled:opacity-35 disabled:hover:bg-[#6264A7] transition-all shrink-0 cursor-pointer shadow-xs shadow-[#6264A7]/10"
            title="Encrypt & Send Packet"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
