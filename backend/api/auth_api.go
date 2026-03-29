package api

import (
	"net/http"
	"note_all_backend/global"
	"note_all_backend/utils"

	"github.com/gin-gonic/gin"
)

type AuthApi struct{}

// Login 登录接口
func (a *AuthApi) Login(c *gin.Context) {
	var input struct {
		Password string `json:"password"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	// 密码校验
	if input.Password != global.Config.SysPassword {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid password"})
		return
	}

	// 生成 JWT Token
	token, err := utils.GenerateToken("admin") // 这里 admin 仅做逻辑占位，后续可拓展多用户
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token":   token,
		"message": "Login successful",
	})
}

// Check 检查 token 有效性
func (a *AuthApi) Check(c *gin.Context) {
	// 这里的 check 也可以复用 middleware
	// 但如果只是为了让前端知道 token 对不对，middleware 已经拦截了
	c.JSON(http.StatusOK, gin.H{"message": "Authenticated"})
}
