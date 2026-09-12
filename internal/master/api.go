package master

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jacob-bytes/pjx/internal/config"
	"github.com/jacob-bytes/pjx/internal/metrics"
	"github.com/jacob-bytes/pjx/internal/protocol"
	"github.com/jacob-bytes/pjx/internal/store"
)

// writeJSON 是所有 API 的统一出口。
func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":      "ok",
		"protocol":    protocol.Version,
		"server_time": time.Now().Unix(),
		"agents":      s.hub.Count(),
	})
}

// handlePublicOverview 是公网状态页的首屏数据（脱敏白名单见 docs/public-page.md）。
func (s *Server) handlePublicOverview(w http.ResponseWriter, r *http.Request) {
	nodes := s.hub.Snapshot()

	online, warn, crit := 0, 0, 0
	var cpuSum, rxSum, txSum float64
	for _, node := range nodes {
		if node.Status != "off" {
			online++
		}
		switch node.Status {
		case "warn":
			warn++
		case "crit":
			crit++
		}
		cpuSum += node.CPU
		rxSum += node.Rx
		txSum += node.Tx
	}

	avgCPU := 0.0
	if len(nodes) > 0 {
		avgCPU = cpuSum / float64(len(nodes))
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"server_time": time.Now().Unix(),
		"total":       len(nodes),
		"online":      online,
		"warn":        warn,
		"crit":        crit,
		"offline":     len(nodes) - online,
		"avg_cpu":     round2(avgCPU),
		"total_rx":    round2(rxSum),
		"total_tx":    round2(txSum),
		"nodes":       nodes,
	})
}

func (s *Server) handleAdminState(w http.ResponseWriter, r *http.Request) {
	agents, err := s.store.ListAgents(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"server_time": time.Now().Unix(),
		"online":      s.hub.Count(),
		"total":       len(agents),
		"agents":      agents,
		"retention":   s.cfg.Retention,
		"telegram": map[string]any{
			"enabled": s.cfg.Telegram.Enabled,
		},
	})
}

func (s *Server) handleAdminAgents(w http.ResponseWriter, r *http.Request) {
	agents, err := s.store.ListAgents(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"agents": agents,
		"nodes":  s.hub.Snapshot(),
	})
}

// handlePublicSeries 查询单个节点的历史序列。
// 参数：agent、metric、from、to（unix 秒）、points（默认 180）。
func (s *Server) handlePublicSeries(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	agentID := query.Get("agent")
	metric := query.Get("metric")
	if agentID == "" || metric == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "agent and metric are required"})
		return
	}

	baseMetric, mode, message := resolveSeriesSpec(metric, query.Get("view"), query.Get("rate"))
	if message != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": message})
		return
	}

	now := time.Now()
	to := parseInt64(query.Get("to"), now.Unix())
	from := parseInt64(query.Get("from"), to-3600)
	if from >= to {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "from must be earlier than to"})
		return
	}

	points := int(parseInt64(query.Get("points"), 180))
	if points < 2 {
		points = 2
	}
	if points > 2000 {
		points = 2000
	}

	memoryKeep := config.ParseDuration(s.cfg.Retention.MemoryKeep, time.Hour)
	oneMinKeep := config.ParseDuration(s.cfg.Retention.OneMinKeep, 14*24*time.Hour)
	tier := metrics.ChooseTier(now, time.Unix(from, 0), memoryKeep, oneMinKeep)

	if tier == metrics.TierMemory {
		ring, ok := s.pipeline.Rings().Get(agentID)
		if ok == false {
			writeJSON(w, http.StatusOK, map[string]any{
				"agent_id": agentID, "metric": metric, "view": mode, "tier": tier,
				"step": 1, "points": []metrics.Point{},
			})
			return
		}
		samples := ring.Range(from)
		var result []metrics.Point
		switch mode {
		case "percent":
			result = metrics.DownsampleValues(metrics.PercentValues(samples, baseMetric), from, to, points)
		case "rate":
			result = metrics.DownsampleValues(metrics.RateValues(samples, baseMetric), from, to, points)
		default:
			result = metrics.DownsampleValues(metrics.ValuePointsFromSamples(samples, baseMetric), from, to, points)
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"agent_id": agentID, "metric": metric, "view": mode, "tier": tier,
			"step": 1, "points": result,
		})
		return
	}

	floor := int64(60)
	if tier == metrics.Tier1h {
		floor = 3600
	}
	step := metrics.StepSeconds(from, to, points, floor)

	var result []metrics.Point
	var err error
	switch mode {
	case "percent":
		used, usedErr := s.store.QuerySeries(r.Context(), string(tier), agentID, baseMetric+"_used", from, to, step)
		total, totalErr := s.store.QuerySeries(r.Context(), string(tier), agentID, baseMetric+"_total", from, to, step)
		if usedErr != nil {
			err = usedErr
		} else if totalErr != nil {
			err = totalErr
		} else {
			result = metrics.PercentPoints(used, total)
		}
	case "rate":
		raw, rawErr := s.store.QuerySeries(r.Context(), string(tier), agentID, baseMetric, from, to, step)
		if rawErr != nil {
			err = rawErr
		} else {
			result = metrics.ToRate(raw)
		}
	default:
		result, err = s.store.QuerySeries(r.Context(), string(tier), agentID, baseMetric, from, to, step)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"agent_id": agentID, "metric": metric, "view": mode, "tier": tier,
		"step": step, "points": result,
	})
}

