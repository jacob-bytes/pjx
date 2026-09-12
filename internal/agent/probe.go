package agent

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/jacob-bytes/pjx/internal/protocol"
)

// RunProbe 执行一次探活。ICMP 需要 CAP_NET_RAW，暂时降级为 TCP ping。
func RunProbe(ctx context.Context, spec protocol.TaskSpec) protocol.TaskResultParams {
	result := protocol.TaskResultParams{RunID: spec.RunID}
	timeout := time.Duration(spec.Timeout) * time.Millisecond
	if timeout <= 0 {
		timeout = 5 * time.Second
	}

	probeCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	start := time.Now()
	var err error
	switch spec.Kind {
	case "http":
		err = probeHTTP(probeCtx, spec.Target)
	case "tcp", "icmp":
		err = probeTCP(probeCtx, spec.Target)
	default:
		err = fmt.Errorf("unsupported probe kind: %s", spec.Kind)
	}

	result.LatencyMS = float64(time.Since(start).Microseconds()) / 1000
	result.OK = err == nil
	if err != nil {
		result.Message = err.Error()
	}
	return result
}

func probeHTTP(ctx context.Context, target string) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return err
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode >= 400 {
		return fmt.Errorf("http status %d", response.StatusCode)
	}
	return nil
}

func probeTCP(ctx context.Context, target string) error {
	address := target
	if strings.Contains(address, ":") == false {
		address += ":80"
	}
	dialer := net.Dialer{}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return err
	}
	return conn.Close()
}
