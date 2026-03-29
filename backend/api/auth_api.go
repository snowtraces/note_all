package api

import (
	"net/http"
	"note_all_backend/global"

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

	// 简单的密码校验
	if input.Password != global.Config.SysPassword {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid password"})
		return
	}

	// 这里的 token 我们在这个最简版本中直接返回密码字符串 (或者哈希一个随机序列也行)
	// 在 Bearer 规范下直接使用密码作为 token
	c.JSON(http.StatusOK, gin.H{
		"token": global.Config.SysPassword,
		"message": "Login successful",
	})
}

// Check 检查 token 有效性
func (a *AuthApi) Check(c *gin.Context) {
	// 这里的 check 也可以复用 middleware
	// 但如果只是为了让前端知道 token 对不对，middleware 已经拦截了
	c.JSON(http.StatusOK, gin.H{"message": "Authenticated"})
}
