package service

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"raahi/internal/config"
	"strings"
	"time"
)

var client = &http.Client{Timeout: 10 * time.Second}

func setting(name, fallback string) string {
	if value, exists := os.LookupEnv(name); exists {
		return value
	}
	return fallback
}

func reply(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
func Handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	origin := r.Header.Get("Origin")
	if origin != "" && origin != "https://"+r.Host && origin != "http://"+r.Host {
		allowed := false
		for _, candidate := range strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") {
			if strings.TrimSpace(candidate) == origin {
				allowed = true
			}
		}
		if !allowed {
			reply(w, 403, map[string]string{"error": "Origin not allowed"})
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	}
	if r.Method == "OPTIONS" {
		w.WriteHeader(204)
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/v1/")
	if path == "health" && r.Method == "GET" {
		reply(w, 200, map[string]string{"status": "ok", "service": "raahi-api"})
		return
	}
	if r.Method != "GET" && r.Method != "POST" {
		w.Header().Set("Allow", "GET, POST")
		reply(w, 405, map[string]string{"error": "method not allowed"})
		return
	}
	base := setting("SUPABASE_URL", config.SupabaseURL)
	key := setting("SUPABASE_ANON_KEY", config.SupabasePublicKey)
	if base == "" || key == "" {
		reply(w, 503, map[string]string{"error": "Database is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY."})
		return
	}
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") || len(auth) < 15 {
		reply(w, 401, map[string]string{"error": "Sign in required"})
		return
	}
	var target string
	var body []byte
	if r.Method == "GET" {
		switch path {
		case "profile":
			target = "/rest/v1/raahi_profiles?select=*&id=eq."
		case "rides":
			target = "/rest/v1/raahi_rides?select=*&order=created_at.desc&limit=100"
		case "captains":
			target = "/rest/v1/raahi_profiles?select=id,name,role,approved,online,vehicle,created_at&role=eq.captain&limit=100"
		case "audit":
			target = "/rest/v1/raahi_audit?select=*&order=created_at.desc&limit=100"
		default:
			reply(w, 404, map[string]string{"error": "not found"})
			return
		}
		if path == "profile" {
			target = "/rest/v1/rpc/raahi_current_profile"
		}
	} else {
		var data map[string]any
		dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16384))
		if dec.Decode(&data) != nil {
			reply(w, 400, map[string]string{"error": "Invalid JSON"})
			return
		}
		if dec.Decode(&struct{}{}) != io.EOF {
			reply(w, 400, map[string]string{"error": "Single JSON object required"})
			return
		}
		switch path {
		case "book":
			target = "/rest/v1/rpc/raahi_book_ride"
		case "transition":
			target = "/rest/v1/rpc/raahi_transition_ride"
		case "approve":
			target = "/rest/v1/rpc/raahi_review_captain"
		case "availability":
			target = "/rest/v1/rpc/raahi_set_availability"
		case "location":
			target = "/rest/v1/rpc/raahi_update_location"
		case "tracking":
			target = "/rest/v1/rpc/raahi_get_tracking"
		case "code":
			target = "/rest/v1/rpc/raahi_get_start_code"
		case "sos":
			target = "/rest/v1/rpc/raahi_create_sos"
		default:
			reply(w, 404, map[string]string{"error": "not found"})
			return
		}
		body, _ = json.Marshal(data)
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, r.Method, strings.TrimRight(base, "/")+target, bytes.NewReader(body))
	if err != nil {
		reply(w, 500, map[string]string{"error": "request failed"})
		return
	}
	req.Header.Set("apikey", key)
	req.Header.Set("Authorization", auth)
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		reply(w, 502, map[string]string{"error": "Database unavailable"})
		return
	}
	defer resp.Body.Close()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, io.LimitReader(resp.Body, 2<<20))
}
