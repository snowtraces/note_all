package middleware

import (
	"note_all_backend/global"
	"strings"

	"github.com/gin-gonic/gin"
)

// AuthRequired 鉴权中间件 (简单令牌校验)
func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 如果配置中没有设置密码，则不开启鉴权 (方便初期调试)
		if global.Config.SysPassword == "" {
			c.Next()
			return
		}

		// 从 Header 获取 Authorization: Bearer <token>
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(401, gin.H{"error": "Unauthorized: No token provided"})
			c.Abort()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if !(len(parts) == 2 && parts[0] == "Bearer") {
			c.JSON(401, gin.H{"error": "Unauthorized: Invalid token format"})
			c.Abort()
			return
		}

		// 在这个最简版本中，我们直接校验 token 是否等于 sys_password
		// 后续如果有需要可以换成 JWT
		if parts[1] != global.Config.SysPassword {
			c.JSON(401, gin.H{"error": "Unauthorized: Invalid token"})
			c.Abort()
			return
		}

		c.Next()
	}
}
