import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { 
  User, 
  Team, 
  Channel, 
  ChatRoom, 
  Message, 
  EncryptedKeyStore 
} from "./src/types.js"; // Use js extension for esm/ts compatibility in bundler

// Node polyfill or native globalThis.crypto access
// In Node 18, 20, 22 globalThis.crypto is fully functional

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = 3000;

app.use(express.json());

// In-Memory Database State
const users: Record<string, User> = {};
const teams: Record<string, Team> = {};
const rooms: Record<string, ChatRoom> = {};
const messages: Record<string, Message[]> = {}; // roomId -> Message[]
const roomKeys: Record<string, EncryptedKeyStore> = {}; // roomId/teamId -> { userId -> base64EncryptedAesKey }

// Simulated users in-memory private keys for automated chat interactions
const botPrivateKeys: Record<string, any> = {}; 

// Initialize Gemini SDK with telemetry header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build'
    }
  }
});

// Setup cryptographic simulation helpers for server-side bots (Gemini, Alex, Sarah)
async function generateBotKeyPair(email: string, name: string) {
  try {
    const keyPair = await globalThis.crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"]
    );

    const pubJwk = await globalThis.crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const privJwk = await globalThis.crypto.subtle.exportKey("jwk", keyPair.privateKey);

    users[email] = {
      id: email,
      email: email,
      name: name,
      publicKey: JSON.stringify(pubJwk),
      status: "online",
      lastSeen: new Date().toISOString()
    };

    botPrivateKeys[email] = keyPair.privateKey;
  } catch (err) {
    console.error(`Failed to generate keys for bot ${email}:`, err);
  }
}

// Seed Initial Data after Server Initiates WebCrypto
async function seedInitialData() {
  // Generate keys for Bots
  await generateBotKeyPair("+18005550199", "Gemini AI Architect Core");
  await generateBotKeyPair("+15550100200", "Alex Rivers (Lead SecOps)");
  await generateBotKeyPair("+15550200300", "Sarah Jenkins (Product Director)");

  console.log("Seeding mock Teams and Channels...");

  // Seed default Team
  const teamId = "team-hq";
  const defaultTeam: Team = {
    id: teamId,
    name: "Enterprise Architecture Team",
    description: "Welcome to Teams E2EE core workspace. Discuss platform infrastructure and cryptographic protocols here.",
    creatorId: "+15550200300",
    createdAt: new Date().toISOString(),
    channels: [
      {
        id: "chan-general",
        teamId: teamId,
        name: "general",
        description: "Company-wide announcements and operational updates.",
        createdAt: new Date().toISOString()
      },
      {
        id: "chan-secops",
        teamId: teamId,
        name: "security-audits",
        description: "Cryptographic handshakes, RSA-OAEP keys, and AES-GCM verification logs.",
        createdAt: new Date().toISOString()
      }
    ]
  };

  teams[teamId] = defaultTeam;

  // We generate a mock AES channel key on the server just to pre-bootstrap bots
  // Real E2EE keys are created by clients and uploaded.
  // For pre-seeded bots, we generate an AES key and encrypt it using current bots' public key inputs.
  try {
    const aesKey = await globalThis.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    const rawAesBytes = await globalThis.crypto.subtle.exportKey("raw", aesKey);
    const rawAesB64 = Buffer.from(rawAesBytes).toString("base64");

    const keyStore: EncryptedKeyStore = {};
    for (const bEmail of ["+18005550199", "+15550100200", "+15550200300"]) {
      const userObj = users[bEmail];
      const pubKey = await globalThis.crypto.subtle.importKey(
        "jwk",
        JSON.parse(userObj.publicKey),
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["encrypt"]
      );
      const encryptedBuffer = await globalThis.crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        pubKey,
        rawAesBytes
      );
      keyStore[bEmail] = Buffer.from(encryptedBuffer).toString("base64");
    }

    roomKeys[teamId] = keyStore; // Store symmetric Key for the Team

    // Seed welcoming messages
    messages["chan-general"] = [];
    messages["chan-secops"] = [];
  } catch (err) {
    console.error("Failed to seed symmetric keys for channels:", err);
  }
}

