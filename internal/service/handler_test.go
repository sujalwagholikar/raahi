package service

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHealth(t *testing.T) {
	w := httptest.NewRecorder()
	Handler(w, httptest.NewRequest("GET", "/v1/health", nil))
	if w.Code != 200 || !strings.Contains(w.Body.String(), "raahi-api") {
		t.Fatal(w)
	}
}
func TestUnconfigured(t *testing.T) {
	t.Setenv("SUPABASE_URL", "")
	w := httptest.NewRecorder()
	Handler(w, httptest.NewRequest("GET", "/v1/rides", nil))
	if w.Code != 503 {
		t.Fatal(w.Code)
	}
}
func TestAuth(t *testing.T) {
	t.Setenv("SUPABASE_URL", "https://example.invalid")
	t.Setenv("SUPABASE_ANON_KEY", "test")
	w := httptest.NewRecorder()
	Handler(w, httptest.NewRequest("GET", "/v1/rides", nil))
	if w.Code != 401 {
		t.Fatal(w.Code)
	}
}
func TestMethod(t *testing.T) {
	w := httptest.NewRecorder()
	Handler(w, httptest.NewRequest("DELETE", "/v1/rides", nil))
	if w.Code != 405 {
		t.Fatal(w.Code)
	}
}
func TestOriginDenied(t *testing.T) {
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/v1/health", nil)
	r.Header.Set("Origin", "https://evil.example")
	Handler(w, r)
	if w.Code != 403 {
		t.Fatal(w.Code)
	}
}
func TestPreflight(t *testing.T) {
	t.Setenv("ALLOWED_ORIGINS", "https://web.example")
	w := httptest.NewRecorder()
	r := httptest.NewRequest("OPTIONS", "/v1/rides", nil)
	r.Header.Set("Origin", "https://web.example")
	Handler(w, r)
	if w.Code != 204 || w.Header().Get("Access-Control-Allow-Origin") != "https://web.example" {
		t.Fatal(w)
	}
}
func TestMalformedJSON(t *testing.T) {
	t.Setenv("SUPABASE_URL", "https://db.example")
	t.Setenv("SUPABASE_ANON_KEY", "test")
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/v1/book", strings.NewReader("{bad"))
	r.Header.Set("Authorization", "Bearer test-session-token")
	Handler(w, r)
	if w.Code != 400 {
		t.Fatal(w.Code)
	}
}
func TestForwardProfile(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/rest/v1/rpc/raahi_current_profile" || r.Header.Get("Authorization") != "Bearer test-session-token" || r.Header.Get("apikey") != "public-key" {
			t.Error("incorrect forwarding")
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[{"role":"customer"}]`))
	}))
	defer up.Close()
	t.Setenv("SUPABASE_URL", up.URL)
	t.Setenv("SUPABASE_ANON_KEY", "public-key")
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/v1/profile", nil)
	r.Header.Set("Authorization", "Bearer test-session-token")
	Handler(w, r)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "customer") {
		t.Fatal(w)
	}
}
