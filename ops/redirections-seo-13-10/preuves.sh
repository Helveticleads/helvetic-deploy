#!/bin/bash
# ============================================================================
# preuves.sh : fait tourner hetzner-rohrreinigung-anciennes-adresses.sh sur un
# faux /etc/nginx, dans un dossier temporaire, avec des bouchons a la place de
# nginx, systemctl, pgrep et curl. Aucun hote n est touche, aucun reseau.
#
#   bash ops/redirections-seo-13-10/preuves.sh
#
# Neuf cas. Chacun verifie le VERDICT et, pour les ECART, que les fichiers
# sont bien revenus a leur etat d avant, octet pour octet.
# ============================================================================
set -u
export LC_ALL=C

ICI="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$ICI/hetzner-rohrreinigung-anciennes-adresses.sh"
FIX="$ICI/fixtures"
BASE="${TMPDIR:-/tmp}/preuves-redirections-$$"
ECHECS=0

bash -n "$SCRIPT" && echo "syntaxe ok" || { echo "SYNTAXE EN FAUTE"; exit 1; }
if command -v shellcheck >/dev/null; then
  shellcheck -S error "$SCRIPT" "$0" || { echo "SHELLCHECK EN FAUTE"; exit 1; }
  echo "shellcheck ok (niveau erreur)"
  shellcheck -S warning "$SCRIPT" "$0" || echo "shellcheck : remarques ci dessus, non bloquantes"
else
  echo "shellcheck absent, saute"
fi

# --------------------------------------------------------------- preparation
prepare() {
  T="$BASE/$1"; rm -rf "$T"
  mkdir -p "$T/etc/nginx/sites-enabled" "$T/etc/nginx/snippets" \
           "$T/root/redirections-seo-13-10" "$T/home/deploy" "$T/bin"
  # le vhost reel, ses chemins de snippets reconduits sous la fausse racine
  sed "s#/etc/nginx/snippets/#$T/etc/nginx/snippets/#g" \
    "$FIX/vhost-helvetic-rohrreinigung.ch.conf" > "$T/etc/nginx/sites-enabled/helvetic-rohrreinigung.ch.conf"
  cp "$FIX/snippet-g1-301.conf"                      "$T/etc/nginx/snippets/helvetic-rohrreinigung.ch-g1-301.conf"
  cp "$FIX/snippet-legacy-intention-301-ancien.conf" "$T/etc/nginx/snippets/helvetic-rohrreinigung.ch-legacy-intention-301.conf"
  cp "$FIX/snippet-umami-proxy.conf"                 "$T/etc/nginx/snippets/umami-proxy.conf"
  cp "$FIX/anciennes-adresses-vers-kanton.conf"      "$T/root/redirections-seo-13-10/anciennes-adresses-vers-kanton.conf"
  cp "$FIX/legacy-intention-301.conf"                "$T/root/redirections-seo-13-10/legacy-intention-301.conf"
  cp "$T/etc/nginx/sites-enabled/helvetic-rohrreinigung.ch.conf" "$T/temoin-vhost"
  cp "$T/etc/nginx/snippets/helvetic-rohrreinigung.ch-legacy-intention-301.conf" "$T/temoin-legacy"

  cat > "$T/bin/nginx" <<'BOUCHON'
#!/bin/sh
# -t vert, sauf si le cas a pose le drapeau nginx-rouge ET que la ligne
# include du nouveau snippet est dans le vhost : comme le vrai nginx, le
# bouchon redevient vert des que le retour arriere a retire cette ligne.
if [ -f "$RT/nginx-rouge" ] && grep -q "anciennes-adresses-vers-kanton.conf;" \
     "$RT/etc/nginx/sites-enabled/helvetic-rohrreinigung.ch.conf" 2>/dev/null; then
  echo "nginx: [emerg] duplicate location \"/staedte/aarberg\""
  echo "nginx: configuration file /etc/nginx/nginx.conf test failed"; exit 1
fi
echo "nginx: the configuration file /etc/nginx/nginx.conf syntax is ok"
echo "nginx: configuration file /etc/nginx/nginx.conf test is successful"
BOUCHON
  cat > "$T/bin/systemctl" <<'BOUCHON'
#!/bin/sh
case "$*" in
  *is-active*) exit 0 ;;
  *reload*) [ -f "$RT/reload-echec" ] && exit 1; echo "(bouchon) nginx recharge"; exit 0 ;;
