/**
 * End-to-End Encryption Utilities using the Web Crypto API.
 * Provides asymmetric RSA-OAEP key exchange and symmetric AES-GCM message encryption.
 */

// Helper to convert ArrayBuffer to Base64
export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper to convert Base64 to ArrayBuffer
export function base64ToBuffer(base64: string): ArrayBuffer {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

// Generate an RSA-OAEP Key Pair for end-to-end symmetric key wrap-unwrap
export async function generateRsaKeyPair(): Promise<{
  publicKeyJwk: string;
  privateKeyJwk: string;
}> {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true, // extractable
    ["encrypt", "decrypt"]
  );

  const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);

  return {
    publicKeyJwk: JSON.stringify(publicKeyJwk),
    privateKeyJwk: JSON.stringify(privateKeyJwk),
  };
}

// Import public key from JWK string
export async function importRsaPublicKey(jwkString: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString);
  return await window.crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["encrypt"]
  );
}

// Import private key from JWK string
export async function importRsaPrivateKey(jwkString: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString);
  return await window.crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["decrypt"]
  );
}

// Generate a random AES-GCM 256-bit Symmetric Key
export async function generateAesKey(): Promise<CryptoKey> {
  return await window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true, // extractable so we can encrypt and store it
    ["encrypt", "decrypt"]
  );
}

// Export AES key as Base64 raw representation
export async function exportAesKeyToBase64(aesKey: CryptoKey): Promise<string> {
  const rawKey = await window.crypto.subtle.exportKey("raw", aesKey);
  return bufferToBase64(rawKey);
}

// Import AES key from Base64 raw representation
export async function importAesKeyFromBase64(base64Key: string): Promise<CryptoKey> {
  const rawBuffer = base64ToBuffer(base64Key);
  return await window.crypto.subtle.importKey(
    "raw",
    rawBuffer,
    {
      name: "AES-GCM",
    },
    true,
    ["encrypt", "decrypt"]
  );
}

// Encrypt a Symmetric AES raw key with an RSA-OAEP Public Key (Return Base64)
export async function encryptAesKeyWithRsa(
  aesKeyBase64: string,
  rsaPublicKeyJwk: string
): Promise<string> {
  const rsaPublicKey = await importRsaPublicKey(rsaPublicKeyJwk);
  const rawAesBuffer = base64ToBuffer(aesKeyBase64);

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: "RSA-OAEP",
    },
    rsaPublicKey,
    rawAesBuffer
  );

  return bufferToBase64(encryptedBuffer);
}

// Decrypt an AES raw key with a private RSA-OAEP Key (Return Base64)
export async function decryptAesKeyWithRsa(
  encryptedAesKeyBase64: string,
  rsaPrivateKeyJwk: string
): Promise<string> {
  const rsaPrivateKey = await importRsaPrivateKey(rsaPrivateKeyJwk);
  const encryptedBuffer = base64ToBuffer(encryptedAesKeyBase64);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: "RSA-OAEP",
    },
    rsaPrivateKey,
    encryptedBuffer
  );

  return bufferToBase64(decryptedBuffer);
}

// Encrypt a message string with an AES-GCM Symmetric Key
export async function encryptMessage(
  plainText: string,
  aesKey: CryptoKey
): Promise<{ ciphertextBase64: string; ivBase64: string }> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plainText);

  // AES-GCM recommends a 12-byte (96-bit) IV
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    aesKey,
    data
  );

  return {
    ciphertextBase64: bufferToBase64(encryptedBuffer),
    ivBase64: bufferToBase64(iv.buffer),
  };
}

// Decrypt a ciphertext string with an AES-GCM Symmetric Key
export async function decryptMessage(
  ciphertextBase64: string,
  ivBase64: string,
  aesKey: CryptoKey
): Promise<string> {
  const encryptedBuffer = base64ToBuffer(ciphertextBase64);
  const ivBuffer = base64ToBuffer(ivBase64);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(ivBuffer),
    },
    aesKey,
    encryptedBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}
