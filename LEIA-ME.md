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

## Agente de Marketing
Painel em `https://ia.herupusistemas.com.br/marketing.html` (botão **Marketing** no menu de baixo).

- Cria posts para **Instagram** e **Facebook** com legenda escrita pela IA grátis do LEGENDÁRIO.
- Imagens são ajustadas sozinhas para o formato do Instagram (JPG, 4:5 a 1,91:1) e carrossel até 10.
- **Agenda:** posts aprovados publicam sozinhos no horário, sem navegador e sem Claude.
  Um post nunca é publicado duas vezes na mesma rede.
- **Comentários:** lista os comentários sem resposta e a IA sugere a resposta pelo kit.
  Resposta automática opcional; reclamações e spam ficam sempre para o dono.
- **Relatório:** alcance, curtidas, comentários e salvos dos últimos posts.
- **Por voz:** "Legendário, cria um post sobre técnicos de refrigeração para sexta às 18h" cria um **rascunho**
  (nunca publica sozinho; você confere, coloca a imagem e aprova no painel).

Configuração no `.env`: `MKT_SENHA`, `META_PAGE_ID`, `META_PAGE_TOKEN`, `META_IG_ID` (veja `env-exemplo.txt`).
Os dados ficam em `dados/` (fora do Git). Faça backup dessa pasta junto com o `.env`.

### Estratégia viral (aba ✦ Estratégia)
- **Diagnóstico:** a IA lê os números reais do Instagram e dos links e diz o que trava o alcance e o que fazer em 7 dias.
- **Plano da semana:** cria rascunhos com formato (Reels/carrossel/imagem/story), gancho, roteiro cena a cena, ideia de arte
  e legenda, sem repetir o que já foi publicado. O conhecimento da IA (produtos e regras de viralização) fica em `estrategia.js`.
- **Links rastreáveis:** `https://ia.herupusistemas.com.br/r/<nome>` conta cada clique e leva ao destino (cadastro, app, WhatsApp).