// API Routes
app.get("/api/users", (req, res) => {
  res.json(Object.values(users));
});

app.post("/api/register", (req, res) => {
  const { id, name, email, publicKey } = req.body;
  if (!id || !email || !publicKey) {
    return res.status(400).json({ error: "Missing identity registration fields." });
  }

  // Register or update user
  users[id] = {
    id,
    name: name || id.split("@")[0],
    email,
    publicKey,
    status: "online",
    lastSeen: new Date().toISOString()
  };

  // If registering, also auto-add user to Pre-seeded Enterprise Architecture Team E2EE Key Store
  // Wait, the client can request keys for verification. To let them instantly join, we need to
  // let them encrypt their own key or wait for creator to do it. But to make UX seamless,
  // when User registers, they can register, then they will fetch users and set up.
  
  res.json({ success: true, user: users[id] });
});

app.get("/api/teams", (req, res) => {
  res.json(Object.values(teams));
});

app.post("/api/teams", (req, res) => {
  const { name, description, creatorId, encryptedKeys } = req.body;
  if (!name || !creatorId || !encryptedKeys) {
    return res.status(400).json({ error: "Missing required team parameters." });
  }

  const teamId = "team-" + Date.now().toString(36);
  const newTeam: Team = {
    id: teamId,
    name,
    description: description || "",
    creatorId,
    createdAt: new Date().toISOString(),
    channels: [
      {
        id: `chan-gen-${Date.now().toString(36)}`,
        teamId: teamId,
        name: "general",
        description: "General channel.",
        createdAt: new Date().toISOString()
      }
    ]
  };

  teams[teamId] = newTeam;
  roomKeys[teamId] = encryptedKeys; // format: { [userId]: base64EncryptedAES }

  broadcastToAll({
    type: "team-created",
    team: newTeam,
    keys: encryptedKeys
  });

  res.json({ success: true, team: newTeam });
});

app.post("/api/teams/:id/channels", (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  const team = teams[id];
  if (!team) {
    return res.status(404).json({ error: "Team not found" });
  }

  const newChannel: Channel = {
    id: `chan-${Date.now().toString(36)}`,
    teamId: id,
    name: name.replace(/\s+/g, '-').toLowerCase(),
    description: description || "",
    createdAt: new Date().toISOString()
  };

  team.channels.push(newChannel);

  broadcastToAll({
    type: "channel-created",
    channel: newChannel,
    teamId: id
  });

  res.json({ success: true, channel: newChannel });
});

app.post("/api/teams/:id/invite", (req, res) => {
  const { id } = req.params;
  const { userId, encryptedKey } = req.body;

  if (!roomKeys[id]) {
    roomKeys[id] = {};
  }
  roomKeys[id][userId] = encryptedKey;

  broadcastToAll({
    type: "team-keys-updated",
    teamId: id,
    userId,
    encryptedKey
  });

  res.json({ success: true });
});

app.get("/api/chats", (req, res) => {
  // Return all direct custom rooms
  res.json(Object.values(rooms));
});

app.post("/api/chats", (req, res) => {
  const { type, name, memberIds, encryptedKeys, adminId } = req.body;
  if (!memberIds || memberIds.length === 0 || !encryptedKeys) {
    return res.status(400).json({ error: "Missing rooms or encrypted keys." });
  }

  // Create a unique deterministic roomId if direct
  let roomId = "room-" + Date.now().toString(36);
  if (type === "direct" && memberIds.length === 2) {
    const sorted = [...memberIds].sort();
    roomId = `dm-${sorted[0]}-${sorted[1]}`;
  }

  const newRoom: ChatRoom = {
    id: roomId,
    type: type || "direct",
    name,
    memberIds,
    adminId,
    createdAt: new Date().toISOString()
  };

  rooms[roomId] = newRoom;
  roomKeys[roomId] = encryptedKeys;

  broadcastToAll({
    type: "chat-room-created",
    room: newRoom,
    keys: encryptedKeys
  });

  res.json({ success: true, room: newRoom });
});