func resolveSeriesSpec(metric, view, rate string) (string, string, string) {
	switch metric {
	case "mem", "disk", "swap":
		if view == "raw" {
			return metric + "_used", "raw", ""
		}
		return metric, "percent", ""
	case metrics.KeyNetRx, metrics.KeyNetTx:
		if rate == "0" || view == "raw" {
			return metric, "raw", ""
		}
		return metric, "rate", ""
	}
	if metrics.Known(metric) == false {
		return "", "", "unsupported metric: " + metric
	}
	return metric, "raw", ""
}

func parseInt64(value string, fallback int64) int64 {
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return fallback
	}
	return parsed
}

type taskPayload struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Kind       string `json:"kind"`
	Target     string `json:"target"`
	Interval   int64  `json:"interval"`
	TimeoutMS  int64  `json:"timeout_ms"`
	Retries    int64  `json:"retries"`
	ScopeType  string `json:"scope_type"`
	ScopeValue string `json:"scope_value"`
	OnOffline  string `json:"on_offline"`
	Enabled    *bool  `json:"enabled"`
}

func (p taskPayload) toTask() store.Task {
	enabled := true
	if p.Enabled != nil {
		enabled = *p.Enabled
	}
	return store.Task{
		ID:         p.ID,
		Name:       p.Name,
		Kind:       p.Kind,
		Target:     p.Target,
		Interval:   p.Interval,
		TimeoutMS:  p.TimeoutMS,
		Retries:    p.Retries,
		ScopeType:  p.ScopeType,
		ScopeValue: p.ScopeValue,
		OnOffline:  p.OnOffline,
		Enabled:    enabled,
	}
}

// handleAdminTasks 支持 GET（列表 + 24h 统计）与 POST（新建）。
func (s *Server) handleAdminTasks(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		tasks, err := s.store.ListTasks(r.Context())
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		since := time.Now().Add(-24 * time.Hour)
		items := make([]map[string]any, 0, len(tasks))
		for _, task := range tasks {
			stats, err := s.store.TaskStats(r.Context(), task.ID, since)
			if err != nil {
				stats = store.TaskStats{}
			}
			items = append(items, map[string]any{"task": task, "stats": stats})
		}
		writeJSON(w, http.StatusOK, map[string]any{"tasks": items})
	case http.MethodPost:
		var payload taskPayload
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		task := payload.toTask()
		if task.ID == "" {
			task.ID = fmt.Sprintf("task-%d", time.Now().UnixNano())
		}
		if err := validateTask(task); err != "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err})
			return
		}
		if err := s.store.UpsertTask(r.Context(), task); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		_ = s.scheduler.Reload(r.Context())
		if saved, err := s.store.GetTask(r.Context(), task.ID); err == nil {
			task = saved
		}
		writeJSON(w, http.StatusOK, map[string]any{"task": task})
	default:
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleAdminTaskByID 支持 GET（详情 + 最近结果）、PUT（更新）、DELETE（删除）。
func (s *Server) handleAdminTaskByID(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/admin/tasks/")
	if strings.HasSuffix(rest, "/run") {
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", "POST")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		id := strings.TrimSuffix(rest, "/run")
		if id == "" || strings.Contains(id, "/") {
			http.NotFound(w, r)
			return
		}
		dispatched, err := s.scheduler.RunTaskNow(r.Context(), id)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "dispatched": dispatched})
		return
	}

	id := rest
	if id == "" || strings.Contains(id, "/") {
		http.NotFound(w, r)
		return
	}

	switch r.Method {
	case http.MethodGet:
		task, err := s.store.GetTask(r.Context(), id)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "task not found"})
			return
		}
		results, err := s.store.ListTaskResults(r.Context(), id, time.Now().Add(-24*time.Hour), 200)
		if err != nil {
			results = nil
		}
		writeJSON(w, http.StatusOK, map[string]any{"task": task, "results": results})
	case http.MethodPut:
		var payload taskPayload
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		task := payload.toTask()
		task.ID = id
		if err := validateTask(task); err != "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err})
			return
		}
		if err := s.store.UpsertTask(r.Context(), task); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		_ = s.scheduler.Reload(r.Context())
		if saved, err := s.store.GetTask(r.Context(), task.ID); err == nil {
			task = saved
		}
		writeJSON(w, http.StatusOK, map[string]any{"task": task})
	case http.MethodDelete:
		if err := s.store.DeleteTask(r.Context(), id); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		_ = s.scheduler.Reload(r.Context())
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	default:
		w.Header().Set("Allow", "GET, PUT, DELETE")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func validateTask(task store.Task) string {
	if task.Name == "" {
		return "name is required"
	}
	switch task.Kind {
	case "http", "tcp", "icmp":
	default:
		return "kind must be http, tcp or icmp"
	}
	if task.Target == "" {
		return "target is required"
	}
	if task.Interval < 10 {
		return "interval must be at least 10 seconds"
	}
	return ""
}

