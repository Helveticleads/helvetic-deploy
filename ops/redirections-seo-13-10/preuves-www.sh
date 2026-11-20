#!/bin/bash
# ============================================================================
# preuves-www.sh : fait tourner www-vers-apex.sh sur un faux /etc/nginx, dans
# un dossier temporaire, avec des bouchons a la place de nginx, systemctl,
# pgrep et curl. Aucun hote n est joint, aucun reseau.
#
#   bash ops/redirections-seo-13-10/preuves-www.sh
#
# Le bouchon curl est un petit nginx de papier : il lit les blocs server du
# faux /etc/nginx, trouve celui qui porte le nom demande sur le bon port, et
# repond 301 ou 200 comme le vrai le ferait. Les preuves du script sont donc
# vraiment exercees, pas seulement ses gardes.
#
# Neuf cas, sur les DEUX vhosts reels : celui de helvetic-pool.ch (Infomaniak
# DE) et celui de helvetic-rohrreinigung.ch (Hetzner), qui porte en plus
# ipv6only=on.
# ============================================================================
set -u
export LC_ALL=C

ICI="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$ICI/../www-vers-apex.sh"
[ -f "$SCRIPT" ] || SCRIPT="$ICI/www-vers-apex.sh"
FIX="$ICI/fixtures"
BASE="${TMPDIR:-/tmp}/preuves-www-$$"
ECHECS=0

bash -n "$SCRIPT" && echo "syntaxe ok" || { echo "SYNTAXE EN FAUTE"; exit 1; }
if command -v shellcheck >/dev/null; then
  shellcheck -S error "$SCRIPT" "$0" || { echo "SHELLCHECK EN FAUTE"; exit 1; }
  echo "shellcheck ok (niveau erreur)"
  shellcheck -S warning "$SCRIPT" "$0" || echo "shellcheck : remarques ci dessus, non bloquantes"
else
  echo "shellcheck absent, saute"
fi

prepare() {
  T="$BASE/$1"; D="$2"; rm -rf "$T"
  mkdir -p "$T/etc/nginx/sites-enabled" "$T/etc/nginx/snippets" \
           "$T/etc/letsencrypt/live/$D" "$T/root" "$T/home/deploy" "$T/bin"
  case "$D" in
    helvetic-pool.ch)           cp "$FIX/vhost-helvetic-pool.ch.conf" "$T/etc/nginx/sites-enabled/$D.conf" ;;
    helvetic-rohrreinigung.ch)  cp "$FIX/vhost-helvetic-rohrreinigung.ch-courant.conf" "$T/etc/nginx/sites-enabled/$D.conf" ;;
  esac
  # deux voisins, pour que la preuve 1 ait de quoi comparer
  for v in helvetic-voisin-un.ch helvetic-voisin-deux.ch; do
    printf 'server {\n    server_name %s www.%s;\n    listen 443 ssl;\n}\n' "$v" "$v" \
      > "$T/etc/nginx/sites-enabled/$v.conf"
  done
  printf '# faux certificat\n' > "$T/etc/letsencrypt/live/$D/fullchain.pem"
  printf 'sitemap\n' > "$T/sitemap"
  : > "$T/certificat-sans-www"

  cat > "$T/bin/nginx" <<'BOUCHON'
#!/bin/bash
# vert, sauf : drapeau nginx-rouge, ou deux fois la meme option de socket pour
# [::]:443, ce que le vrai nginx refuse ("duplicate listen options").
n=$(grep -rc 'ipv6only=on' "$RT/etc/nginx/sites-enabled/" 2>/dev/null | awk -F: '{s+=$2} END{print s+0}')
if [ "${n:-0}" -ge 2 ]; then
  echo "nginx: [emerg] duplicate listen options for [::]:443"; exit 1
fi
if [ -f "$RT/nginx-rouge" ] && grep -rq 'server_name www\.' "$RT/etc/nginx/sites-enabled/"; then
  echo "nginx: [emerg] bouchon : faute demandee par le cas"; exit 1
fi
echo "nginx: configuration file /etc/nginx/nginx.conf test is successful"
BOUCHON
  cat > "$T/bin/systemctl" <<'BOUCHON'
#!/bin/sh
case "$*" in *is-active*) exit 0 ;; esac
exit 0
BOUCHON
  cat > "$T/bin/pgrep" <<'BOUCHON'
#!/bin/sh
[ -f "$RT/hote-occupe" ] && { echo "1234 apt-get upgrade"; exit 0; }
exit 1
BOUCHON
  cat > "$T/bin/openssl" <<'BOUCHON'