app.post("/api/chats/:roomId/update", (req, res) => {
  const { roomId } = req.params;
  const { memberIds, adminId, encryptedKeys } = req.body;

  const room = rooms[roomId];
  if (!room) {
    return res.status(404).json({ error: "Group chat not found." });
  }

  if (memberIds) {
    room.memberIds = memberIds;
    // Cryptographic cleanup: remove key from keystore for users who were removed
    if (roomKeys[roomId]) {
      for (const uid of Object.keys(roomKeys[roomId])) {
        if (!memberIds.includes(uid)) {
          delete roomKeys[roomId][uid];
        }
      }
    }
  }

  if (adminId) {
    room.adminId = adminId;
  }

  if (encryptedKeys) {
    if (!roomKeys[roomId]) {
      roomKeys[roomId] = {};
    }
    Object.assign(roomKeys[roomId], encryptedKeys);
  }

  broadcastToAll({
    type: "chat-room-updated",
    room,
    keys: roomKeys[roomId]
  });

  res.json({ success: true, room });
});

app.get("/api/keys/:roomId", (req, res) => {
  const { roomId } = req.params;
  // If starting with chan-, key is inherited from team
  let lookupId = roomId;
  if (roomId.startsWith("chan-")) {
    const foundTeam = Object.values(teams).find(t => t.channels.some(c => c.id === roomId));
    if (foundTeam) {
      lookupId = foundTeam.id;
    }
  }

  const keys = roomKeys[lookupId] || {};
  res.json(keys);
});

app.post("/api/keys/:roomId/simulate-grant", async (req, res) => {
  const { roomId } = req.params;
  const { userId, userPublicKey } = req.body;

  let lookupId = roomId;
  if (roomId.startsWith("chan-")) {
    const foundTeam = Object.values(teams).find(t => t.channels.some(c => c.id === roomId));
    if (foundTeam) {
      lookupId = foundTeam.id;
    }
  }

  const keyStore = roomKeys[lookupId];
  if (!keyStore) {
    return res.status(404).json({ error: "No symmetric keys stored for this room." });
  }

  try {
    const brokerBot = "+15550200300";
    const encryptedAesKeyB64 = keyStore[brokerBot];
    const brokerPrivKey = botPrivateKeys[brokerBot];

    if (!encryptedAesKeyB64 || !brokerPrivKey) {
      return res.status(500).json({ error: "Cryptographic bridge bot unavailable to sign session." });
    }

    // Decrypt AES key with Sarah's RSA Private Key
    const encryptedAesBuffer = Buffer.from(encryptedAesKeyB64, "base64");
    const decryptedAesBytes = await globalThis.crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      brokerPrivKey,
      encryptedAesBuffer
    );

    // Re-encrypt AES key for target user using their provided public RSA Key
    const targetUserPubKey = await globalThis.crypto.subtle.importKey(
      "jwk",
      JSON.parse(userPublicKey),
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["encrypt"]
    );

    const reEncryptedBuffer = await globalThis.crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      targetUserPubKey,
      decryptedAesBytes
    );

    const reEncryptedB64 = Buffer.from(reEncryptedBuffer).toString("base64");
    keyStore[userId] = reEncryptedB64;

    broadcastToAll({
      type: "team-keys-updated",
      teamId: lookupId,
      userId,
      encryptedKey: reEncryptedB64
    });

    res.json({ success: true, encryptedKey: reEncryptedB64 });
  } catch (err) {
    console.error("Bridge key transfer fail:", err);
    res.status(500).json({ error: "Handshake generation failed." });
  }
});

app.get("/api/history/:roomId", (req, res) => {
  const { roomId } = req.params;
  res.json(messages[roomId] || []);
});

