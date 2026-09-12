package store

import (
	"context"
	"testing"

	"github.com/jacob-bytes/pjx/internal/authn"
)

func TestAgentTokenLifecycle(t *testing.T) {
	ctx := context.Background()
	instance := openTestStore(t)

	plain, hash, err := authn.GenerateToken()
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}
	if err := instance.CreateAgentToken(ctx, "tok_1", "node a", hash); err != nil {
		t.Fatalf("create token: %v", err)
	}

	record, ok, err := instance.FindAgentTokenByHash(ctx, hash)
	if err != nil {
		t.Fatalf("find token: %v", err)
	}
	if ok == false {
		t.Fatalf("expected token to be found")
	}
	if record.Name != "node a" {
		t.Fatalf("unexpected token name: %s", record.Name)
	}

	if err := instance.TouchAgentToken(ctx, "tok_1"); err != nil {
		t.Fatalf("touch token: %v", err)
	}

	count, err := instance.CountActiveAgentTokens(ctx)
	if err != nil {
		t.Fatalf("count tokens: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 active token, got %d", count)
	}

	tokens, err := instance.ListAgentTokens(ctx)
	if err != nil {
		t.Fatalf("list tokens: %v", err)
	}
	if len(tokens) != 1 {
		t.Fatalf("expected 1 token, got %d", len(tokens))
	}

	if err := instance.RevokeAgentToken(ctx, "tok_1"); err != nil {
		t.Fatalf("revoke token: %v", err)
	}
	_, ok, err = instance.FindAgentTokenByHash(ctx, authn.HashToken(plain))
	if err != nil {
		t.Fatalf("find revoked token: %v", err)
	}
	if ok {
		t.Fatalf("expected revoked token to be rejected")
	}
}
