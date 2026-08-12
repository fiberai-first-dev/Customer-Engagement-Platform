# CEP — nginx reverse proxy (VM deploy)
#
# Frontend: https://cep-svasthyaa.fybud.com  → 127.0.0.1:9000 (platform-web)
# API:      https://api.cep-svasthyaa.fybud.com → 127.0.0.1:4100 (platform-api)
#
# Install:
#   sudo cp nginx-cep.conf /etc/nginx/sites-available/cep
#   sudo ln -sf /etc/nginx/sites-available/cep /etc/nginx/sites-enabled/cep
#   sudo nginx -t && sudo systemctl reload nginx
#
# TLS (after DNS points here):
#   sudo certbot --nginx -d cep-svasthyaa.fybud.com -d api.cep-svasthyaa.fybud.com

upstream cep_web {
    server 127.0.0.1:9000;
}

upstream cep_api {
    server 127.0.0.1:4100;
}

# Agent UI
server {
    listen 80;
    listen [::]:80;
    server_name cep-svasthyaa.fybud.com;

    location / {
        proxy_pass http://cep_web;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# API — webhooks, OAuth, /api, /health, everything
server {
    listen 80;
    listen [::]:80;
    server_name api.cep-svasthyaa.fybud.com;

    client_max_body_size 25m;
    proxy_read_timeout 120s;

    location / {
        proxy_pass http://cep_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