// Real-Time Bot Interaction Layer
async function handleBotMessage(roomId: string, messageText: string, senderId: string, senderName: string) {
  // Find which Bot is targeted, or if it's a DM with a bot
  let isBotTargeted = false;
  let botEmail = "";

  if (roomId.startsWith("dm-")) {
    const parts = roomId.replace("dm-", "").split("-");
    const target = parts.find(p => p !== senderId);
    if (target && users[target] && target === "+18005550199") {
      isBotTargeted = true;
      botEmail = target;
    }
  } else if (messageText.includes("@Gemini") || messageText.toLowerCase().includes("@gemini")) {
    isBotTargeted = true;
    botEmail = "+18005550199";
  }

  if (!isBotTargeted || !botEmail) return;

  // Let clients show writing status
  broadcastToRoom(roomId, {
    type: "typing",
    roomId: roomId,
    userId: botEmail,
    name: users[botEmail].name,
    isTyping: true
  });

  // Wait a small organic moment
  await new Promise(resolve => setTimeout(resolve, 1500));

  try {
    const prompt = messageText.replace(/@Gemini/gi, "").trim();

    // Call Gemini API safely
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `You are the Gemini AI Security Assistant integrated as a Microsoft Teams bot inside a full-stack, 100% end-to-end encrypted messaging workspace.
      The user is talking directly to you. They are currently testing E2EE mechanics (RSA-OAEP 2048 for handshakes, and AES-GCM 256 for symmetric message streams).
      Provide a highly helpful, concise, context-aware response that looks authentic for an engineering group chat or support channel. Keep your answer professional, engineering-savvy, and focused on cybersecurity, E2EE, or general technology, matching their query. Mention E2EE mechanics briefly if they ask about encryption.
      
      User query: ${prompt}`
    });

    const aiResText = response.text || "Hello! Your end-to-end encrypted packet was received, decrypted, processed, and this reply was safely re-encrypted on the client container boundary.";

    // Since we are E2EE, we need to:
    // 1. Decrypt/get the AES Symmetric key for this room on the server on behalf of the Bot
    // Wait, the client uploaded an encrypted key store where:
    // roomKeys[lookupId]['gemini@bot.ai'] is the AES key encrypted with Gemini's Public RSA Key.
    let lookupId = roomId;
    if (roomId.startsWith("chan-")) {
      const foundTeam = Object.values(teams).find(t => t.channels.some(c => c.id === roomId));
      if (foundTeam) {
        lookupId = foundTeam.id;
      }
    }

    const encryptedAesKeyB64 = roomKeys[lookupId]?.[botEmail];
    const botPrivKey = botPrivateKeys[botEmail];

    if (!encryptedAesKeyB64 || !botPrivKey) {
      throw new Error(`Bot ${botEmail} does not have access keys seeded or configured for channel: ${lookupId}`);
    }

    // Decrypt AES key using Bot's RSA Private Key
    const encryptedAesBuffer = Buffer.from(encryptedAesKeyB64, "base64");
    const decryptedAesBytes = await globalThis.crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      botPrivKey,
      encryptedAesBuffer
    );

    // Import the raw AES key for symmetric GCM operation
    const aesCryptoKey = await globalThis.crypto.subtle.importKey(
      "raw",
      decryptedAesBytes,
      { name: "AES-GCM" },
      true,
      ["encrypt"]
    );

    // Encrypt the AI respond text using GCM
    const encoder = new TextEncoder();
    const dataToEncrypt = encoder.encode(aiResText);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));

    const encryptedMsgBuffer = await globalThis.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      aesCryptoKey,
      dataToEncrypt
    );

    const b64Ciphertext = Buffer.from(encryptedMsgBuffer).toString("base64");
    const b64Iv = Buffer.from(iv.buffer).toString("base64");

    const botMessage: Message = {
      id: "msg-" + Date.now().toString(36),
      roomId: roomId,
      senderId: botEmail,
      senderName: users[botEmail].name,
      encryptedPayload: b64Ciphertext,
      iv: b64Iv,
      createdAt: new Date().toISOString(),
      readBy: [botEmail]
    };

    if (!messages[roomId]) {
      messages[roomId] = [];
    }
    messages[roomId].push(botMessage);

    // Stop typing status and broadcast the real message
    broadcastToRoom(roomId, {
      type: "typing",
      roomId: roomId,
      userId: botEmail,
      name: users[botEmail].name,
      isTyping: false
    });

    broadcastToRoom(roomId, {
      type: "message",
      message: botMessage
    });

    // Auto-read by other bots/agents after a small delay
    simulateBotReads(roomId, botEmail, botMessage.id);

  } catch (error) {
    console.error("Failed to generate and encrypt AI response:", error);
    
    // Stop typing status
    broadcastToRoom(roomId, {
      type: "typing",
      roomId: roomId,
      userId: botEmail,
      name: users[botEmail].name,
      isTyping: false
    });
  }
}

