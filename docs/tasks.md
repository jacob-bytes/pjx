# 探活任务

实现：internal/scheduler + internal/store/task.go

## 数据模型

tasks 表：id、name、kind（http / tcp / icmp）、target、interval（秒）、timeout_ms、
retries、scope_type（all / tag / agents）、scope_value、on_offline、enabled、
created_at、updated_at。

task_results 表：run_id 主键、task_id、agent_id、ts、ok、latency_ms、message。
run_id 唯一，所以重连补发或重复上报天然去重。

## 调度流程

1. master 每秒扫描启用任务，间隔到期后解析目标节点
2. 目标范围：全部 / 按标签 / 指定 agent id
3. 离线节点默认 skip（on_offline 已预留 queue + TTL）
4. 通过 master.task.dispatch（JSON-RPC request）下发，等待同 id 响应
5. 超时后按 retries 重试，run_id 追加 -rN；最终失败也写一条 failed 结果，message 记录原因
6. 结果写入 task_results，run_id 冲突忽略

## 标签

- agent 启动参数 -tags prod,hk，hello 上报 Tags
- master 存在 agents.tags（JSON 数组）
- 任务 scope_type=tag 时匹配任一标签

## API

管理端（需登录）：

    GET    /api/admin/tasks          列表 + 24h 统计
    POST   /api/admin/tasks          新建（id 可省略，自动生成）
    GET    /api/admin/tasks/{id}     详情 + 最近 200 条结果
    PUT    /api/admin/tasks/{id}     更新
    DELETE /api/admin/tasks/{id}     删除（含历史结果）

公开（脱敏，不返回 target 等内部信息）：

    GET /api/public/probes           任务级成功率 / 平均 / p95 / 最近执行时间

## 保留

- task_results 默认保留 30 天（retention.task_keep），调度器每 10 分钟清理一次
- tasks 不自动删除

## 测试

    go test ./internal/scheduler ./internal/store

覆盖：标签目标解析、离线跳过、失败重试与 message、任务 CRUD、
run_id 去重、24h 成功率与 p95 统计。
