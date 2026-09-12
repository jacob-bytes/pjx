.PHONY: web master agent test clean

web:
	cd web && npm install && npm run build

master: web
	mkdir -p build
	go build -tags embedweb -o build/pjx-master ./cmd/master

agent:
	mkdir -p build
	go build -o build/pjx-agent ./cmd/agent

test:
	gofmt -l cmd internal
	go vet ./...
	go test ./...

clean:
	rm -rf build
