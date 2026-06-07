import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Key, 
  UserPlus, 
  ChevronRight, 
  AlertTriangle, 
  Send, 
  RefreshCw, 
  HeartHandshake 
} from 'lucide-react';

import { 
  User, 
  Team, 
  Channel, 
  ChatRoom, 
  Message, 
  EncryptedKeyStore 
} from './types.js';

import {
  generateRsaKeyPair,
  generateAesKey,
  exportAesKeyToBase64,
  importAesKeyFromBase64,
  encryptAesKeyWithRsa,
  decryptAesKeyWithRsa,
  encryptMessage,
  decryptMessage
} from './utils/crypto.js';

// Subcomponents
import TeamsSidebar from './components/TeamsSidebar.js';
import ChatHeader from './components/ChatHeader.js';
import EncryptedMessageList from './components/EncryptedMessageList.js';
import ChatInput from './components/ChatInput.js';
import SecurityPanel from './components/SecurityPanel.js';
import CallModal from './components/CallModal.js';

export default function App() {
  // Authentication & Local Keys state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [registrationName, setRegistrationName] = useState('');
  const [registrationEmail, setRegistrationEmail] = useState('');
  const [isGeneratingKeys, setIsGeneratingKeys] = useState(false);

  // RSA Keys (serialized strings)
  const [publicKeyJwk, setPublicKeyJwk] = useState('');
  const [privateKeyJwk, setPrivateKeyJwk] = useState('');

  // Global Sync collections
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeRoomType, setActiveRoomType] = useState<'channel' | 'direct' | 'group' | null>(null);

  // Active room messages & Decryption cache
  const [messages, setMessages] = useState<Message[]>([]);
  const [decryptedMessageMap, setDecryptedMessageMap] = useState<Record<string, string>>({});
  const [activeRoomAesKey, setActiveRoomAesKey] = useState<CryptoKey | null>(null);
  const [activeRoomAesKeyBase64, setActiveRoomAesKeyBase64] = useState<string | null>(null);
  const [activeRoomKeysStore, setActiveRoomKeysStore] = useState<EncryptedKeyStore>({});

  // Presence and typing feedback
  const [typingUsers, setTypingUsers] = useState<{ id: string; name: string }[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [isSecurityPanelOpen, setIsSecurityPanelOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Calling visual overlay states
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [isCallVideo, setIsCallVideo] = useState(false);

  // Responsive mobile active view: 'sidebar' or 'chat'
  const [activeMobileView, setActiveMobileView] = useState<'sidebar' | 'chat'>('sidebar');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Load active identity from LocalStorage on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem('e2ee_email');
    if (savedEmail) {
      const savedName = localStorage.getItem('e2ee_name') || '';
      const savedPub = localStorage.getItem(`e2ee_pub_key_${savedEmail}`) || '';
      const savedPriv = localStorage.getItem(`e2ee_priv_key_${savedEmail}`) || '';

      if (savedPub && savedPriv) {
        setPublicKeyJwk(savedPub);
        setPrivateKeyJwk(savedPriv);
        const uObj: User = {
          id: savedEmail,
          email: savedEmail,
          name: savedName,
          publicKey: savedPub,
          status: 'online'
        };
        setCurrentUser(uObj);
        registerAndBoot(uObj);
      }
    } else {
      // Auto-set pre-loaded templates for ease of first testing
      setRegistrationName('Operator ' + Math.floor(Math.random() * 1000));
      setRegistrationEmail(`+1 (555) 01` + Math.floor(10 + Math.random() * 90) + '-' + Math.floor(1000 + Math.random() * 9000));
    }

    return () => {
      closeWebSocket();
    };
  }, []);

  // 2. Register Active User, sync, and open WebSocket
  const registerAndBoot = async (userObj: User) => {
    try {
      setServerError(null);
      // Register with Express Server
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userObj)
      });
      if (!res.ok) throw new Error("Backend handshake registration failure.");

      const data = await res.json();
      setCurrentUser(data.user);

      // Core synchronization lists
      await syncDataLists();

      // Initiate bi-directional WebSockets connection
      connectWebSocket(userObj.id);

    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Handshake failure.");
    }
  };

  const syncDataLists = async () => {
    try {
      const [uRes, tRes, cRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/teams'),
        fetch('/api/chats')
      ]);

      if (uRes.ok && tRes.ok && cRes.ok) {
        const uList = await uRes.json();
        const tList = await tRes.json();
        const cList = await cRes.json();

        setAllUsers(uList);
        setTeams(tList);
        setChatRooms(cList);

        // Pre-activate general channel of HQ team if nothing active
        if (!activeRoomId && tList.length > 0 && tList[0].channels.length > 0) {
          const generalChan = tList[0].channels[0];
          setActiveRoomId(generalChan.id);
          setActiveRoomType('channel');
        }
      }
    } catch (err) {
      console.error("Failed executing sync queries:", err);
    }
  };

  // Helper to mark active room as read and broadcast to the team
  const markActiveRoomAsRead = (roomIdToMark: string) => {
    if (!roomIdToMark || !currentUser || !wsRef.current) return;
    if (wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "mark-all-read",
        roomId: roomIdToMark,
        userId: currentUser.id
      }));
    }
  };

  // Trigger marking active room as read on successful connection/switch
  useEffect(() => {
    if (wsConnected && activeRoomId) {
      markActiveRoomAsRead(activeRoomId);
    }
  }, [wsConnected, activeRoomId]);

  // 3. Connect to server WebSocket
  const connectWebSocket = (userId: string) => {
    closeWebSocket();

    // Derive proper ws protocol from http
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws?userId=${encodeURIComponent(userId)}`;

    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      console.log("WebSocket stream opened.");
      setWsConnected(true);
      if (reconnectIntervalRef.current) {
        clearInterval(reconnectIntervalRef.current);
        reconnectIntervalRef.current = null;
      }
    };

    socket.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);
        
        switch (payload.type) {
          case 'message': {
            const incomingMsg: Message = payload.message;
            
            // Check if matches active select room
            if (incomingMsg.roomId === activeRoomId) {
              setMessages(prev => {
                // Prevent duplicate inserts
                if (prev.some(m => m.id === incomingMsg.id)) return prev;
                return [...prev, incomingMsg];
              });

              // Decrypt the message on-the-fly if AES key is loaded
              if (activeRoomAesKey) {
                try {
                  const plain = await decryptMessage(incomingMsg.encryptedPayload, incomingMsg.iv, activeRoomAesKey);
                  setDecryptedMessageMap(prev => ({ ...prev, [incomingMsg.id]: plain }));
                } catch {
                  // Failed decrypt (key changed or mismatch)
                }
              }

              // Notify server router that active room client read this message
              markActiveRoomAsRead(incomingMsg.roomId);
            }
            break;
          }

          case 'messages-read': {
            const { roomId, userId, messageIds } = payload;
            if (roomId === activeRoomId) {
              setMessages(prev => prev.map(m => {
                if (messageIds.includes(m.id)) {
                  const currentReadBy = m.readBy || [m.senderId];
                  const readSet = new Set([...currentReadBy, userId]);
                  return { ...m, readBy: Array.from(readSet) };
                }
                return m;
              }));
            }
            break;
          }

          case 'typing': {
            const { roomId, userId, name, isTyping } = payload;
            if (roomId === activeRoomId) {
              setTypingUsers(prev => {
                if (isTyping) {
                  if (prev.some(u => u.id === userId)) return prev;
                  return [...prev, { id: userId, name }];
                } else {
                  return prev.filter(u => u.id !== userId);
                }
              });
            }
            break;
          }

          case 'presence-update': {
            const presences = payload.presence;
            setAllUsers(prev => prev.map(u => {
              const matched = presences.find((p: any) => p.userId === u.id);
              return matched ? { ...u, status: matched.status } : u;
            }));
            break;
          }

          case 'team-created':
          case 'channel-created':
          case 'chat-room-created':
          case 'chat-room-updated':
          case 'team-keys-updated': {
            // Trigger quick UI sync fetch to update channel state
            await syncDataLists();
            
            // If active room keys updated, reload key triggers
            if (activeRoomId) {
              loadRoomSymmetricKey(activeRoomId, activeRoomType);
            }
            break;
          }
        }
      } catch (err) {
        console.error("Message process error:", err);
      }
    };

    socket.onclose = () => {
      console.log("WebSocket stream closed. Retrying...");
      setWsConnected(false);
      triggerWebSocketReconnect(userId);
    };

    socket.onerror = () => {
      setWsConnected(false);
    };
  };

  const closeWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const triggerWebSocketReconnect = (userId: string) => {
    if (!reconnectIntervalRef.current) {
      reconnectIntervalRef.current = setInterval(() => {
        console.log("Retrying WebSocket connection...");
        connectWebSocket(userId);
      }, 5000);
    }
  };

  // 4. Generate user RSA Key Pair inside browser
  const handleKeyCreationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registrationName.trim() || !registrationEmail.trim()) return;

    setIsGeneratingKeys(true);
    setServerError(null);

    try {
      // 1. Generate RSA-OAEP 2048 keypair natively
      const { publicKeyJwk: pub, privateKeyJwk: priv } = await generateRsaKeyPair();

      // 2. Persist in client Storage
      localStorage.setItem('e2ee_name', registrationName.trim());
      localStorage.setItem('e2ee_email', registrationEmail.trim());
      localStorage.setItem(`e2ee_pub_key_${registrationEmail.trim()}`, pub);
      localStorage.setItem(`e2ee_priv_key_${registrationEmail.trim()}`, priv);

      setPublicKeyJwk(pub);
      setPrivateKeyJwk(priv);

      const uObj: User = {
        id: registrationEmail.trim(),
        email: registrationEmail.trim(),
        name: registrationName.trim(),
        publicKey: pub,
        status: 'online'
      };

      await registerAndBoot(uObj);

    } catch (err) {
      setServerError("Cryptographic engine failed to generate key pair. Check subtle crypto support.");
    } finally {
      setIsGeneratingKeys(false);
    }
  };

  // 5. Symmetric Room Keys loading and Local Decryption routine
  const loadRoomSymmetricKey = async (roomId: string, type: 'channel' | 'direct' | 'group' | null) => {
    if (!currentUser) return;
    
    setActiveRoomAesKey(null);
    setActiveRoomAesKeyBase64(null);
    setDecryptedMessageMap({});

    try {
      // Fetch dynamic key-exchange mapping for this room
      const res = await fetch(`/api/keys/${roomId}`);
      if (!res.ok) throw new Error("Failed fetching room key ring.");
      const keysRing: EncryptedKeyStore = await res.json();
      setActiveRoomKeysStore(keysRing);

      // Check if my active profile holds a key in this ring
      const encryptedAesKeyB64 = keysRing[currentUser.id];

      if (encryptedAesKeyB64) {
        // We have E2EE key! Decrypt it locally using our RSA private key
        const rawAesBase64 = await decryptAesKeyWithRsa(encryptedAesKeyB64, privateKeyJwk);
        
        // Import raw key into SubtleCrypto AES key object
        const aesKey = await importAesKeyFromBase64(rawAesBase64);
        
        setActiveRoomAesKey(aesKey);
        setActiveRoomAesKeyBase64(rawAesBase64);

        // Fetch history and decrypt all messages on-the-fly!
        const histRes = await fetch(`/api/history/${roomId}`);
        const histMsgs: Message[] = await histRes.json();
        setMessages(histMsgs);
        markActiveRoomAsRead(roomId);

        // Perform decryption
        const freshDecMap: Record<string, string> = {};
        for (const msg of histMsgs) {
          try {
            const plain = await decryptMessage(msg.encryptedPayload, msg.iv, aesKey);
            freshDecMap[msg.id] = plain;
          } catch (err) {
            console.error("Failed decryption of message ID: " + msg.id, err);
          }
        }
        setDecryptedMessageMap(freshDecMap);
      } else {
        // E2EE Key is not yet provisioned for me in this room
        setMessages([]);
        const histRes = await fetch(`/api/history/${roomId}`);
        const histMsgs: Message[] = await histRes.json();
        setMessages(histMsgs); // keeps raw list, but will render as locked
        markActiveRoomAsRead(roomId);
      }

    } catch (err) {
      console.error("Room crypto load error:", err);
    }
  };

  // Trigger reloading whenever active chamber shifts or is created
  useEffect(() => {
    if (activeRoomId) {
      setTypingUsers([]);
      loadRoomSymmetricKey(activeRoomId, activeRoomType);
    }
  }, [activeRoomId, activeRoomType]);

  // 6. Handle sending secure end-to-end encrypted messages
  const handleSendMessage = async (plainText: string) => {
    if (!activeRoomId || !activeRoomAesKey || !currentUser) return;

    try {
      // 1. Locally encrypt text using Symmetric AES key
      const { ciphertextBase64, ivBase64 } = await encryptMessage(plainText, activeRoomAesKey);

      const newMsg: Message = {
        id: "msg-" + Date.now().toString(36),
        roomId: activeRoomId,
        senderId: currentUser.id,
        senderName: currentUser.name,
        encryptedPayload: ciphertextBase64,
        iv: ivBase64,
        createdAt: new Date().toISOString(),
        readBy: [currentUser.id]
      };

      // 2. Add locally to messages state (Optimistic update)
      setMessages(prev => [...prev, newMsg]);
      setDecryptedMessageMap(prev => ({ ...prev, [newMsg.id]: plainText }));

      // 3. Emit via socket to server
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "send-message",
          message: newMsg,
          // We pass plain text to server ONLY if it starts with bot triggers or DM bot
          // so the Gemini bot is capable of decrypt-processing-re-encrypt loops!
          plainTextForBot: activeRoomId.startsWith('dm-') || plainText.includes('@Gemini') ? plainText : undefined
        }));
      }

    } catch (err) {
      console.error("Local encryption pipeline failure:", err);
    }
  };

  // Notify backend typing stream
  const handleSendTyping = (isTyping: boolean) => {
    if (!activeRoomId || !currentUser || !wsConnected) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "typing",
        roomId: activeRoomId,
        userId: currentUser.id,
        name: currentUser.name,
        isTyping
      }));
    }
  };

  // 7. Request server-brokered secure key handshake
  const handleRequestSimulatedHandshake = async () => {
    if (!activeRoomId || !currentUser) return;

    try {
      setServerError(null);
      // Trigger API to decrypt key on server from admin's (Sarah) key & encrypt for me
      const res = await fetch(`/api/keys/${activeRoomId}/simulate-grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          userPublicKey: publicKeyJwk
        })
      });

      if (!res.ok) throw new Error("Handshake grant rejected by admin brokerage.");

      // Key updated successfully, reload cryptographic bindings
      await loadRoomSymmetricKey(activeRoomId, activeRoomType);

    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Handshake brokering fail.");
    }
  };

  // 8. Start a Direct DM chat Room & generate E2EE envelope keys
  const handleStartDirectChat = async (targetUser: User) => {
    if (!currentUser) return;

    // Check if direct room already registered
    const sorted = [currentUser.id, targetUser.id].sort();
    const dmId = `dm-${sorted[0]}-${sorted[1]}`;

    const existingRoom = chatRooms.find(r => r.id === dmId);
    if (existingRoom) {
      setActiveRoomId(existingRoom.id);
      setActiveRoomType('direct');
      setActiveMobileView('chat');
      return;
    }

    // Creating NEW Direct Chat: must run browser key exchange
    try {
      // 1. Generate new symmetric AES-GCM 256 key
      const freshAesKey = await generateAesKey();
      const rawAesBase64 = await exportAesKeyToBase64(freshAesKey);

      // 2. Encrypt this AES key with my Public RSA key
      const myEncryptedKey = await encryptAesKeyWithRsa(rawAesBase64, publicKeyJwk);

      // 3. Encrypt this AES key with target peer's Public RSA key
      const peerEncryptedKey = await encryptAesKeyWithRsa(rawAesBase64, targetUser.publicKey);

      // 4. Create keys payload map
      const eStore: EncryptedKeyStore = {
        [currentUser.id]: myEncryptedKey,
        [targetUser.id]: peerEncryptedKey
      };

      // 5. POST to server
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'direct',
          memberIds: [currentUser.id, targetUser.id],
          encryptedKeys: eStore
        })
      });

      if (!res.ok) throw new Error("Failed establishing direct channel room.");

      const data = await res.json();
      
      // Update local rooms lists
      setChatRooms(prev => [...prev, data.room]);
      setActiveRoomId(data.room.id);
      setActiveRoomType('direct');
      setActiveMobileView('chat');

    } catch (err) {
      console.error("Direct exchange creation failed:", err);
    }
  };

  // 9. Assemble custom Team E2EE payload
  const handleCreateTeam = async (name: string, desc: string) => {
    if (!currentUser) return;

    try {
      // 1. Generate Symmetric target key
      const freshAesKey = await generateAesKey();
      const rawAesBase64 = await exportAesKeyToBase64(freshAesKey);

      // 2. Encrypt with creator public key
      const myEncAesKey = await encryptAesKeyWithRsa(rawAesBase64, publicKeyJwk);

      const kStore: EncryptedKeyStore = {
        [currentUser.id]: myEncAesKey
      };

      // 3. POST to backend
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: desc,
          creatorId: currentUser.id,
          encryptedKeys: kStore
        })
      });

      if (!res.ok) throw new Error("Team envelope setup failed.");

      const data = await res.json();

      setTeams(prev => [...prev, data.team]);
      
      // Select the newborn general channel
      const generalChan = data.team.channels[0];
      setActiveRoomId(generalChan.id);
      setActiveRoomType('channel');
      setActiveMobileView('chat');

    } catch (err) {
      console.error("Team setup fail:", err);
    }
  };

  // 10. Append channel underneath team
  const handleCreateChannel = async (teamId: string, name: string, desc: string) => {
    try {
      const res = await fetch(`/api/teams/${teamId}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: desc })
      });

      if (!res.ok) throw new Error("Failed preparing channel segment.");

      const data = await res.json();
      
      // Update active list
      setTeams(prev => prev.map(t => {
        if (t.id === teamId) {
          return { ...t, channels: [...t.channels, data.channel] };
        }
        return t;
      }));

      // Auto-focus newborn channel
      setActiveRoomId(data.channel.id);
      setActiveRoomType('channel');
      setActiveMobileView('chat');

    } catch (err) {
      console.error("Channel append fail:", err);
    }
  };

  // 11. Invite user to Team and distribute keys securely via RSA
  const handleInviteUserToTeam = async (targetUserId: string) => {
    if (!currentUser || !activeRoomId || !activeRoomAesKeyBase64) return;

    // Find Team
    const targetTeam = teams.find(t => t.channels.some(c => c.id === activeRoomId));
    if (!targetTeam) return;

    // Find User public key
    const targetUserObj = allUsers.find(u => u.id === targetUserId);
    if (!targetUserObj) return;

    try {
      // 1. Securely encrypt Team AES key with target user's public RSA-OAEP Key
      const encryptedKeyForUser = await encryptAesKeyWithRsa(
        activeRoomAesKeyBase64, 
        targetUserObj.publicKey
      );

      // 2. Submit RSA handshake to server
      const res = await fetch(`/api/teams/${targetTeam.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: targetUserId,
          encryptedKey: encryptedKeyForUser
        })
      });

      if (!res.ok) throw new Error("Invite key transfer failure.");

      // Refresh
      await syncDataLists();

    } catch (err) {
      console.error("Invite client exchange failed:", err);
    }
  };

  // Group Chats E2EE Operations
  const handleCreateGroupChat = async (name: string, selectedMemberIds: string[]) => {
    if (!currentUser) return;

    try {
      const freshAesKey = await generateAesKey();
      const rawAesBase64 = await exportAesKeyToBase64(freshAesKey);

      const myEncryptedKey = await encryptAesKeyWithRsa(rawAesBase64, publicKeyJwk);

      const eStore: EncryptedKeyStore = {
        [currentUser.id]: myEncryptedKey
      };

      for (const mId of selectedMemberIds) {
        if (mId === currentUser.id) continue;
        const memberUser = allUsers.find(u => u.id === mId);
        if (memberUser && memberUser.publicKey) {
          try {
            const encryptedKeyForMember = await encryptAesKeyWithRsa(rawAesBase64, memberUser.publicKey);
            eStore[mId] = encryptedKeyForMember;
          } catch (err) {
            console.error(`Failed to encrypt key for member ${mId}:`, err);
          }
        }
      }

      const finalMemberIds = Array.from(new Set([currentUser.id, ...selectedMemberIds]));

      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'group',
          name,
          memberIds: finalMemberIds,
          adminId: currentUser.id,
          encryptedKeys: eStore
        })
      });

      if (!res.ok) throw new Error("Failed establishing group chat.");

      const data = await res.json();
      setChatRooms(prev => [...prev, data.room]);
      setActiveRoomId(data.room.id);
      setActiveRoomType('group');
      setActiveMobileView('chat');

    } catch (err) {
      console.error("Group chat creation failed:", err);
    }
  };

  const handleUpdateGroupChat = async (roomId: string, updatedMemberIds: string[], newAdminId?: string, newEncryptedKeys?: EncryptedKeyStore) => {
    try {
      const body: any = {};
      if (updatedMemberIds) body.memberIds = updatedMemberIds;
      if (newAdminId) body.adminId = newAdminId;
      if (newEncryptedKeys) body.encryptedKeys = newEncryptedKeys;

      const res = await fetch(`/api/chats/${roomId}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) throw new Error("Failed updating group chat details.");

      const data = await res.json();
      await syncDataLists();
    } catch (err) {
      console.error("Failed to update group chat:", err);
    }
  };

  const handleAddMemberToGroupChat = async (roomId: string, sUserId: string) => {
    const targetRoom = chatRooms.find(r => r.id === roomId);
    if (!targetRoom || !activeRoomAesKeyBase64) return;

    const targetUserObj = allUsers.find(u => u.id === sUserId);
    if (!targetUserObj) return;

    try {
      const encryptedKeyForUser = await encryptAesKeyWithRsa(
        activeRoomAesKeyBase64, 
        targetUserObj.publicKey
      );

      const updatedMembers = Array.from(new Set([...targetRoom.memberIds, sUserId]));

      await handleUpdateGroupChat(roomId, updatedMembers, undefined, {
        [sUserId]: encryptedKeyForUser
      });
    } catch (err) {
      console.error("Failed adding member to group chat:", err);
    }
  };

  const handleRemoveMemberFromGroupChat = async (roomId: string, sUserId: string) => {
    const targetRoom = chatRooms.find(r => r.id === roomId);
    if (!targetRoom) return;

    const updatedMembers = targetRoom.memberIds.filter(id => id !== sUserId);
    await handleUpdateGroupChat(roomId, updatedMembers);
  };

  const handleSetGroupAdmin = async (roomId: string, sUserId: string) => {
    await handleUpdateGroupChat(roomId, undefined, sUserId);
  };

  // 12. Simulate Key import / injection (dev panel callback)
  const handleImportPrivateKeys = (privJwk: string, pubJwk: string) => {
    if (!currentUser) return;
    setPublicKeyJwk(pubJwk);
    setPrivateKeyJwk(privJwk);

    const savedEmail = currentUser.email;

    localStorage.setItem(`e2ee_pub_key_${savedEmail}`, pubJwk);
    localStorage.setItem(`e2ee_priv_key_${savedEmail}`, privJwk);

    // Refresh Room Keys
    if (activeRoomId) {
      loadRoomSymmetricKey(activeRoomId, activeRoomType);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    setCurrentUser(null);
    setPublicKeyJwk('');
    setPrivateKeyJwk('');
    closeWebSocket();
  };

  // Helper selectors
  const activeRoomName = activeRoomId?.startsWith('chan-')
    ? teams.flatMap(t => t.channels).find(c => c.id === activeRoomId)?.name || 'channel'
    : chatRooms.find(r => r.id === activeRoomId) 
      ? (chatRooms.find(r => r.id === activeRoomId)?.type === 'direct' 
        ? allUsers.find(u => u.id === activeRoomId?.replace('dm-', '').split('-').find(id => id !== currentUser?.id))?.name || 'Encrypted Chat'
        : chatRooms.find(r => r.id === activeRoomId)?.name || 'Direct Dialogue')
      : 'Conversations Desk';

  const activeRoomDesc = activeRoomId?.startsWith('chan-')
    ? teams.flatMap(t => t.channels).find(c => c.id === activeRoomId)?.description || ''
    : chatRooms.find(r => r.id === activeRoomId)?.type === 'group'
      ? `Secure E2EE Group Chat. Admin: ${allUsers.find(u => u.id === chatRooms.find(r => r.id === activeRoomId)?.adminId)?.name || 'Unknown'}`
      : 'End-to-end encrypted direct dialogue tunnel.';

  const handleSelectRoom = (roomId: string, type: 'channel' | 'direct' | 'group') => {
    setActiveRoomId(roomId);
    setActiveRoomType(type);
    setActiveMobileView('chat');
  };

  // Fingerprint hash computation for visual verification of AES keys
  const getAesFingerprint = (base64Key: string | null) => {
    if (!base64Key) return null;
    let hash = 0;
    for (let i = 0; i < base64Key.length; i++) {
      const char = base64Key.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).toUpperCase().slice(0, 8);
  };

  // Key holders array for current team context
  const activeTeamContext = teams.find(t => t.channels.some(c => c.id === activeRoomId));
  const teamKeysRegisteredUsers = activeTeamContext 
    ? Object.keys(activeRoomKeysStore || {})
    : [];

  return (
    <div className="flex h-screen bg-[#0b0c10] text-[#f1f5f9] select-none" id="app-root-container">
      
      {/* 1. Welcoming Registration & RSA Certificate Preparation screen */}
      {!currentUser ? (
        <div className="flex-1 flex items-center justify-center bg-[#090a0f] p-6">
          <div className="w-full max-w-md bg-[#13141f] rounded-2xl border border-slate-800 shadow-2xl p-8 flex flex-col gap-6" id="registration-window">
            
            <div className="text-center flex flex-col gap-2">
              <div className="w-14 h-14 bg-[#4f46e5] text-white p-3 rounded-2xl font-bold flex items-center justify-center text-2xl mx-auto border border-indigo-400">
                🔒
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white mt-1">E2EE Chat Workspaces</h1>
              <p className="text-xs text-slate-400 max-w-xs mx-auto leading-normal">
                Prepare your asymmetric RSA-OAEP 2048 identity keypair locally inside your browser to open teams.
              </p>
            </div>

            <form onSubmit={handleKeyCreationSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Your Display Username</label>
                <input
                  type="text"
                  value={registrationName}
                  onChange={(e) => setRegistrationName(e.target.value)}
                  placeholder="e.g. David Aland"
                  className="w-full bg-[#12131e] text-xs border border-slate-800 focus:border-[#4f46e5] rounded-lg p-3 outline-none text-slate-100 transition-colors"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Secure Mobile Number</label>
                <input
                  type="tel"
                  value={registrationEmail}
                  onChange={(e) => setRegistrationEmail(e.target.value)}
                  placeholder="e.g. +1 (555) 012-3456"
                  className="w-full bg-[#12131e] text-xs border border-slate-800 focus:border-[#4f46e5] rounded-lg p-3 outline-none text-slate-100 transition-colors"
                  required
                />
              </div>

              {serverError && (
                <div className="bg-red-950/40 border border-red-900/40 text-red-400 rounded-lg p-3 text-xs leading-normal">
                  {serverError}
                </div>
              )}

              <button
                type="submit"
                disabled={isGeneratingKeys}
                className="w-full bg-[#4f46e5] hover:bg-[#4338ca] text-white py-3 rounded-lg font-semibold tracking-wide disabled:opacity-40 select-none text-xs flex items-center justify-center gap-1.5 transition-all text-center mt-2 border border-indigo-400"
              >
                {isGeneratingKeys ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Spinning entropy RSA curves...</span>
                  </>
                ) : (
                  <>
                    <Key className="w-4 h-4" />
                    <span>Synthesize Encryption Certificate</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* 2. Primary Teams Full-Stack operational UI */
        <div className="flex-1 flex overflow-hidden w-full h-full relative" id="workspace-layout">
          
          {/* Main Sidebar Wrapper */}
          <div 
            className={`h-full shrink-0 ${
              activeMobileView === 'chat' ? 'hidden md:flex' : 'flex w-full md:w-auto'
            }`}
            id="sidebar-wrapper"
          >
            <TeamsSidebar
              currentUser={currentUser}
              teams={teams}
              chatRooms={chatRooms}
              allUsers={allUsers}
              activeRoomId={activeRoomId}
              onSelectRoom={handleSelectRoom}
              onCreateTeam={handleCreateTeam}
              onCreateChannel={handleCreateChannel}
              onStartDirectChat={handleStartDirectChat}
              onLogout={handleLogout}
              onRefreshAll={syncDataLists}
              onCreateGroupChat={handleCreateGroupChat}
            />
          </div>

          {/* Central Workspace layout */}
          <div 
            className={`flex-1 flex-col bg-slate-900/40 overflow-hidden ${
              activeMobileView === 'sidebar' ? 'hidden md:flex' : 'flex w-full h-full relative'
            }`}
            id="chat-workspace-wrapper"
          >
            {/* Header control */}
            <ChatHeader
              roomName={activeRoomName}
              roomDesc={activeRoomDesc}
              roomType={activeRoomType}
              activeRoomId={activeRoomId}
              hasAESKey={!!activeRoomAesKey}
              aesKeyFingerprint={getAesFingerprint(activeRoomAesKeyBase64)}
              teams={teams}
              allUsers={allUsers}
              teamKeysRegisteredUsers={teamKeysRegisteredUsers}
              onInviteUserToTeam={handleInviteUserToTeam}
              onToggleSecurityPanel={() => setIsSecurityPanelOpen(!isSecurityPanelOpen)}
              isSecurityPanelOpen={isSecurityPanelOpen}
              activeRoom={chatRooms.find(r => r.id === activeRoomId)}
              currentUser={currentUser}
              onAddMemberToGroup={handleAddMemberToGroupChat}
              onRemoveMemberFromGroup={handleRemoveMemberFromGroupChat}
              onSetGroupAdmin={handleSetGroupAdmin}
              onStartVoiceCall={() => { setIsCallVideo(false); setIsCallOpen(true); }}
              onStartVideoCall={() => { setIsCallVideo(true); setIsCallOpen(true); }}
              onBackToSidebar={() => setActiveMobileView('sidebar')}
            />

            {/* Handshake requested callout if key is missing */}
            {!activeRoomAesKey && activeRoomId && (
              <div className="mx-6 mt-6 bg-amber-950/20 border border-amber-900/50 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
                <div className="flex items-start gap-3">
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2 text-amber-400 shrink-0 mt-0.5">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <h3 className="font-bold text-xs text-amber-200 uppercase tracking-wide">Key Handshake Required</h3>
                    <p className="text-[11px] text-slate-400 max-w-md leading-relaxed">
                      You do not hold the E2EE key for this room in your local RSA keychain yet. Request a secure brokered key distribution handshake right now.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRequestSimulatedHandshake}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3.5 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 shrink-0 transition-colors"
                >
                  <HeartHandshake className="w-4 h-4" />
                  <span>Request Key Handshake</span>
                </button>
              </div>
            )}

            {/* Messages stream */}
            <EncryptedMessageList
              messages={messages}
              decryptedMessageMap={decryptedMessageMap}
              currentUser={currentUser}
              typingUsers={typingUsers}
              allUsers={allUsers}
              isSecurityConsoleOpen={isSecurityPanelOpen}
            />

            {/* Input pane */}
            <ChatInput
              onSendMessage={handleSendMessage}
              onSendTyping={handleSendTyping}
              activeRoomId={activeRoomId}
              hasAESKey={!!activeRoomAesKey}
            />
          </div>

          {/* Right hand Security overlays */}
          {isSecurityPanelOpen && (
            <SecurityPanel
              currentUser={currentUser}
              publicKeyJwk={publicKeyJwk}
              privateKeyJwk={privateKeyJwk}
              activeRoomAesKeyBase64={activeRoomAesKeyBase64}
              activeRoomId={activeRoomId}
              activeRoomName={activeRoomName}
              onImportPrivateKeys={handleImportPrivateKeys}
            />
          )}

          {/* Secure Handshake Voice and Video Call overlay */}
          <CallModal
            isOpen={isCallOpen}
            isVideoCall={isCallVideo}
            roomName={activeRoomName}
            roomType={activeRoomType}
            activeRoom={chatRooms.find(r => r.id === activeRoomId)}
            currentUser={currentUser}
            allUsers={allUsers}
            onClose={() => setIsCallOpen(false)}
          />

        </div>
      )}
    </div>
  );
}