// Simulated active responder buddies (Alex, Sarah)
async function triggerMockPartnerReplies(roomId: string, messageText: string, senderId: string) {
  // If it's a DM with Alex or Sarah
  if (!roomId.startsWith("dm-")) return;
  const parts = roomId.replace("dm-", "").split("-");
  const targetEmail = parts.find(p => p !== senderId);
  if (!targetEmail || targetEmail === "+18005550199" || !users[targetEmail] || !botPrivateKeys[targetEmail]) {
    return;
  }

  // Set typing
  broadcastToRoom(roomId, {
    type: "typing",
    roomId: roomId,
    userId: targetEmail,
    name: users[targetEmail].name,
    isTyping: true
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    let replyText = "";
    if (targetEmail === "+15550100200") {
      const responses = [
        "Hey! Secure handshake received. Verified that the RSA-OAEP exchange successfully transferred the 256-bit symmetric block.",
        "Your package decryption looks solid on my side. GCM parameters match perfectly.",
        "That's high assurance cryptography. Let's make sure the client logs never emit our private keys in readable text in standard states.",
        "Awesome Teams clone! End-to-end encryption adds perfect privacy layer on Cloud Run instances."
      ];
      replyText = responses[Math.floor(Math.random() * responses.length)];
    } else if (targetEmail === "+15550200300") {
      const responses = [
        "Great work. The E2EE chat module layout looks incredible, exactly like Teams! Let's align on the sprint delivery.",
        "Received. Let's show this architecture to the security compliance reviews tomorrow morning.",
        "Yes, absolutely. Are all group members' keys exchanging securely when added to new channel lists?",
        "Beautifully done! The encrypted payload inspector toggle is highly visual. It represents absolute transparency for our customers."
      ];
      replyText = responses[Math.floor(Math.random() * responses.length)];
    }

    // Decrypt symmetric AES key
    const encryptedAesKeyB64 = roomKeys[roomId]?.[targetEmail];
    const botPrivKey = botPrivateKeys[targetEmail];

    if (!encryptedAesKeyB64 || !botPrivKey) {
      throw new Error(`Symmetric keys missing for peer ${targetEmail}`);
    }

    const encryptedAesBuffer = Buffer.from(encryptedAesKeyB64, "base64");
    const decryptedAesBytes = await globalThis.crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      botPrivKey,
      encryptedAesBuffer
    );

    const aesCryptoKey = await globalThis.crypto.subtle.importKey(
      "raw",
      decryptedAesBytes,
      { name: "AES-GCM" },
      true,
      ["encrypt"]
    );

    const encoder = new TextEncoder();
    const dataToEncrypt = encoder.encode(replyText);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));

    const encryptedMsgBuffer = await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      aesCryptoKey,
      dataToEncrypt
    );

    const b64Ciphertext = Buffer.from(encryptedMsgBuffer).toString("base64");
    const b64Iv = Buffer.from(iv.buffer).toString("base64");

    const replyMessage: Message = {
      id: "msg-" + Date.now().toString(36),
      roomId: roomId,
      senderId: targetEmail,
      senderName: users[targetEmail].name,
      encryptedPayload: b64Ciphertext,
      iv: b64Iv,
      createdAt: new Date().toISOString(),
      readBy: [targetEmail]
    };

    if (!messages[roomId]) {
      messages[roomId] = [];
    }
    messages[roomId].push(replyMessage);

    // Stop typing status and broadcast the real message
    broadcastToRoom(roomId, {
      type: "typing",
      roomId: roomId,
      userId: targetEmail,
      name: users[targetEmail].name,
      isTyping: false
    });

    broadcastToRoom(roomId, {
      type: "message",
      message: replyMessage
    });
    
    // Auto-read by other bots/agents after small delay
    simulateBotReads(roomId, targetEmail, replyMessage.id);

  } catch (err) {
    console.error(`Failed automated partner reply for ${targetEmail}:`, err);
    broadcastToRoom(roomId, {
      type: "typing",
      roomId: roomId,
      userId: targetEmail,
      name: users[targetEmail].name,
      isTyping: false
    });
  }
}

