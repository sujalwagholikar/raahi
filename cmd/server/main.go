package main

import (
	"log"
	"net/http"
	"raahi/internal/service"
	"time"
)

func main() {
	m := http.NewServeMux()
	m.HandleFunc("/v1/", service.Handler)
	m.Handle("/", http.FileServer(http.Dir("dist")))
	s := http.Server{Addr: ":8080", Handler: m, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 20 * time.Second, IdleTimeout: 60 * time.Second}
	log.Fatal(s.ListenAndServe())
}
