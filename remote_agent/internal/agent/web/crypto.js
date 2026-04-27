/**
 * 基于 node-forge 的端到端加密封装
 * 兼容性高：支持手机端非 HTTPS 环境，完美匹配 Go 端实现
 */
const AgentCrypto = {
    SALT: "note-all-remote-salt",
    ITERATIONS: 100000,

    async deriveKey(passphrase) {
        // 使用 PBKDF2 派生密钥 (SHA256, 32 bytes)
        const derivedKey = forge.pkcs5.pbkdf2(
            passphrase,
            this.SALT,
            this.ITERATIONS,
            32,
            forge.md.sha256.create()
        );
        return derivedKey;
    },

    async decrypt(packet, rawKey) {
        // packet 是 Uint8Array [nonce(12) + ciphertext + tag(16)]
        const nonce = forge.util.createBuffer(packet.slice(0, 12));
        
        // Go 的 GCM 输出通常是 [nonce][ciphertext][tag]
        // forge 需要 ciphertext 和 tag 分开
        const fullCiphertext = packet.slice(12);
        const tag = fullCiphertext.slice(fullCiphertext.length - 16);
        const ciphertext = fullCiphertext.slice(0, fullCiphertext.length - 16);

        const decipher = forge.cipher.createDecipher('AES-GCM', rawKey);
        decipher.start({
            iv: nonce,
            tagLength: 128,
            tag: forge.util.createBuffer(tag)
        });
        decipher.update(forge.util.createBuffer(ciphertext));
        
        if (!decipher.finish()) {
            throw new Error("解密校验失败: Auth Tag Mismatch");
        }
        
        return forge.util.decodeUtf8(decipher.output.getBytes());
    },

    async encrypt(text, rawKey) {
        const nonceBytes = forge.random.getBytesSync(12);
        const cipher = forge.cipher.createCipher('AES-GCM', rawKey);
        cipher.start({
            iv: nonceBytes,
            tagLength: 128
        });
        cipher.update(forge.util.createBuffer(forge.util.encodeUtf8(text)));
        cipher.finish();

        const ciphertext = cipher.output.getBytes();
        const tag = cipher.mode.tag.getBytes();

        const result = new Uint8Array(12 + ciphertext.length + tag.length);
        result.set(this.stringToUint8(nonceBytes), 0);
        result.set(this.stringToUint8(ciphertext), 12);
        result.set(this.stringToUint8(tag), 12 + ciphertext.length);
        return result;
    },

    stringToUint8(str) {
        const arr = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) {
            arr[i] = str.charCodeAt(i);
        }
        return arr;
    }
};