// Helper to simulate bots and partners reading messages
function simulateBotReads(roomId: string, senderId: string, messageId: string) {
  const botsInRoom: string[] = [];
  if (roomId.startsWith("dm-")) {
    const parts = roomId.replace("dm-", "").split("-");
    parts.forEach(id => {
      if (id !== senderId && (id === "+18005550199" || id === "+15550100200" || id === "+15550200300")) {
        botsInRoom.push(id);
      }
    });
  } else if (roomId.startsWith("chan-")) {
    const botEmails = ["+18005550199", "+15550100200", "+15550200300"];
    botEmails.forEach(email => {
      if (email !== senderId) {
        botsInRoom.push(email);
      }
    });
  }

  if (botsInRoom.length === 0) return;

  botsInRoom.forEach(botEmail => {
    // Generate an organic reading delay
    setTimeout(() => {
      const roomMsgs = messages[roomId];
      if (!roomMsgs) return;
      const msg = roomMsgs.find(m => m.id === messageId);
      if (msg) {
        if (!msg.readBy) msg.readBy = [msg.senderId];
        if (!msg.readBy.includes(botEmail)) {
          msg.readBy.push(botEmail);
          broadcastToRoom(roomId, {
            type: "messages-read",
            roomId,
            userId: botEmail,
            messageIds: [msg.id]
          });
        }
      }
    }, 700 + Math.random() * 1000);
  });
}

