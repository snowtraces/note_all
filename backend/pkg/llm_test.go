package pkg

import (
	"testing"
)

func TestParseSmartJSON(t *testing.T) {
	// 复用 ExtractSummaryAndTags 的 extract struct 验证 title 字段解析
	type extract struct {
		Title   string `json:"title"`
		Summary string `json:"summary"`
		Tags    string `json:"tags"`
	}

	tests := []struct {
		name    string
		input   string
		want    extract
		wantErr bool
	}{
		{
			name:  "完整JSON包含title",
			input: `{"title":"Go并发模式","summary":"介绍了Go语言中goroutine和channel的并发编程模式","tags":"Go,并发,goroutine"}`,
			want: extract{
				Title:   "Go并发模式",
				Summary: "介绍了Go语言中goroutine和channel的并发编程模式",
				Tags:    "Go,并发,goroutine",
			},
		},
		{
			name:  "Markdown代码块包裹",
			input: "```json\n{\"title\":\"设计模式\",\"summary\":\"工厂模式与单例模式的对比分析\",\"tags\":\"设计模式,工厂,单例\"}\n```",
			want: extract{
				Title:   "设计模式",
				Summary: "工厂模式与单例模式的对比分析",
				Tags:    "设计模式,工厂,单例",
			},
		},
		{
			name:  "JSON前有寒暄文本",
			input: "好的，我已经分析完毕，以下是结果：\n{\"title\":\"机器学习入门\",\"summary\":\"监督学习与无监督学习的基本概念\",\"tags\":\"ML,AI\"}",
			want: extract{
				Title:   "机器学习入门",
				Summary: "监督学习与无监督学习的基本概念",
				Tags:    "ML,AI",
			},
		},
		{
			name:  "title为空字符串",
			input: `{"title":"","summary":"一段没有明确标题的内容描述","tags":"杂项"}`,
			want: extract{
				Title:   "",
				Summary: "一段没有明确标题的内容描述",
				Tags:    "杂项",
			},
		},
		{
			name:  "只有title和summary没有tags",
			input: `{"title":"日志规范","summary":"统一日志格式和级别定义"}`,
			want: extract{
				Title:   "日志规范",
				Summary: "统一日志格式和级别定义",
				Tags:    "",
			},
		},
		{
			name:  "内嵌花括号的JSON值",
			input: `{"title":"JSON示例","summary":"{\"key\": \"value\"} 的结构说明","tags":"JSON,格式"}`,
			want: extract{
				Title:   "JSON示例",
				Summary: `{"key": "value"} 的结构说明`,
				Tags:    "JSON,格式",
			},
		},
		{
			name:    "空字符串",
			input:   "",
			wantErr: true,
		},
		{
			name:    "无JSON结构的纯文本",
			input:   "这是一段没有任何JSON结构的普通文本",
			wantErr: true,
		},
		{
			name:    "不完整JSON",
			input:   `{"title":"缺少闭合`,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got extract
			err := parseSmartJSON(tt.input, &got)
			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error but got nil")
				}
				return
			}
			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}
			if got.Title != tt.want.Title {
				t.Errorf("title = %q, want %q", got.Title, tt.want.Title)
			}
			if got.Summary != tt.want.Summary {
				t.Errorf("summary = %q, want %q", got.Summary, tt.want.Summary)
			}
			if got.Tags != tt.want.Tags {
				t.Errorf("tags = %q, want %q", got.Tags, tt.want.Tags)
			}
		})
	}
}

func TestParseSmartJSON_MarkdownWithExtraNewlines(t *testing.T) {
	type extract struct {
		Title string `json:"title"`
		Desc  string `json:"desc"`
	}
	input := "\n\n```json\n{\"title\":\"架构图\",\"desc\":\"系统分层架构的详细描述\"}\n```\n希望对你有帮助！"
	var got extract
	if err := parseSmartJSON(input, &got); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Title != "架构图" {
		t.Errorf("title = %q, want %q", got.Title, "架构图")
	}
}
