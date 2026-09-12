package metrics

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/jacob-bytes/pjx/internal/protocol"
)

// Store 是管道需要的持久化能力，由 internal/store 实现。
type Store interface {
	UpsertMetrics(ctx context.Context, agentID string, bucket int64, values map[string]Aggregate) error
	AggregateHour(ctx context.Context, hourStart, hourEnd int64) error
	DeleteMetricsBefore(ctx context.Context, table string, cutoff int64, batch int) (int64, error)
	SetSetting(ctx context.Context, key, value string) error
}

// Options 控制各层保留期与工作频率。
type Options struct {
	MemoryPoints int
	OneMinKeep   time.Duration
	OneHourKeep  time.Duration
	FlushEvery   time.Duration
	CleanupEvery time.Duration
	CleanupBatch int
}

// Pipeline 把上报样本聚合到 1m，并做 1h rollup 与保留清理。
type Pipeline struct {
	store Store
	log   *slog.Logger
	rings *RingStore
	opts  Options

	mu      sync.Mutex
	buckets map[string]*agentBucket
}

type agentBucket struct {
	start int64
	aggs  map[string]*Aggregate
}

// NewPipeline 构造管道。
func NewPipeline(store Store, log *slog.Logger, opts Options) *Pipeline {
	if opts.MemoryPoints < 60 {
		opts.MemoryPoints = 3600
	}
	if opts.FlushEvery <= 0 {
		opts.FlushEvery = 5 * time.Second
	}
	if opts.CleanupEvery <= 0 {
		opts.CleanupEvery = 10 * time.Minute
	}
	if opts.CleanupBatch <= 0 {
		opts.CleanupBatch = 5000
	}
	return &Pipeline{
		store:   store,
		log:     log,
		rings:   NewRingStore(opts.MemoryPoints),
		opts:    opts,
		buckets: make(map[string]*agentBucket),
	}
}

// Rings 暴露内存层，查询与快照可以复用。
func (p *Pipeline) Rings() *RingStore {
	return p.rings
}

// Observe 写入一次采样：内存层立即写，1m 聚合进入当前分钟桶。
func (p *Pipeline) Observe(ctx context.Context, agentID string, sample protocol.Sample) {
	p.rings.Observe(agentID, sample)

	minute := sample.TS - sample.TS%60
	values := Values(sample)

	p.mu.Lock()
	defer p.mu.Unlock()

	bucket, ok := p.buckets[agentID]
	if ok == false || bucket.start != minute {
		if ok {
			p.flushLocked(ctx, agentID, bucket)
		}
		bucket = &agentBucket{
			start: minute,
			aggs:  make(map[string]*Aggregate, len(values)),
		}
		p.buckets[agentID] = bucket
	}

	for key, value := range values {
		agg, exists := bucket.aggs[key]
		if exists == false {
			agg = &Aggregate{}
			bucket.aggs[key] = agg
		}
		agg.Add(value)
	}
}

// FlushBefore 把开始时间早于 cutoff 的桶落盘，返回落盘桶数。
func (p *Pipeline) FlushBefore(ctx context.Context, cutoff int64) int {
	p.mu.Lock()
	defer p.mu.Unlock()

	count := 0
	for agentID, bucket := range p.buckets {
		if bucket.start < cutoff {
			p.flushLocked(ctx, agentID, bucket)
			delete(p.buckets, agentID)
			count++
		}
	}
	return count
}

// FlushAll 落盘所有桶，退出前调用。
func (p *Pipeline) FlushAll(ctx context.Context) int {
	p.mu.Lock()
	defer p.mu.Unlock()

	count := 0
	for agentID, bucket := range p.buckets {
		p.flushLocked(ctx, agentID, bucket)
		delete(p.buckets, agentID)
		count++
	}
	return count
}

func (p *Pipeline) flushLocked(ctx context.Context, agentID string, bucket *agentBucket) {
	if len(bucket.aggs) == 0 {
		return
	}
	values := make(map[string]Aggregate, len(bucket.aggs))
	for key, agg := range bucket.aggs {
		values[key] = *agg
	}
	if err := p.store.UpsertMetrics(ctx, agentID, bucket.start, values); err != nil {
		p.log.Warn("flush minute bucket", "agent", agentID, "bucket", bucket.start, "err", err)
	}
}

// Run 启动后台工作：分钟桶落盘、小时 rollup、保留清理。
func (p *Pipeline) Run(ctx context.Context) {
	flushTicker := time.NewTicker(p.opts.FlushEvery)
	defer flushTicker.Stop()
	hourTicker := time.NewTicker(time.Minute)
	defer hourTicker.Stop()
	cleanupTicker := time.NewTicker(p.opts.CleanupEvery)
	defer cleanupTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			p.FlushAll(context.Background())
			return
		case <-flushTicker.C:
			p.FlushBefore(ctx, time.Now().Unix()-60)
		case <-hourTicker.C:
			p.rollupHour(ctx)
		case <-cleanupTicker.C:
			p.cleanup(ctx)
		}
	}
}

func (p *Pipeline) rollupHour(ctx context.Context) {
	end := time.Now().UTC().Truncate(time.Hour)
	start := end.Add(-time.Hour)
	if err := p.store.AggregateHour(ctx, start.Unix(), end.Unix()); err != nil {
		p.log.Warn("aggregate hour", "start", start.Unix(), "err", err)
		return
	}
	_ = p.store.SetSetting(ctx, "last_rollup", time.Now().UTC().Format(time.RFC3339))
}

func (p *Pipeline) cleanup(ctx context.Context) {
	now := time.Now().Unix()

	if p.opts.OneMinKeep > 0 {
		cutoff := now - int64(p.opts.OneMinKeep.Seconds())
		deleted, err := p.deleteAll(ctx, "metric_1m", cutoff)
		if err != nil {
			p.log.Warn("cleanup metric_1m", "err", err)
		} else {
			p.log.Info("cleanup metric_1m", "deleted", deleted)
		}
	}

	if p.opts.OneHourKeep > 0 {
		cutoff := now - int64(p.opts.OneHourKeep.Seconds())
		deleted, err := p.deleteAll(ctx, "metric_1h", cutoff)
		if err != nil {
			p.log.Warn("cleanup metric_1h", "err", err)
		} else {
			p.log.Info("cleanup metric_1h", "deleted", deleted)
		}
	}

	_ = p.store.SetSetting(ctx, "last_cleanup", time.Now().UTC().Format(time.RFC3339))
}

func (p *Pipeline) deleteAll(ctx context.Context, table string, cutoff int64) (int64, error) {
	var total int64
	for round := 0; round < 20; round++ {
		deleted, err := p.store.DeleteMetricsBefore(ctx, table, cutoff, p.opts.CleanupBatch)
		if err != nil {
			return total, err
		}
		total += deleted
		if deleted < int64(p.opts.CleanupBatch) {
			break
		}
	}
	return total, nil
}
