package authn

import (
	"strings"
	"testing"
)

func TestPasswordHashAndVerify(t *testing.T) {
	encoded, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	if strings.HasPrefix(encoded, "$argon2id$") == false {
		t.Fatalf("unexpected hash format: %s", encoded)
	}

	ok, err := VerifyPassword("correct horse battery staple", encoded)
	if err != nil {
		t.Fatalf("verify password: %v", err)
	}
	if ok == false {
		t.Fatalf("expected password to verify")
	}

	ok, err = VerifyPassword("wrong password", encoded)
	if err != nil {
		t.Fatalf("verify wrong password: %v", err)
	}
	if ok {
		t.Fatalf("expected wrong password to fail")
	}

	if _, err := VerifyPassword("x", "not-a-hash"); err == nil {
		t.Fatalf("expected malformed hash to error")
	}
}

func TestGenerateToken(t *testing.T) {
	plain, hash, err := GenerateToken()
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}
	if strings.HasPrefix(plain, "pjx_") == false {
		t.Fatalf("expected pjx_ prefix, got %s", plain)
	}
	if HashToken(plain) != hash {
		t.Fatalf("expected hash to match")
	}

	plain2, hash2, err := GenerateToken()
	if err != nil {
		t.Fatalf("generate second token: %v", err)
	}
	if plain == plain2 || hash == hash2 {
		t.Fatalf("expected tokens to be unique")
	}
}
