export interface User {
  id: string; // matches email for simplicity of authentication
  name: string;
  email: string;
  publicKey: string; // JSON Web Key (JWK) as a string-serialized public key
  status: 'online' | 'offline';
  lastSeen?: string;
}

export interface Channel {
  id: string;
  teamId: string;
  name: string;
  description: string;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  creatorId: string;
  createdAt: string;
  channels: Channel[];
}

export interface ChatRoom {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  memberIds: string[];
  adminId?: string; // Group administrator user.id
  createdAt: string;
}

/**
 * Stores the AES symmetric key for a chat/team, encrypted with each participating user's individual RSA public key.
 */
export interface EncryptedKeyStore {
  [userId: string]: string; // userId -> base64 encrypted symmetric key
}

export interface Message {
  id: string;
  roomId: string; // can be a DM Room ID or a Team Channel ID
  senderId: string;
  senderName: string;
  encryptedPayload: string; // base64 representation of ciphertext (AES-GCM)
  iv: string; // base64 initialization vector (AES-GCM)
  createdAt: string;
  signature?: string; // Optional RSA signature for verifying sender authenticity
  readBy?: string[]; // user.id[] array of users who have read this message
}

export interface ActivePresence {
  userId: string;
  status: 'online' | 'offline';
}

/**
 * Format used for exporting/backing up security keys
 */
export interface SecurityBackup {
  userId: string;
  username: string;
  publicKeyJwk: string;
  privateKeyJwk: string;
  exportDate: string;
}
