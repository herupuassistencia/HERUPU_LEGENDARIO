# HERUPU LEGENDÁRIO no seu servidor (Contabo), no seu domínio

Tudo roda no seu Contabo, pelo Termius. A chave do Google fica só no servidor.
Você atualiza no futuro com `git pull` + reiniciar — sem PC, sem Netlify.

## Passo 1 — baixar no servidor (Termius)
```
cd /opt
sudo git clone https://github.com/herupuassistencia/herupu-legendario.git
sudo chown -R $USER:$USER herupu-legendario
cd herupu-legendario
```

## Passo 2 — instalar e ligar
```
bash instalar.sh         # instala o Node e as dependências
nano .env                # cole sua GEMINI_API_KEY (a mesma do ALFRED)
bash instalar.sh         # agora cria o serviço e liga
```
No fim deve aparecer: `{"ok":true,"chave":true,"voz":true}`

## Passo 3 — domínio com HTTPS (obrigatório para o microfone)
1. No painel do seu domínio, aponte um registro **A** para o IP do Contabo.
2. No servidor:
```
sudo cp nginx-exemplo.conf /etc/nginx/sites-available/herupu
sudo nano /etc/nginx/sites-available/herupu     # troque SEU-DOMINIO.com
sudo ln -s /etc/nginx/sites-available/herupu /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d SEU-DOMINIO.com
```
(Se não tiver o certbot: `sudo apt-get install -y certbot python3-certbot-nginx`)

## Passo 4 — usar
Abra `https://SEU-DOMINIO.com` no celular. Toque na esfera, diga "Legendário".
Para virar app: menu do Chrome > Adicionar à tela inicial.

## Atualizar depois
```
cd /opt/herupu-legendario
git pull
npm install --omit=dev
sudo systemctl restart herupu-legendario
```

## Comandos úteis
- Ver se está no ar: `curl -s http://127.0.0.1:8790/saude`
- Ver o registro: `journalctl -u herupu-legendario -n 50 --no-pager`
- Reiniciar: `sudo systemctl restart herupu-legendario`