// handlePublicProbes 返回公开的探测汇总，不包含目标地址等内部信息。
func (s *Server) handlePublicProbes(w http.ResponseWriter, r *http.Request) {
	tasks, err := s.store.ListTasks(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	since := time.Now().Add(-24 * time.Hour)
	items := make([]map[string]any, 0, len(tasks))
	for _, task := range tasks {
		if task.Enabled == false {
			continue
		}
		stats, err := s.store.TaskStats(r.Context(), task.ID, since)
		if err != nil {
			stats = store.TaskStats{}
		}
		items = append(items, map[string]any{
			"id":           task.ID,
			"name":         task.Name,
			"kind":         task.Kind,
			"interval":     task.Interval,
			"total":        stats.Total,
			"success_rate": round2(stats.SuccessRate),
			"avg_ms":       round2(stats.AvgMS),
			"p95_ms":       round2(stats.P95MS),
			"last_ts":      stats.LastTS,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"server_time": time.Now().Unix(),
		"probes":      items,
	})
}

type alertRulePayload struct {
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	Kind            string  `json:"kind"`
	Metric          string  `json:"metric"`
	Operator        string  `json:"operator"`
	Threshold       float64 `json:"threshold"`
	ForSeconds      int64   `json:"for_seconds"`
	Severity        string  `json:"severity"`
	CooldownSeconds int64   `json:"cooldown_seconds"`
	Target          string  `json:"target"`
	Channel         string  `json:"channel"`
	Enabled         *bool   `json:"enabled"`
}

func (p alertRulePayload) toRule() store.AlertRule {
	enabled := true
	if p.Enabled != nil {
		enabled = *p.Enabled
	}
	return store.AlertRule{
		ID:              p.ID,
		Name:            p.Name,
		Kind:            p.Kind,
		Metric:          p.Metric,
		Operator:        p.Operator,
		Threshold:       p.Threshold,
		ForSeconds:      p.ForSeconds,
		Severity:        p.Severity,
		CooldownSeconds: p.CooldownSeconds,
		Target:          p.Target,
		Channel:         p.Channel,
		Enabled:         enabled,
	}
}

func validateAlertRule(rule store.AlertRule) string {
	if rule.Name == "" {
		return "name is required"
	}
	switch rule.Kind {
	case "metric", "offline", "probe":
	default:
		return "kind must be metric, offline or probe"
	}
	switch rule.Severity {
	case "info", "warn", "crit":
	default:
		return "severity must be info, warn or crit"
	}
	switch rule.Operator {
	case "gt", "lt":
	default:
		return "operator must be gt or lt"
	}
	if rule.Kind == "metric" {
		switch rule.Metric {
		case "cpu", "load", "mem", "disk", "swap", "tcp", "udp", "proc":
		default:
			return "unsupported metric"
		}
	}
	return ""
}

// handleAdminAlertRules 支持 GET（规则 + 当前 firing）与 POST（新建/更新）。
func (s *Server) handleAdminAlertRules(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		rules, err := s.store.ListAlertRules(r.Context())
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		firing, _ := s.store.ListAlertEvents(r.Context(), "firing", 200)
		writeJSON(w, http.StatusOK, map[string]any{"rules": rules, "firing": firing})
	case http.MethodPost:
		var payload alertRulePayload
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		rule := payload.toRule()
		if rule.ID == "" {
			rule.ID = fmt.Sprintf("rule-%d", time.Now().UnixNano())
		}
		if message := validateAlertRule(rule); message != "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": message})
			return
		}
		if err := s.store.UpsertAlertRule(r.Context(), rule); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		_ = s.alerts.Reload(r.Context())
		if saved, err := s.store.GetAlertRule(r.Context(), rule.ID); err == nil {
			rule = saved
		}
		writeJSON(w, http.StatusOK, map[string]any{"rule": rule})
	default:
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleAdminAlertRuleByID 支持 GET / PUT / DELETE。
func (s *Server) handleAdminAlertRuleByID(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/admin/alert-rules/")
	if id == "" || strings.Contains(id, "/") {
		http.NotFound(w, r)
		return
	}

	switch r.Method {
	case http.MethodGet:
		rule, err := s.store.GetAlertRule(r.Context(), id)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "rule not found"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"rule": rule})
	case http.MethodPut:
		var payload alertRulePayload
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		rule := payload.toRule()
		rule.ID = id
		if message := validateAlertRule(rule); message != "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": message})
			return
		}
		if err := s.store.UpsertAlertRule(r.Context(), rule); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		_ = s.alerts.Reload(r.Context())
		if saved, err := s.store.GetAlertRule(r.Context(), rule.ID); err == nil {
			rule = saved
		}
		writeJSON(w, http.StatusOK, map[string]any{"rule": rule})
	case http.MethodDelete:
		if err := s.store.DeleteAlertRule(r.Context(), id); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		_ = s.alerts.Reload(r.Context())
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	default:
		w.Header().Set("Allow", "GET, PUT, DELETE")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleAdminAlertEvents 返回事件列表，支持 state 与 limit。