// WebSocket Setup
const wss = new WebSocketServer({ noServer: true });
const activeSockets = new Map<string, WebSocket>(); // userId -> Socket

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  if (url.pathname === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on("connection", (ws: WebSocket, request) => {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const userId = url.searchParams.get("userId");

  if (userId) {
    activeSockets.set(userId, ws);
    console.log(`WebSocket connected for User ${userId}`);
    
    // Update user status
    if (users[userId]) {
      users[userId].status = "online";
      users[userId].lastSeen = new Date().toISOString();
    }

    // Broadcast current online user list
    broadcastPresence();

    ws.on("message", async (data) => {
      try {
        const payload = JSON.parse(data.toString());
        
        switch (payload.type) {
          case "send-message": {
            const { message, plainTextForBot } = payload;
            const msg: Message = message;
            
            if (!msg.readBy) {
              msg.readBy = [msg.senderId];
            } else if (!msg.readBy.includes(msg.senderId)) {
              msg.readBy.push(msg.senderId);
            }

            if (!messages[msg.roomId]) {
              messages[msg.roomId] = [];
            }
            messages[msg.roomId].push(msg);

            // Broadcast message back to other connected room members
            broadcastToRoom(msg.roomId, {
              type: "message",
              message: msg
            });

            // Trigger AI assistant / automated responses
            if (plainTextForBot) {
              await handleBotMessage(msg.roomId, plainTextForBot, msg.senderId, msg.senderName);
              await triggerMockPartnerReplies(msg.roomId, plainTextForBot, msg.senderId);
            }

            // Trigger organic simulated reading receipts for mock partners/agents in the room
            simulateBotReads(msg.roomId, msg.senderId, msg.id);
            break;
          }

          case "mark-all-read": {
            const { roomId, userId: readerId } = payload;
            if (!messages[roomId]) break;
            
            const updatedMsgIds: string[] = [];
            messages[roomId].forEach(m => {
              if (!m.readBy) m.readBy = [m.senderId];
              if (!m.readBy.includes(readerId)) {
                m.readBy.push(readerId);
                updatedMsgIds.push(m.id);
              }
            });

            if (updatedMsgIds.length > 0) {
              broadcastToRoom(roomId, {
                type: "messages-read",
                roomId,
                userId: readerId,
                messageIds: updatedMsgIds
              });
            }
            break;
          }

          case "typing": {
            const { roomId, userId, name, isTyping } = payload;
            broadcastToRoom(roomId, {
              type: "typing",
              roomId,
              userId,
              name,
              isTyping
            }, userId); // exclude self
            break;
          }

          case "register-presence": {
            if (users[userId]) {
              users[userId].status = "online";
              users[userId].lastSeen = new Date().toISOString();
              broadcastPresence();
            }
            break;
          }
        }
      } catch (err) {
        console.error("Failed processing WebSocket message:", err);
      }
    });

    ws.on("close", () => {
      activeSockets.delete(userId);
      console.log(`WebSocket closed for User ${userId}`);
      if (users[userId]) {
        users[userId].status = "offline";
        users[userId].lastSeen = new Date().toISOString();
        broadcastPresence();
      }
    });

    ws.on("error", () => {
      activeSockets.delete(userId);
      if (users[userId]) {
        users[userId].status = "offline";
        broadcastPresence();
      }
    });
  }
});

// Broadcast WebSockets to all connections
function broadcastToAll(message: any) {
  const payloadStr = JSON.stringify(message);
  for (const socket of activeSockets.values()) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(payloadStr);
    }
  }
}

// Broadcast to members in a specific Room / Channel
function broadcastToRoom(roomId: string, message: any, excludeUserId?: string) {
  const payloadStr = JSON.stringify(message);
  
  // Decide which userIDs are members
  let targetUserIds: string[] = [];
  
  if (roomId.startsWith("dm-")) {
    targetUserIds = roomId.replace("dm-", "").split("-");
  } else if (roomId.startsWith("chan-")) {
    // Channel belongs to a team, and all users mapped in this team's key store can access
    const foundTeam = Object.values(teams).find(t => t.channels.some(c => c.id === roomId));
    if (foundTeam) {
      targetUserIds = Object.keys(roomKeys[foundTeam.id] || {});
    }
  } else if (rooms[roomId]) {
    targetUserIds = rooms[roomId].memberIds;
  }

  // Filter out any excluded users (like the self-sender)
  if (excludeUserId) {
    targetUserIds = targetUserIds.filter(id => id !== excludeUserId);
  }

  // Include Bots as conceptually online if not excluded (DMs)
  // Let's iterate all active global connections matching target IDs
  for (const uid of targetUserIds) {
    const socket = activeSockets.get(uid);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(payloadStr);
    }
  }
}

function broadcastPresence() {
  const presenceList = Object.values(users).map(u => ({
    userId: u.id,
    status: activeSockets.has(u.id) || ["+18005550199", "+15550100200", "+15550200300"].includes(u.id) ? "online" : "offline"
  }));
  broadcastToAll({
    type: "presence-update",
    presence: presenceList
  });
}

// Integration of Express with Vite for local rendering
async function startServer() {
  // Seed Bot profiles and teams on startup
  await seedInitialData();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`E2EE Core Server running seamlessly on http://localhost:${PORT}`);
  });
}

startServer();
