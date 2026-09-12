# 告警

实现：internal/alerts + internal/notify + internal/store/alert.go

## 规则类型

| kind | 判定 | 对象 |
| --- | --- | --- |
| metric | 采样指标与阈值比较（gt / lt） | 每个 agent |
| offline | 最后上报距今超过 for_seconds | 每个 agent |
| probe | 探活连续失败次数达到 threshold | task:agent |

metric 支持 cpu、load、mem、disk、swap、tcp、udp、proc。
probe 规则可用 target 限定某个 task id，留空表示全部任务。

## 状态机与通知

- 事件 id 为 ruleID:target，rule + target 唯一
- metric 规则需要连续满足 for_seconds 才进入 firing；offline / probe 的阈值本身已包含时长或次数，满足即触发
- **只在状态跃迁时通知**：首次 firing 与恢复 resolved 各一条
- 冷却期（cooldown_seconds）内 re-fire 只更新事件状态，不重复发送
- 事件写库；master 重启后从 DB 恢复 firing 状态，不会重复通知

## 通知渠道

- v1 实装 Telegram：HTML 格式、群组 Topic 支持
- 全局限速：默认最小发送间隔 50ms（约 20 msg/s）
- 429 处理：读取 retry_after 退避重试，最多 3 次，单次上限 30 秒
- 未配置渠道时引擎只记录事件；`POST /api/admin/notify/test` 返回明确错误
- Webhook 在 Notifier 接口层预留

## API（均需登录）

    GET    /api/admin/alert-rules       规则列表 + 当前 firing
    POST   /api/admin/alert-rules       新建 / 更新规则
    GET    /api/admin/alert-rules/{id}  规则详情
    PUT    /api/admin/alert-rules/{id}  更新
    DELETE /api/admin/alert-rules/{id}  删除
    GET    /api/admin/alert-events      事件列表（state、limit）
    POST   /api/admin/notify/test       发送测试通知

## 保留

- alert_events 默认保留 90 天（retention.alert_keep），引擎每 10 分钟清理
- alert_rules 不自动删除

## 测试

    go test ./internal/alerts

覆盖：metric 规则的 for 时长与恢复、probe 连续失败计数、
offline 检查、通知只发生在状态跃迁。
