# 安全与设置持久化

实现：internal/authn + internal/store/token.go + internal/master/auth.go + internal/master/settings.go

## Agent 令牌

- 后台创建令牌（`POST /api/admin/tokens`），明文只返回一次
- 库里只存 SHA-256 哈希（令牌本身 32 字节随机，高熵，不需要慢哈希）
- 列表只返回元信息；撤销是软删除（revoked = 1），保留审计
- agent 通过 `Authorization: Bearer <token>` 或 `?token=` 接入
- 兼容配置里的明文 `agent_tokens` 列表（过渡用）
- **完全没有任何令牌记录时**才允许匿名接入（本地联调）；只要建过令牌，
  即使全部撤销也不会回退到匿名

## 后台密码

- 优先使用 settings 表里的 `admin_password_hash`（Argon2id，PHC 字符串）
- 库里没有哈希时，允许用配置的 `admin_password` 作为一次性引导；
  首次登录成功即写入哈希
- 修改密码：`POST /api/admin/password`，需要旧密码，新密码至少 8 位
- 登录限流：同一 IP 连续失败 5 次锁定 5 分钟
- 库中不存明文密码

## Session

- HMAC-SHA256 签名 cookie（HttpOnly + SameSite=Lax，7 天有效）
- 签名密钥优先取配置 `session_secret`；留空时首次启动随机生成并写入
  settings，重启后 session 依然有效
- 退出登录会清 cookie

## 设置持久化

`GET /api/admin/settings` 返回：site、retention、telegram（token 打码）、
admin_password_set。

`PUT /api/admin/settings` 支持部分更新：

- retention：校验每个保留期写法（1h / 14d / 365d），写库；
  **需要重启 master 完全生效**，响应里会带 restart_required
- telegram：token 留空表示不修改；写库后立刻重建 Notifier 并热替换告警引擎
- site：原样存储，供前台展示使用

启动时先读取持久化设置覆盖配置文件，再构建各子系统。

## 部署注意

- TLS 建议交给反向代理（Caddy / nginx），master 默认只监听 127.0.0.1
- 生产必须配置反向代理的同源策略；当前写操作依赖 SameSite=Lax + JSON 请求
- Webhook 渠道仍是预留；密钥类配置不要写进日志

## 测试

    go test ./internal/authn ./internal/store

覆盖：Argon2id 哈希与校验、错误密码与非法哈希、令牌生成唯一性、
令牌创建 / 查找 / 撤销 / 计数。
