package middleware

import (
	"note_all_backend/global"
	"note_all_backend/utils"
	"strings"

	"github.com/gin-gonic/gin"
)

// AuthRequired 鉴权中间件 (JWT 校验)
func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 如果配置中没有设置密码，则不开启鉴权 (方便初期调试)
		if global.Config.SysPassword == "" {
			c.Next()
			return
		}

		// 从 Header 获取 Authorization: Bearer <token>
		authHeader := c.GetHeader("Authorization")
		var tokenString string

		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && parts[0] == "Bearer" {
				tokenString = parts[1]
			}
		}

		// 如果 Header 中没找到，尝试从 Query 参数中寻找 token (用于图片等无法设置 Header 的场景)
		if tokenString == "" {
			tokenString = c.Query("token")
		}

		if tokenString == "" {
			c.JSON(401, gin.H{"error": "Unauthorized: No token provided"})
			c.Abort()
			return
		}

		// 解析 JWT
		claims, err := utils.ParseToken(tokenString)
		if err != nil {
			c.JSON(401, gin.H{"error": "Unauthorized: " + err.Error()})
			c.Abort()
			return
		}

		// 将 UserID 注入 Context，方便后续业务逻辑使用 (虽然目前是单人系统，但架构上对齐)
		c.Set("user_id", claims.UserID)
		c.Next()
	}
}