#!/bin/sh
# x509 -text : les noms du certificat. Sans le www si le cas l a demande.
if [ -s "$RT/certificat-sans-www" ]; then
  echo "        X509v3 Subject Alternative Name:"; echo "            DNS:$CERT_D"
else
  echo "        X509v3 Subject Alternative Name:"; echo "            DNS:$CERT_D, DNS:www.$CERT_D"
fi
BOUCHON
  # le petit nginx de papier
  cat > "$T/bin/curl" <<'BOUCHON'
#!/bin/bash
fmt=""; url=""; prev=""
for a in "$@"; do
  [ "$prev" = "-w" ] && fmt="$a"
  case "$a" in http://*|https://*) url="$a" ;; esac
  prev="$a"
done
scheme="${url%%://*}"; reste="${url#*://}"; hote="${reste%%/*}"
chemin="/${reste#*/}"; [ "$reste" = "$hote" ] && chemin="/"
port=443; [ "$scheme" = "http" ] && port=80
case "$chemin" in */sitemap.xml) printf '<loc>https://%s/une-page-profonde/</loc>' "$hote"; exit 0 ;; esac
# le voisin ne tombe qu APRES la pose, sinon la mesure d avant le verrait deja
if [ -f "$RT/voisin-bouge" ] && [ "$hote" = "helvetic-voisin-deux.ch" ] \
   && grep -rq '^[[:space:]]*server_name www\.' "$RT/etc/nginx/sites-enabled/helvetic-pool.ch.conf"; then
  printf '%s' "${fmt//'%{http_code}'/503}"; exit 0
