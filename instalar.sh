#!/usr/bin/env bash
# HERUPU LEGENDÁRIO — instala o servidor no Contabo. Rode dentro da pasta do projeto:
#   bash instalar.sh
set -e
cd "$(dirname "$0")"
echo "== HERUPU LEGENDARIO: instalando =="

if ! command -v node >/dev/null 2>&1; then
  echo "Node não encontrado. Instalando Node 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node: $(node -v)"

echo "Instalando dependências..."
npm install --omit=dev

if [ ! -f .env ]; then
  cp env-exemplo.txt .env
  echo ""
  echo ">> Agora edite o arquivo .env e coloque sua GEMINI_API_KEY:"
  echo ">>   nano .env"
  echo ">> Depois rode de novo: bash instalar.sh"
  exit 0
fi

if grep -q "coloque_sua_chave" .env; then
  echo ">> Falta colocar sua chave no .env (nano .env). Rode de novo depois."
  exit 0
fi

# serviço systemd (liga sozinho e reinicia se cair)
SERVICO=/etc/systemd/system/herupu-legendario.service
sudo tee "$SERVICO" >/dev/null <<SVC
[Unit]
Description=HERUPU LEGENDARIO
After=network.target

[Service]
Type=simple
WorkingDirectory=$(pwd)
ExecStart=$(command -v node) $(pwd)/server.js
Restart=always
RestartSec=3
User=$(whoami)

[Install]
WantedBy=multi-user.target
SVC

sudo systemctl daemon-reload
sudo systemctl enable herupu-legendario
sudo systemctl restart herupu-legendario
sleep 2
echo ""
echo "== Pronto. Testando =="
curl -s http://127.0.0.1:8790/saude || true
echo ""
echo "O servidor está rodando na porta 8790."
echo "Agora configure o nginx + HTTPS no seu domínio (veja LEIA-ME.md, passo 3)."
