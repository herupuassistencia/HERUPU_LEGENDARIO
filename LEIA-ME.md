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

## App Android (pasta android/)
Kotlin puro, abre https://ia.herupusistemas.com.br e entrega ao site a ponte `HerupuNativo`:
abrir apps, música (Spotify/YouTube Music), alarme, timer, lanterna, volume, Acessibilidade (tocar, escrever, rolar,
voltar, ler a tela), palavra de chamada em segundo plano e esfera flutuante. Nunca age em apps de banco nem toca em
pagamento/apagar. Gerar: `cd android && ./gradlew assembleRelease` (SDK Android 35). O APK pronto fica em
`site/HERUPU-LEGENDARIO.apk` → https://ia.herupusistemas.com.br/HERUPU-LEGENDARIO.apk
A chave de assinatura (android/assinatura) precisa ser a mesma em toda versão, senão o Android não atualiza por cima.

## Piloto automático (posts sozinhos, 3 por dia)
Aba **🤖 Piloto** do painel de marketing.

- Escolha os horários (padrão 09:00 Reel, 13:00 arte, 19:30 Reel), o foco de cada um e as redes (Instagram, Facebook, TikTok).
- O LEGENDÁRIO monta sozinho os posts de **hoje e amanhã**, um a cada 10 minutos: roteiro e legenda pela IA grátis,
  arte ou Reel no estúdio (ffmpeg + voz do Antonio) e agenda. Não usa o Claude nem navegador.
- **Aprovação:** "Publicar sozinho" agenda direto; "Esperar eu aprovar" deixa como rascunho.
- **Modelos:** envie em "Meus modelos" as imagens e vídeos já criados (Gemini, Flow, Canva). Cada post usa um modelo
  diferente como fundo (o menos usado), com texto, chamada e narração novos. Vídeos são convertidos para 9:16 sem som.
- **Nunca repete:** passa pela mesma trava de legenda/imagem repetida dos posts manuais.
- **TikTok** só recebe vídeo: nos posts de arte, o piloto gera também um vídeo curto narrado só para o TikTok.
  Enquanto o app do TikTok não passa na auditoria, o TikTok só aceita os vídeos como **privados**.
- Conectar o TikTok: Ajustes → Chaves do app do TikTok → Conectar TikTok.

## Google Drive
Ajustes → Google Drive → Conectar. Depois disso o agente:
- **Busca os modelos no Drive** (a cada 6 h ou em "Sincronizar agora"): pasta "HERUPU Marketing - Lançamento Nacional"
  e a pasta criada por ele "HERUPU LEGENDÁRIO / Modelos / <segmento>" (com subpasta "Fundos limpos").
  Segmento e tipo vêm do nome da pasta/arquivo (cliente, técnico/modalidades, solar, segurança, programação).
  Imagens fora de "Fundos limpos" são artes prontas (entram inteiras no Reel). Pastas "versão antiga" são ignoradas.
  Apagou ou moveu no Drive → sai dos modelos na próxima sincronização.
- **Salva no Drive** tudo que cria: "HERUPU LEGENDÁRIO / Posts gerados / AAAA-MM".
