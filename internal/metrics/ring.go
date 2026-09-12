package metrics

import (
	"sync"

	"github.com/jacob-bytes/pjx/internal/protocol"
)

// Ring 是单个 agent 的固定容量 1s 环形缓冲。
// 写满后覆盖最旧样本；master 重启即丢，符合「内存层」语义。
type Ring struct {
	mu      sync.RWMutex
	samples []protocol.Sample
	head    int
	size    int
}

// NewRing 建一个环形缓冲。
func NewRing(capacity int) *Ring {
	if capacity < 60 {
		capacity = 60
	}
	return &Ring{samples: make([]protocol.Sample, capacity)}
}

// Add 写入一个样本。
func (r *Ring) Add(sample protocol.Sample) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.samples[r.head] = sample
	r.head = (r.head + 1) % len(r.samples)
	if r.size < len(r.samples) {
		r.size++
	}
}

// Range 返回 ts 不小于 from 的样本，按时间升序。
func (r *Ring) Range(from int64) []protocol.Sample {
	r.mu.RLock()
	defer r.mu.RUnlock()

	out := make([]protocol.Sample, 0, r.size)
	start := (r.head - r.size + len(r.samples)) % len(r.samples)
	for index := 0; index < r.size; index++ {
		sample := r.samples[(start+index)%len(r.samples)]
		if sample.TS >= from {
			out = append(out, sample)
		}
	}
	return out
}

// Len 返回当前样本数。
func (r *Ring) Len() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.size
}

// RingStore 管理所有 agent 的环形缓冲。
type RingStore struct {
	mu       sync.RWMutex
	capacity int
	rings    map[string]*Ring
}

// NewRingStore 建 RingStore。
func NewRingStore(capacity int) *RingStore {
	return &RingStore{capacity: capacity, rings: make(map[string]*Ring)}
}

// Observe 写入一个样本，并按需创建该 agent 的 Ring。
func (s *RingStore) Observe(agentID string, sample protocol.Sample) *Ring {
	s.mu.Lock()
	ring, ok := s.rings[agentID]
	if ok == false {
		ring = NewRing(s.capacity)
		s.rings[agentID] = ring
	}
	s.mu.Unlock()

	ring.Add(sample)
	return ring
}

// Get 取某个 agent 的 Ring。
func (s *RingStore) Get(agentID string) (*Ring, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ring, ok := s.rings[agentID]
	return ring, ok
}

// Agents 返回当前有缓冲的 agent id。
func (s *RingStore) Agents() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]string, 0, len(s.rings))
	for id := range s.rings {
		out = append(out, id)
	}
	return out
}

// Capacity 返回单个 ring 的容量。
func (s *RingStore) Capacity() int {
	return s.capacity
}
