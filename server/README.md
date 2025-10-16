## CollabCanvas Server — DO VPS + Cloudflare Tunnel + PM2 (Concise)

### 1) Install prerequisites (on VPS)
```bash
sudo apt update && sudo apt install -y nodejs npm
sudo npm i -g pm2
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

### 2) Install server deps
```bash
cd ~/figma-cad/server
npm install --production
```

### 3) Configure env vars
Create `server/.env`:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
PORT=3001
NODE_ENV=production
# Frontend origin (Vercel) for CORS
CLIENT_URL=https://figma-cad.vercel.app
```

Frontend `.env` (project root, used by Vite):
```env
# Backend public URL via Cloudflare Tunnel
VITE_SERVER_URL=https://my-app.bankrupt.fyi
```

### 4) Start backend with PM2
```bash
cd ~/figma-cad
pm2 start server/index.js --name collabcanvas-server --cwd "$(pwd)"
pm2 save && pm2 startup
```

### 5) Cloudflare Tunnel (HTTPS without managing certs)
Create/login once:
```bash
cloudflared tunnel login
cloudflared tunnel create my-app
# Note the tunnel ID printed; credentials written to /root/.cloudflared/<TUNNEL_ID>.json
```

Create `~/.cloudflared/config.yml` (replace with your actual TUNNEL_ID):
```yaml
tunnel: 0021f665-4e5f-41dc-8892-b5001d5c5286
credentials-file: /root/.cloudflared/0021f665-4e5f-41dc-8892-b5001d5c5286.json

ingress:
  - hostname: my-app.bankrupt.fyi
    service: http://localhost:3001
  - service: http_status:404
```

Add DNS (Cloudflare dashboard → bankrupt.fyi → DNS):
- CNAME `my-app` → `0021f665-4e5f-41dc-8892-b5001d5c5286.cfargotunnel.com` (DNS only)

Run tunnel with PM2 (persists across logout/reboot):
```bash
pm2 start cloudflared --name cloudflared -- tunnel run my-app
pm2 save
```

### 6) Test
```bash
# Public tunnel URL should respond
curl -I https://my-app.bankrupt.fyi

# Socket.io handshake endpoint
curl "https://my-app.bankrupt.fyi/socket.io/?EIO=4&transport=polling"

# Local backend health (optional)
curl http://localhost:3001
```

### 7) Useful PM2 commands
```bash
pm2 status
pm2 logs collabcanvas-server
pm2 logs cloudflared
pm2 restart collabcanvas-server
pm2 restart cloudflared
```

Notes:
- Backend accepts requests from `CLIENT_URL` only; keep it set to your Vercel URL.
- Frontend uses `VITE_SERVER_URL` to call the backend (your tunnel hostname).
- If you create more apps, add more `ingress` hostnames and corresponding DNS CNAMEs, or create separate tunnels per VPS.

