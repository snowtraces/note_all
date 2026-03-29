package utils

import (
	"errors"
	"note_all_backend/global"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// StandardClaims 自定义 JWT Payload
type StandardClaims struct {
	UserID string `json:"user_id"`
	jwt.RegisteredClaims
}

// GenerateToken 生成 JWT 令牌 (有效时长 30 天，针对个人单机系统设长一点)
func GenerateToken(userID string) (string, error) {
	secret := []byte(global.Config.JwtSecret)
	if len(secret) == 0 {
		return "", errors.New("jwt_secret not configured")
	}

	claims := StandardClaims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(30 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "NoteAll",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(secret)
}

// ParseToken 解析并校验 JWT 令牌
func ParseToken(tokenString string) (*StandardClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &StandardClaims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte(global.Config.JwtSecret), nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*StandardClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}
