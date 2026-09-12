# 指标分层与查询

实现：internal/metrics

## 三层

| 层 | 粒度 | 位置 | 默认保留 | 用途 |
| --- | --- | --- | --- | --- |
| 内存层 | 1s | 进程内环形缓冲 | 1 小时（memory_keep） | 详情页实时曲线与放大 |
| metric_1m | 1 分钟 | SQLite | 14 天（one_min_keep） | 主力历史曲线 |
| metric_1h | 1 小时 | SQLite | 365 天（one_hour_keep） | 长期趋势与容量规划 |

- 内存层重启即丢，是刻意的取舍：写入量与查询速度都最优
- 落盘的是聚合值：avg / min / max / count
- 1h 的平均值按 count 加权，避免缺样本的分钟把结果拉偏
- Raw 15s 落盘层（raw_enabled）尚未实装，配置项已预留

## 指标名

窄表存储，一行一个 metric，新增指标不需要迁移：

cpu、load、mem_used、mem_total、swap_used、swap_total、disk_used、
disk_total、net_rx、net_tx、tcp、udp、proc、uptime

net_rx / net_tx 是累计计数器；速率由查询方按差值计算。

## 查询接口

    GET /api/public/series?agent=<id>&metric=<key>&from=<unix>&to=<unix>&points=<n>

- 自动选层：数据在内存保留期内走内存层，在 1m 保留期内走 metric_1m，否则走 metric_1h
- 降采样：点数超过 points 时按步长分组，取加权平均 / 最小 / 最大；
  1m 层最小步长 60 秒，1h 层最小 3600 秒
- 返回：agent_id、metric、tier、step、points，数组元素为 ts / avg / min / max

## 后台任务

- 分钟桶：每个 agent 当前分钟的聚合留在内存；跨分钟或进程退出时写入 metric_1m
- 小时 rollup：每分钟检查一次，把上一个完整小时的 metric_1m 聚合进 metric_1h
- 保留清理：每 10 分钟分批删除超期数据（默认每批 5000 行，最多 20 批）
- 维护时间记录在 settings：last_rollup、last_cleanup

## 测试

    go test ./internal/metrics ./internal/store

覆盖：分钟桶切分、环形缓冲覆盖与范围查询、分层选择与步长、
1m 幂等写入与降采样查询、1h 加权聚合、分批删除、表名白名单。
