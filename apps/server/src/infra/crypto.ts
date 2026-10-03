import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export interface Cipher {
  encrypt(plain: string): string;
  decrypt(payload: string): string;
}

/** AES-256-GCM con una clave derivada del secreto de la aplicación. */
export function createCipher(secret: string): Cipher {
  const key = createHash("sha256").update(`vhub:${secret}`).digest();
  return {
    encrypt(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
    },
    decrypt(payload) {
      const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64"));
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    },
  };
}
