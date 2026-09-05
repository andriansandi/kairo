export {};

declare global {
  interface Crypto {
    randomUUID(): string;
  }
  const crypto: Crypto;
}
