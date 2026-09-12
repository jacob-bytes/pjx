//go:build embedweb

// Package web 提供前端产物的可选嵌入。
//
// 默认构建不包含前端，master 回退到 -web-dir 磁盘目录；
// 发布构建先 npm run build，再用 -tags embedweb 编译成单二进制。
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var assets embed.FS

// FS 返回前端产物子文件系统；嵌入数据缺失时返回 nil。
func FS() fs.FS {
	sub, err := fs.Sub(assets, "dist")
	if err != nil {
		return nil
	}
	return sub
}