func (s *Server) handleAdminAlertEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	state := r.URL.Query().Get("state")
	limit := int(parseInt64(r.URL.Query().Get("limit"), 100))
	events, err := s.store.ListAlertEvents(r.Context(), state, limit)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": events})
}

// handleAdminNotifyTest 发送一条测试通知。
func (s *Server) handleAdminNotifyTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := s.alerts.TestNotify(r.Context()); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handlePublicProbeSeries 处理 /api/public/probes/{id}/series。
// 参数：agent、metric（latency|loss）、from、to、points。
func (s *Server) handlePublicProbeSeries(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/public/probes/")
	parts := strings.Split(rest, "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] != "series" {
		http.NotFound(w, r)
		return
	}
	taskID := parts[0]

	query := r.URL.Query()
	agentID := query.Get("agent")
	if agentID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "agent is required"})
		return
	}
	metric := query.Get("metric")
	if metric == "" {
		metric = "latency"
	}
	if metric != "latency" && metric != "loss" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "metric must be latency or loss"})
		return
	}

	now := time.Now()
	to := parseInt64(query.Get("to"), now.Unix())
	from := parseInt64(query.Get("from"), to-24*3600)
	if from >= to {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "from must be earlier than to"})
		return
	}
	points := int(parseInt64(query.Get("points"), 180))
	if points < 2 {
		points = 2
	}
	if points > 2000 {
		points = 2000
	}

	step := metrics.StepSeconds(from, to, points, 10)
	result, err := s.store.QueryTaskSeries(r.Context(), taskID, agentID, metric, from, to, step)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"task_id":  taskID,
		"agent_id": agentID,
		"metric":   metric,
		"step":     step,
		"points":   result,
	})
}

// handlePublicUptime 处理 /api/public/agents/{id}/uptime?days=30。
func (s *Server) handlePublicUptime(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/public/agents/")
	parts := strings.Split(rest, "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] != "uptime" {
		http.NotFound(w, r)
		return
	}
	agentID := parts[0]
	days := int(parseInt64(r.URL.Query().Get("days"), 30))
	result, err := s.store.QueryUptimeDays(r.Context(), agentID, days)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"agent_id": agentID,
		"days":     result,
	})
}

// handleAdminAgentByID 支持 GET / PUT / DELETE。
func (s *Server) handleAdminAgentByID(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/admin/agents/")
	if id == "" || strings.Contains(id, "/") {
		http.NotFound(w, r)
		return
	}

	findAgent := func() (store.Agent, bool) {
		agents, err := s.store.ListAgents(r.Context())
		if err != nil {
			return store.Agent{}, false
		}
		for _, agent := range agents {
			if agent.ID == id {
				return agent, true
			}
		}
		return store.Agent{}, false
	}

	switch r.Method {
	case http.MethodGet:
		agent, ok := findAgent()
		if ok == false {
			http.NotFound(w, r)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"agent": agent})
	case http.MethodPut:
		agent, ok := findAgent()
		if ok == false {
			http.NotFound(w, r)
			return
		}
		var body struct {
			Alias  *string   `json:"alias"`
			Public *bool     `json:"public"`
			Tags   *[]string `json:"tags"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		if body.Alias != nil {
			agent.Alias = *body.Alias
		}
		if body.Public != nil {
			agent.Public = *body.Public
		}
		if body.Tags != nil {
			agent.Tags = *body.Tags
		}
		if err := s.store.UpdateAgent(r.Context(), agent.ID, agent.Alias, agent.Public, agent.Tags); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"agent": agent})
	case http.MethodDelete:
		if err := s.store.DeleteAgent(r.Context(), id); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		s.hub.Remove(id)
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	default:
		w.Header().Set("Allow", "GET, PUT, DELETE")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