esac
exit 0
BOUCHON
  cat > "$T/bin/pgrep" <<'BOUCHON'
#!/bin/sh
[ -f "$RT/hote-occupe" ] && { echo "1234 rsync -a /var/www/"; exit 0; }
exit 1
BOUCHON
  # bouchon curl : repond d apres le snippet REELLEMENT pose, comme le ferait
  # nginx. Une adresse listee fait une 301 vers sa cible ; une cible repond
  # 200 ; un accueil repond 200. Le drapeau curl-faute force une adresse a
  # repondre 200 au lieu de 301.
  cat > "$T/bin/curl" <<'BOUCHON'
#!/bin/bash
fmt=""; url=""; prev=""
for a in "$@"; do
  [ "$prev" = "-w" ] && fmt="$a"
  case "$a" in https://*) url="$a" ;; esac
  prev="$a"
done
SNIP="$RT/etc/nginx/snippets/helvetic-rohrreinigung.ch-anciennes-adresses-vers-kanton.conf"
LEG="$RT/etc/nginx/snippets/helvetic-rohrreinigung.ch-legacy-intention-301.conf"
hote="${url#https://}"; hote="${hote%%/*}"
chemin="/${url#https://*/}"; [ "$chemin" = "/$url" ] && chemin="/"
code=200; vers=""
cible=""
if [ -f "$SNIP" ]; then
  cible=$(grep -oE "^location = $chemin \{ return 301 [^;\$]+" "$SNIP" 2>/dev/null | awk '{print $7}' | head -1)
fi
if [ -z "$cible" ] && [ -f "$LEG" ]; then
  cible=$(grep -oE "^location = $chemin \{ return 301 [^;\$]+" "$LEG" 2>/dev/null | awk '{print $7}' | head -1)
fi
if [ -n "$cible" ] && [ "$chemin" != "$(cat "$RT/curl-faute" 2>/dev/null)" ]; then
  code=301; vers="https://$hote$cible"
