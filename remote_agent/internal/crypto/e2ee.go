package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"io"

	"golang.org/x/crypto/pbkdf2"
)

const (
	KeySize   = 32
	NonceSize = 12 
)

func DeriveKey(passphrase string, salt []byte) *[KeySize]byte {
	if len(salt) == 0 {
		salt = []byte("note-all-remote-salt")
	}
	derived := pbkdf2.Key([]byte(passphrase), salt, 100000, KeySize, sha256.New)
	var key [KeySize]byte
	copy(key[:], derived)
	return &key
}

func Encrypt(message []byte, key *[KeySize]byte) ([]byte, error) {
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(nonce, nonce, message, nil), nil
}

func Decrypt(packet []byte, key *[KeySize]byte) ([]byte, error) {
	if len(packet) < NonceSize {
		return nil, errors.New("packet too short")
	}
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := packet[:NonceSize]
	ciphertext := packet[NonceSize:]
	return gcm.Open(nil, nonce, ciphertext, nil)
}
