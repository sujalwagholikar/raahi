package handler

import (
	"net/http"
	"raahi/internal/service"
)

func Handler(w http.ResponseWriter, r *http.Request) { service.Handler(w, r) }
