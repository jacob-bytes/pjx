# Agent 线协议

传输：WebSocket（生产走 wss）
消息：JSON-RPC 2.0
鉴权：HTTP 升级时带 `Authorization: Bearer <token>`，也可用 `?token=`（便于调试）
实现：internal/protocol

## 帧格式

- Request：有 `id`，需要应答。id 原样回传，字符串或数字都可
- Notification：无 `id`，不应答。指标上报走这条，避免每帧等待
- Response：`result` 或 `error` 二选一
- 错误码沿用 JSON-RPC：-32700 / -32600 / -32601 / -32602 / -32603

## 方法表

| 方向 | 方法 | 类型 | 说明 |
| --- | --- | --- | --- |
| agent 到 master | agent.hello | request | 协议版本、机器标识、系统信息、capabilities |
| master 到 agent | master.welcome | response | 服务端时间、上报间隔、配置版本 |
| agent 到 master | agent.report | notification | seq + samples，每秒一批 |
| master 到 agent | master.task.dispatch | request | run_id、kind（http/tcp/icmp）、target、timeout_ms |
| agent 到 master | agent.taskResult | response | run_id、ok、latency_ms、message |
| master 到 agent | master.config.update | notification | 预留：配置变更推送 |

## 握手流程

1. agent 连上 WebSocket 后发送 `agent.hello`
2. master 校验 `protocol_version`，登记节点并回 `master.welcome`
3. `welcome.interval_ms` 由 master 决定，agent 按它调整上报频率
4. 握手成功前，master 忽略该连接上的其他消息

## 指标上报

- agent 每秒采集一次，发一条 `agent.report` notification
- `seq` 单调递增：重连补发时 master 可据此去重
- 字节类字段（net_rx / net_tx）是累计计数器，master 按差值算速率
- master 落盘的原始秒级数据只保留在内存，SQLite 存 1m / 1h 聚合

## 任务下发

1. master 生成 run_id，向 agent 发 `master.task.dispatch` request
2. agent 本地执行探活，强制超时
3. agent 用同 id 回 response（TaskResultParams），master 按 run_id 去重
4. 离线节点的任务默认跳过（可配置 queue + TTL）

## 心跳与重连

- 传输层心跳：master 每 15 秒发一次 WebSocket ping
- 应用层存活：master 90 秒没有收到上报就把会话标记为离线并回收
- agent 断线后指数退避重连：1s 起步，上限 1 分钟，带抖动
- 页面隐藏只是前端停表，不影响 agent 连接

## 版本兼容

- protocol.Version 随不兼容改动递增
- 新增可选字段不升版本；删除、改语义、改类型必须升版本
- 新增方法时必须同步本文件与方法名常量
