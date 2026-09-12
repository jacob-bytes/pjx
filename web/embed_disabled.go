//go:build !embedweb

// Package web 提供前端产物的可选嵌入。
// 不带 embedweb tag 时返回 nil，由 master 回退到磁盘目录。
package web

import "io/fs"

// FS 在未启用 embedweb 时返回 nil。
func FS() fs.FS {
	return nil
}