fi
lire() {
  awk -v hote="$hote" -v port="$port" -v chemin="$chemin" '
    /^server[[:space:]]*\{/ { b++; sn[b] = ""; ret[b] = ""; p[b] = 0; retsi[b] = "" }
    b > 0 {
      if ($0 ~ /^[[:space:]]*server_name/) { l = $0; sub(/.*server_name[[:space:]]*/, "", l); sub(/;.*/, "", l); sn[b] = sn[b] " " l " " }
      if ($0 ~ /^[[:space:]]*listen[[:space:]]+(\[::\]:)?80;/) p[b] = 80
      if ($0 ~ /^[[:space:]]*listen[[:space:]]+(\[::\]:)?443/) p[b] = 443
      if ($0 ~ ("if \\(\\$host = " hote "\\)")) dansi[b] = 1
      if ($0 ~ /^[[:space:]]*return 301/) {
        l = $0; sub(/.*return 301[[:space:]]*/, "", l); sub(/;.*/, "", l)
        if (dansi[b] == 1 && retsi[b] == "") retsi[b] = l
        else if ($0 !~ /location/ && ret[b] == "") ret[b] = l
      }
      if ($0 ~ /^[[:space:]]*\}/ && dansi[b] == 1) dansi[b] = 0
    }
    END {
      for (i = 1; i <= b; i++) {
        if (p[i] != port) continue
        if (index(sn[i], " " hote " ") == 0) continue
        c = (retsi[i] != "") ? retsi[i] : ret[i]
        if (c == "") { print "200"; exit }
        gsub(/\$request_uri/, chemin, c); gsub(/\$host/, hote, c)
        print "301 " c; exit
      }
      print "404"
    }
  ' "$RT"/etc/nginx/sites-enabled/*
}
r=$(lire); code="${r%% *}"; vers=""; [ "$code" = "301" ] && vers="${r#* }"
if [ -z "$fmt" ]; then exit 0; fi
out="${fmt//'%{http_code}'/$code}"; out="${out//'%{redirect_url}'/$vers}"
printf '%s' "$out"
BOUCHON
  if ! command -v timeout >/dev/null; then printf '%s\n' '#!/bin/sh' 'shift; exec "$@"' > "$T/bin/timeout"; fi
  chmod +x "$T/bin"/*
  cp "$T/etc/nginx/sites-enabled/$D.conf" "$T/temoin"
}

cas() {
  local nom="$1" mode="$2" attendu="$3"
  export RT="$T" CERT_D="$D" PATH="$T/bin:$PATH" WWW_RACINE_ESSAI="$T"
  local sortie code verdict
  sortie=$(bash "$SCRIPT" "$mode" "$D" 2>&1); code=$?
  verdict=$(printf '%s\n' "$sortie" | grep -E '^VERDICT' | head -1)
  printf '%-48s code %s  %s\n' "$nom" "$code" "$verdict"
  printf '%s\n' "$sortie" > "$T/sortie.txt"
  case "$verdict" in
    *"$attendu"*) : ;;
    *) echo "      ATTENDU : $attendu"; printf '%s\n' "$sortie" | tail -14 | sed 's/^/      /'; ECHECS=$((ECHECS+1)) ;;
  esac
}

intact() {
  if cmp -s "$T/temoin" "$T/etc/nginx/sites-enabled/$D.conf"; then
    echo "      $1 : vhost intact, octet pour octet"
  else
    echo "      $1 : FAUTE, le vhost a change"; diff "$T/temoin" "$T/etc/nginx/sites-enabled/$D.conf" | head -8 | sed 's/^/        /'; ECHECS=$((ECHECS+1))
  fi
}

forme_attendue() {
  local f="$T/etc/nginx/sites-enabled/$D.conf" ok=1
  [ "$(grep -c "^[[:space:]]*server_name $D;$" "$f")" = "1" ] || ok=0
  [ "$(grep -c "^[[:space:]]*server_name www\.$D;$" "$f")" = "1" ] || ok=0
  [ "$(grep -c "^[[:space:]]*server_name $D www\.$D;$" "$f")" = "1" ] || ok=0
  [ "$(grep -c '^server {' "$f")" = "3" ] || ok=0
  grep -vE '^[[:space:]]*#' "$f" | grep -q 'if (\$host' && ok=0
  [ "$(grep -c "return 301 https://$D\$request_uri;" "$f")" = "2" ] || ok=0
  [ "$(grep -c 'ipv6only=on' "$f")" -le 1 ] || ok=0
  if [ "$ok" = "1" ]; then
    echo "      $1 : trois blocs, un seul ipv6only, aucun if (\$host), deux 301 vers l apex"
  else
    echo "      $1 : FAUTE, la forme posee n est pas celle attendue"; ECHECS=$((ECHECS+1))
  fi
}

# ------------------------------------------------------------------- les cas
prepare A helvetic-pool.ch;  cas "A pool : pose normale" --poser "REUSSI"; forme_attendue A

prepare B helvetic-pool.ch
awk '
  { print }
  !fait && $0 ~ /^[[:space:]]*listen \[::\]:80;/ { print "    access_log /var/log/nginx/pool80.log;"; fait = 1 }
' "$T/etc/nginx/sites-enabled/helvetic-pool.ch.conf" > "$T/b" && mv "$T/b" "$T/etc/nginx/sites-enabled/helvetic-pool.ch.conf"
cp "$T/etc/nginx/sites-enabled/helvetic-pool.ch.conf" "$T/temoin"
cas "B bloc 80 avec une ligne inconnue" --poser "ECART (rien touche"; intact B

prepare C helvetic-pool.ch
printf 'server {\n    server_name www.helvetic-pool.ch;\n    listen 443 ssl;\n    return 301 https://helvetic-pool.ch$request_uri;\n}\n' >> "$T/etc/nginx/sites-enabled/helvetic-pool.ch.conf"
cp "$T/etc/nginx/sites-enabled/helvetic-pool.ch.conf" "$T/temoin"
cas "C le bloc www existe deja" --poser "ECART (rien touche"; intact C

prepare D helvetic-pool.ch; echo oui > "$T/certificat-sans-www"
cas "D certificat sans le www" --poser "ECART (rien touche"; intact D

prepare E helvetic-pool.ch; touch "$T/nginx-rouge"
cas "E nginx -t rouge apres la pose" --poser "ECART"; intact E

prepare F helvetic-pool.ch; touch "$T/voisin-bouge"
cas "F un voisin change de reponse" --poser "ECART"; intact F

prepare G helvetic-pool.ch; cas "G mode verification" --verifier "REUSSI (verification seule"; intact G

prepare H helvetic-pool.ch; touch "$T/home/deploy/.helveticleads-deploy-lock"
cas "H verrou de deploiement pris" --poser "ECART (rien touche"; intact H

prepare I helvetic-rohrreinigung.ch
cas "I rohrreinigung : pose avec ipv6only" --poser "REUSSI"; forme_attendue I

rm -rf "$BASE"
echo "----------------------------------------------------------------"
if [ "$ECHECS" = "0" ]; then echo "PREUVES WWW : les neuf cas passent"; exit 0; fi
echo "PREUVES WWW : $ECHECS faute(s)"; exit 1