fi
if [ -z "$fmt" ]; then
  case "$chemin" in
    /staedte/aarberg/) echo '<meta name="robots" content="noindex, follow"' ;;
    /kantone/*|/staedte/) echo '<meta name="robots" content="index,follow,max-image-preview:large"' ;;
    /staedte/glarus*) echo '<meta name="robots" content="index,follow,max-image-preview:large"' ;;
    *) echo '<meta name="robots" content="index,follow"' ;;
  esac
  exit 0
fi
out="${fmt//'%{http_code}'/$code}"; out="${out//'%{redirect_url}'/$vers}"
printf '%s' "$out"
BOUCHON
  # deux outils GNU que l hote a et que le Mac n a pas : bouchonnes seulement
  # s ils manquent, pour que les preuves tournent aussi en local.
  if ! command -v timeout >/dev/null; then
    printf '%s\n' '#!/bin/sh' 'shift; exec "$@"' > "$T/bin/timeout"
  fi
  if ! command -v sha256sum >/dev/null; then
    printf '%s\n' '#!/bin/sh' 'exec shasum -a 256 "$@"' > "$T/bin/sha256sum"
  fi
  chmod +x "$T/bin"/*
}

# insere une ligne apres la premiere qui porte le motif, sans sed -i ni \n,
# pour que les preuves tournent sur BSD comme sur GNU.
inserer_apres() {
  local fichier="$1" motif="$2" ligne="$3"
  awk -v motif="$motif" -v ligne="$ligne" '
    { print }
    !fait && index($0, motif) { print ligne; fait = 1 }
  ' "$fichier" > "$fichier.neuf" && mv "$fichier.neuf" "$fichier"
}

cas() {
  local nom="$1" mode="$2" attendu="$3"
  export RT="$T" PATH="$T/bin:$PATH" REDIR_RACINE_ESSAI="$T"
  local sortie code verdict
  sortie=$(bash "$SCRIPT" "$mode" 2>&1); code=$?
  verdict=$(printf '%s\n' "$sortie" | grep -E '^VERDICT' | head -1)
  printf '%-46s code %s  %s\n' "$nom" "$code" "$verdict"
  case "$verdict" in
    *"$attendu"*) : ;;
    *) echo "      ATTENDU : $attendu"; printf '%s\n' "$sortie" | tail -12 | sed 's/^/      /'; ECHECS=$((ECHECS+1)) ;;
  esac
}

intact() {
  local quoi="$1"
  if cmp -s "$T/temoin-vhost" "$T/etc/nginx/sites-enabled/helvetic-rohrreinigung.ch.conf" \
  && cmp -s "$T/temoin-legacy" "$T/etc/nginx/snippets/helvetic-rohrreinigung.ch-legacy-intention-301.conf"; then
    echo "      $quoi : vhost et snippet Legacy intacts, octet pour octet"
  else
    echo "      $quoi : FAUTE, un fichier a change"; ECHECS=$((ECHECS+1))
  fi
}

# ------------------------------------------------------------------- les cas
prepare A; cas "A pose normale" --poser "REUSSI"
N=$(grep -c "include .*anciennes-adresses-vers-kanton.conf;" "$T/etc/nginx/sites-enabled/helvetic-rohrreinigung.ch.conf")
L1=$(awk 'END { print NR }' "$T/temoin-vhost"); L2=$(awk 'END { print NR }' "$T/etc/nginx/sites-enabled/helvetic-rohrreinigung.ch.conf")
if [ "$N" = "1" ] && [ "$L2" = "$((L1+1))" ] \
  && cmp -s "$FIX/anciennes-adresses-vers-kanton.conf" "$T/etc/nginx/snippets/helvetic-rohrreinigung.ch-anciennes-adresses-vers-kanton.conf" \
  && cmp -s "$FIX/legacy-intention-301.conf" "$T/etc/nginx/snippets/helvetic-rohrreinigung.ch-legacy-intention-301.conf"; then
  echo "      A : une seule ligne include, vhost +1 ligne, les deux snippets poses a l identique"
else
  echo "      A : FAUTE (include=$N lignes $L1 puis $L2)"; ECHECS=$((ECHECS+1))
fi

prepare B; echo "# octet de trop" >> "$T/root/redirections-seo-13-10/anciennes-adresses-vers-kanton.conf"
cas "B empreinte du snippet differente" --poser "ECART (rien touche"; intact B

prepare C
inserer_apres "$T/etc/nginx/sites-enabled/helvetic-rohrreinigung.ch.conf" "location = /404.html" \
  "    location = /staedte/aarberg { return 301 /x; }"
cp "$T/etc/nginx/sites-enabled/helvetic-rohrreinigung.ch.conf" "$T/temoin-vhost"
cas "C adresse deja definie par le vhost" --poser "ECART (rien touche"; intact C

prepare D
inserer_apres "$T/etc/nginx/sites-enabled/helvetic-rohrreinigung.ch.conf" "-g1-301.conf;" \
  "    include $T/etc/nginx/snippets/helvetic-rohrreinigung.ch-anciennes-adresses-vers-kanton.conf;"
cp "$T/etc/nginx/sites-enabled/helvetic-rohrreinigung.ch.conf" "$T/temoin-vhost"
cas "D ligne include deja presente" --poser "ECART (rien touche"; intact D

prepare E; touch "$T/nginx-rouge"
cas "E nginx -t rouge apres la pose" --poser "ECART"; intact E

prepare F; echo "/staedte/aarberg" > "$T/curl-faute"
cas "F une adresse ne fait pas la 301" --poser "ECART"; intact F

prepare G; cas "G mode verification" --verifier "REUSSI (verification seule"; intact G

prepare H; touch "$T/home/deploy/.helveticleads-deploy-lock"
cas "H verrou de deploiement pris" --poser "ECART (rien touche"; intact H

prepare I; touch "$T/hote-occupe"
cas "I hote occupe" --poser "ECART (rien touche"; intact I

rm -rf "$BASE"
echo "----------------------------------------------------------------"
if [ "$ECHECS" = "0" ]; then echo "PREUVES : les neuf cas passent"; exit 0; fi
echo "PREUVES : $ECHECS faute(s)"; exit 1
