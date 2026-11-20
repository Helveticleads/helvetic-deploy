#!/bin/bash
# ============================================================================
# hetzner-rohrreinigung-anciennes-adresses.sh : pose les deux blocs nginx
# prepares par CORRECTIFS SEO 13-10 pour helvetic-rohrreinigung.ch, sur
# l hote Hetzner.
#
#   bash hetzner-rohrreinigung-anciennes-adresses.sh --verifier   (lecture seule)
#   bash hetzner-rohrreinigung-anciennes-adresses.sh --poser
#
# CE QU IL POSE, et rien d autre :
#   1. un snippet NEUF, 457 regles location = : une ancienne adresse de commune
#      en noindex, sans barre finale, part en UNE 301 vers une page en index.
#   2. le snippet Legacy deja pose, REMPLACE par la version du depot : seul
#      changement, /einsatz/rohrreinigung-Werktage (deux formes) vise
#      /anliegen/rohrreinigung-24h/ (en index) au lieu de
#      /einsatz/rohrreinigung-24h/ (noindex).
#   3. une ligne include dans le bloc server HTTPS, a cote de celle du snippet
#      G1, donc avant location / et son try_files.
#
# Les deux fichiers a poser sont LUS, jamais ecrits par le script, et leur
# sha256 doit etre exactement celui du depot DE-helvetic-rohrreinigung.ch sur
# main (fusion de la #60). Un octet different arrete tout avant la sauvegarde.
#
# AUCUNE autre ligne du vhost n est touchee. Aucun autre site de l hote n est
# touche : les huit autres vhosts ne sont que MESURES, avant et apres.
#
# Le doublon est cherche AVANT d ecrire : un meme location = defini deux fois
# fait echouer nginx -t. Le script compare les 457 + 4 adresses a poser a
# toutes celles que le vhost definit deja, y compris par ses includes.
#
# nginx n est recharge que si nginx -t est vert. A la moindre anomalie, les
# fichiers sont remis depuis la sauvegarde horodatee et nginx est recharge.
# Verdict REUSSI ou ECART, en derniere ligne, ancre en debut de ligne.
# ============================================================================
set +x
set -u
umask 022
export LC_ALL=C

MODE="${1:-}"
case "$MODE" in
  --verifier|--poser) : ;;
  *)
    echo "Usage : bash hetzner-rohrreinigung-anciennes-adresses.sh --verifier|--poser"
    echo "VERDICT : ECART (mode non reconnu, rien touche)"
    exit 2 ;;
esac

D=helvetic-rohrreinigung.ch
# Prefixe de racine. VIDE en production : tous les chemins ci dessous sont
# alors les vrais. Il n est rempli que par preuves.sh, qui fait tourner le
# script sur un faux /etc/nginx dans un dossier temporaire. Rempli par
# megarde, le script ne trouve pas le vhost et sort en ECART sans rien
# toucher : il ne peut pas se tromper de cible.
RACINE="${REDIR_RACINE_ESSAI:-}"
SE="$RACINE/etc/nginx/sites-enabled"
SN="$RACINE/etc/nginx/snippets"
VHOST="$SE/$D.conf"
SRC="$RACINE/root/redirections-seo-13-10"
NEUF_SRC="$SRC/anciennes-adresses-vers-kanton.conf"
LEGACY_SRC="$SRC/legacy-intention-301.conf"
NEUF_DST="$SN/$D-anciennes-adresses-vers-kanton.conf"
LEGACY_DST="$SN/$D-legacy-intention-301.conf"
G1_DST="$SN/$D-g1-301.conf"
# sha256 des deux fichiers du depot, main apres la fusion de la #60 (480a4ac)
NEUF_SHA=1b729809ca5aabaa53e2f571c300ed098c670c8c89f0fac5535e0bf9bd33d1af
LEGACY_SHA=9f5cb2b0c26d53dd45feef857b3300af4b6c8b31750d042c181e2ab2e690017f
NEUF_REGLES=457
LEGACY_REGLES=4

HORO="$(date -u +%Y%m%dT%H%M%SZ)"
SAUVE="$RACINE/root/nginx-avant-redirections-$D-$HORO.tar.gz"
# Les copies vont dans /root, JAMAIS dans sites-enabled : nginx.conf y inclut
# "sites-enabled/*", sans filtre d extension. Une copie .bak posee la serait
# chargee par nginx et ferait echouer nginx -t (server et location en double).
BAK_VHOST="$RACINE/root/$D.conf.bak-$HORO"
BAK_LEGACY="$RACINE/root/$D-legacy-intention-301.conf.bak-$HORO"
VERROU="$RACINE/home/deploy/.helveticleads-deploy-lock"
TRAV=/tmp/redirections-$$
ANOMALIE=""
ETAPE="demarrage"
POSE_FAITE=0
DELAI_RESEAU=10
DELAI_NGINX=30

# les neuf sites de l hote : accueil mesure avant et apres, apex seulement,
# plus le www du site touche.
SITES="helvetic-dachdecker.ch helvetic-daemmung.ch helvetic-elektriker.ch helvetic-glaserei.ch helvetic-heizung.ch helvetic-kaminfeger.ch helvetic-rohrreinigung.ch helvetic-sanitaer.ch helvetic-schluesseldienst.ch www.helvetic-rohrreinigung.ch"

dire() { printf '%s\n' "$*"; }
ligne() { printf '%s\n' "----------------------------------------------------------------"; }

# code http de l accueil, servi par CET hote (pas de DNS, pas d Internet)
code_accueil() {
  curl -s -o /dev/null -k --connect-timeout 5 --max-time "$DELAI_RESEAU" \
    --resolve "$1:443:127.0.0.1" -w '%{http_code}' "https://$1/" 2>/dev/null || echo 000
}
# code et cible d une adresse, sans suivre la redirection
saut() {
  curl -s -o /dev/null -k --connect-timeout 5 --max-time "$DELAI_RESEAU" \
    --resolve "$D:443:127.0.0.1" -w '%{http_code} %{redirect_url}' "https://$D$1" 2>/dev/null || echo "000 -"
}
robots_de() {
  curl -s -k --connect-timeout 5 --max-time "$DELAI_RESEAU" \
    --resolve "$D:443:127.0.0.1" "https://$D$1" 2>/dev/null \
    | grep -oE '<meta name="robots" content="[^"]*"' | head -1
}

sortie() {
  local rc=$?
  if [ "$rc" -ne 0 ] && [ -z "$ANOMALIE" ]; then
    dire ""; ligne
    dire "INTERROMPU a l etape : $ETAPE"
    [ -f "$SAUVE" ] && dire "   la sauvegarde est $SAUVE"
    [ "$POSE_FAITE" -eq 1 ] && dire "   ATTENTION : les fichiers etaient poses ; verifier nginx -t et l etat servi."
    dire "   ce piege ne fait JAMAIS de retour arriere tout seul."
  fi
  rm -rf "$TRAV" 2>/dev/null
}
trap sortie EXIT

retour_arriere() {
  dire ""; ligne; dire "RETOUR ARRIERE"
  if [ -f "$SAUVE" ]; then
    timeout 120 tar -xzf "$SAUVE" -C "${RACINE:-}/" 2>/dev/null && dire "   fichiers remis depuis $SAUVE"
  else
    dire "   pas de sauvegarde : rien n avait ete pose"
  fi
  local s rc
  s=$(timeout "$DELAI_NGINX" nginx -t 2>&1); rc=$?
  printf '   %s\n' "$s"
  if [ "$rc" -eq 0 ]; then
    timeout "$DELAI_NGINX" systemctl reload nginx && dire "   nginx recharge sur l etat d avant"
  else
    dire "   nginx -t EN FAUTE apres le retour arriere : ne pas recharger, appeler a l aide."
  fi
}

ecart() {
  ANOMALIE="$1"
  dire ""; ligne; dire "ANOMALIE : $ANOMALIE"
  [ "$POSE_FAITE" -eq 1 ] && retour_arriere
  dire ""
  dire "VERDICT : ECART ($ANOMALIE)"
  exit 2
}
# avant toute ecriture : on ne touche a rien
ecart_sec() {
  ANOMALIE="$1"   # pour que le piege de sortie sache que la sortie est voulue
  dire ""; ligne; dire "ANOMALIE : $1"
  dire ""
  dire "VERDICT : ECART (rien touche : $1)"
  exit 2
}

mkdir -p "$TRAV" || { echo "VERDICT : ECART (dossier de travail impossible)"; exit 2; }

dire "================================================================"
dire " $D : anciennes adresses vers une page en index"
dire " mode $MODE, lance le $(date -u '+%Y-%m-%d %H:%M:%S') UTC sur $(hostname)"
dire "================================================================"

# ---------------------------------------------------------------- garde 0
ETAPE="garde 0 : root"
if [ -z "$RACINE" ]; then
  [ "$(id -u)" = "0" ] || ecart_sec "il faut etre root"
  POSE_OPTS="-m 0644 -o root -g root"
else
  dire "garde 0 : essai sous $RACINE, pas de root exige"
  POSE_OPTS="-m 0644"
fi

# ---------------------------------------------------------------- garde 1
ETAPE="garde 1 : hote occupe"
OCCUPE=$(pgrep -a -f 'rsync|apt-get|dpkg|certbot' | grep -v pgrep | head -3)
[ -n "$OCCUPE" ] && { dire "$OCCUPE"; ecart_sec "l hote est occupe"; }
dire "garde 1 : hote libre"

# ---------------------------------------------------------------- garde 2
ETAPE="garde 2 : verrou de deploiement"
if [ -e "$VERROU" ]; then
  dire "   $VERROU existe"
  ecart_sec "le verrou de deploiement est pris"
fi
dire "garde 2 : verrou libre"

# ---------------------------------------------------------------- garde 3
ETAPE="garde 3 : nginx deja en faute"
SORTIE=$(timeout "$DELAI_NGINX" nginx -t 2>&1) || { dire "$SORTIE"; ecart_sec "nginx -t est deja en faute avant toute pose"; }
dire "garde 3 : nginx -t vert avant la pose"

# ---------------------------------------------------------------- garde 4
ETAPE="garde 4 : vhost et includes"
[ -f "$VHOST" ] || ecart_sec "le vhost $VHOST manque"
[ -f "$G1_DST" ] || ecart_sec "le snippet G1 $G1_DST manque"
[ -f "$LEGACY_DST" ] || ecart_sec "le snippet Legacy $LEGACY_DST manque"
N_G1=$(grep -c "^[[:space:]]*include $G1_DST;" "$VHOST")
N_LEG=$(grep -c "^[[:space:]]*include $LEGACY_DST;" "$VHOST")
N_NEUF=$(grep -c "^[[:space:]]*include $NEUF_DST;" "$VHOST")
[ "$N_G1" = "1" ] || ecart_sec "la ligne include du snippet G1 n est pas presente exactement une fois (trouvee $N_G1 fois)"
[ "$N_LEG" = "1" ] || ecart_sec "la ligne include du snippet Legacy n est pas presente exactement une fois (trouvee $N_LEG fois)"
[ "$N_NEUF" = "0" ] || ecart_sec "la ligne include du nouveau snippet est deja dans le vhost"
# le snippet G1 version auto, plus ancien, ne doit pas etre inclus en plus
grep -qE "^[[:space:]]*include .*g1-doublons-rohrreinigung" "$VHOST" && ecart_sec "l ancien snippet G1 version auto est inclus en plus du G1 courant"
dire "garde 4 : vhost $VHOST, G1 et Legacy inclus une fois chacun, nouveau snippet pas encore inclus"

# ---------------------------------------------------------------- garde 5
ETAPE="garde 5 : empreintes des fichiers a poser"
[ -r "$NEUF_SRC" ] || ecart_sec "le fichier a poser $NEUF_SRC manque"
[ -r "$LEGACY_SRC" ] || ecart_sec "le fichier a poser $LEGACY_SRC manque"
S1=$(sha256sum "$NEUF_SRC" | cut -d' ' -f1)
S2=$(sha256sum "$LEGACY_SRC" | cut -d' ' -f1)
[ "$S1" = "$NEUF_SHA" ] || ecart_sec "empreinte du nouveau snippet inattendue : $S1"
[ "$S2" = "$LEGACY_SHA" ] || ecart_sec "empreinte du snippet Legacy inattendu : $S2"
R1=$(grep -c '^[[:space:]]*location = ' "$NEUF_SRC")
R2=$(grep -c '^[[:space:]]*location = ' "$LEGACY_SRC")
[ "$R1" = "$NEUF_REGLES" ] || ecart_sec "le nouveau snippet porte $R1 regles au lieu de $NEUF_REGLES"
[ "$R2" = "$LEGACY_REGLES" ] || ecart_sec "le snippet Legacy porte $R2 regles au lieu de $LEGACY_REGLES"
dire "garde 5 : empreintes exactes, $R1 regles neuves et $R2 regles Legacy"

# ---------------------------------------------------------------- garde 6
# doublons. Toutes les adresses que le vhost definit deja : les location = du
# vhost lui meme, plus celles de chacun de ses includes, SAUF le snippet
# Legacy, qui est remplace, et le nouveau snippet, qui n est pas encore la.
ETAPE="garde 6 : doublons de location"
grep -oE '^[[:space:]]*location = [^ ]+' "$VHOST" | awk '{print $3}' > "$TRAV/deja.txt"
grep -oE '^[[:space:]]*include [^;]+;' "$VHOST" | sed 's/^[[:space:]]*include //; s/;$//' | while read -r inc; do
  [ "$inc" = "$LEGACY_DST" ] && continue
  [ "$inc" = "$NEUF_DST" ] && continue
  for f in $inc; do
    [ -r "$f" ] && grep -oE '^[[:space:]]*location = [^ ]+' "$f" | awk '{print $3}'
  done
done >> "$TRAV/deja.txt"
sort -u "$TRAV/deja.txt" -o "$TRAV/deja.txt"
grep -oE '^[[:space:]]*location = [^ ]+' "$NEUF_SRC" | awk '{print $3}' | sort > "$TRAV/apose.txt"
grep -oE '^[[:space:]]*location = [^ ]+' "$LEGACY_SRC" | awk '{print $3}' | sort >> "$TRAV/apose.txt"
sort "$TRAV/apose.txt" -o "$TRAV/apose.txt"
INTERNE=$(uniq -d "$TRAV/apose.txt")
[ -n "$INTERNE" ] && { dire "$INTERNE"; ecart_sec "les fichiers a poser definissent deux fois la meme adresse"; }
CROISE=$(comm -12 "$TRAV/apose.txt" "$TRAV/deja.txt")
[ -n "$CROISE" ] && { dire "$CROISE"; ecart_sec "adresse deja definie par le vhost ou un de ses includes : nginx -t echouerait"; }
dire "garde 6 : $(awk 'END { print NR }' "$TRAV/deja.txt") adresses deja definies, $(awk 'END { print NR }' "$TRAV/apose.txt") a poser, 0 doublon"

# ---------------------------------------------------------------- mesure avant
ETAPE="mesure avant"
dire ""; ligne; dire "MESURE AVANT"
: > "$TRAV/avant.txt"
for s in $SITES; do
  c=$(code_accueil "$s"); printf '%s %s\n' "$s" "$c" >> "$TRAV/avant.txt"
  dire "   accueil $s : $c"
done
MAUVAIS=$(awk '$2!="200"' "$TRAV/avant.txt")
[ -n "$MAUVAIS" ] && { dire "$MAUVAIS"; ecart_sec "un accueil ne repond pas 200 AVANT la pose"; }

if [ "$MODE" = "--verifier" ]; then
  dire ""; ligne
  dire "Lecture seule : rien n a ete ecrit, rien n a ete recharge."
  dire "VERDICT : REUSSI (verification seule, rien touche)"
  exit 0
fi

# ---------------------------------------------------------------- sauvegarde
ETAPE="sauvegarde"
dire ""; ligne; dire "SAUVEGARDE"
timeout 120 tar -czf "$SAUVE" -C "${RACINE:-}/" etc/nginx/sites-enabled etc/nginx/snippets 2>/dev/null \
  || ecart_sec "la sauvegarde a echoue"
[ -s "$SAUVE" ] || ecart_sec "la sauvegarde est vide"
dire "   $SAUVE ($(wc -c < "$SAUVE") octets)"
cp -p "$VHOST" "$BAK_VHOST" || ecart_sec "copie du vhost impossible"
cp -p "$LEGACY_DST" "$BAK_LEGACY" || ecart_sec "copie du snippet Legacy impossible"
dire "   $BAK_VHOST"
dire "   $BAK_LEGACY"

# ---------------------------------------------------------------- pose
ETAPE="pose des fichiers"
POSE_FAITE=1
dire ""; ligne; dire "POSE"
# shellcheck disable=SC2086
install $POSE_OPTS "$NEUF_SRC" "$NEUF_DST" || ecart "pose du nouveau snippet impossible"
dire "   $NEUF_DST ($R1 regles)"
# shellcheck disable=SC2086
install $POSE_OPTS "$LEGACY_SRC" "$LEGACY_DST" || ecart "remplacement du snippet Legacy impossible"
dire "   $LEGACY_DST ($R2 regles, remplace)"

ETAPE="ligne include dans le vhost"
awk -v g1="$G1_DST" -v neuf="$NEUF_DST" '
  { print }
  !fait && $0 ~ ("^[[:space:]]*include " g1 ";[[:space:]]*$") {
    match($0, /^[[:space:]]*/); indent = substr($0, 1, RLENGTH)
    print indent "include " neuf ";"
    fait = 1
  }
  END { if (!fait) exit 3 }
' "$VHOST" > "$TRAV/vhost.neuf" || ecart "ligne include du snippet G1 introuvable pour ancrer la nouvelle"
D_AVANT=$(awk 'END { print NR }' "$VHOST"); D_APRES=$(awk 'END { print NR }' "$TRAV/vhost.neuf")
[ "$D_APRES" = "$((D_AVANT + 1))" ] || ecart "le vhost gagnerait $((D_APRES - D_AVANT)) lignes au lieu d une"
cat "$TRAV/vhost.neuf" > "$VHOST" || ecart "ecriture du vhost impossible"
dire "   une ligne include ajoutee a cote de celle du G1 ($D_AVANT lignes puis $D_APRES)"
dire "   diff du vhost :"
diff "$BAK_VHOST" "$VHOST" | sed 's/^/      /'

# ---------------------------------------------------------------- nginx -t
ETAPE="nginx -t"
dire ""; ligne; dire "NGINX -T"
SORTIE=$(timeout "$DELAI_NGINX" nginx -t 2>&1); RC=$?
printf '   %s\n' "$SORTIE"
[ "$RC" -eq 0 ] || ecart "nginx -t en faute apres la pose"

# ---------------------------------------------------------------- rechargement
ETAPE="rechargement"
dire ""; ligne; dire "RECHARGEMENT"
timeout "$DELAI_NGINX" systemctl reload nginx || ecart "le rechargement a echoue"
sleep 2
systemctl is-active --quiet nginx || ecart "nginx n est pas actif apres le rechargement"
dire "   nginx recharge et actif"

# ---------------------------------------------------------------- preuves
ETAPE="preuve 1 : les neuf sites"
dire ""; ligne; dire "PREUVES"
: > "$TRAV/apres.txt"
for s in $SITES; do c=$(code_accueil "$s"); printf '%s %s\n' "$s" "$c" >> "$TRAV/apres.txt"; done
if diff -q "$TRAV/avant.txt" "$TRAV/apres.txt" >/dev/null; then
  dire "   preuve 1 : les $(wc -l < "$TRAV/apres.txt") accueils repondent comme avant, tous en 200"
else
  diff "$TRAV/avant.txt" "$TRAV/apres.txt" | sed 's/^/      /'
  ecart "un accueil a change apres la pose"
fi

ETAPE="preuve 2 : les 457 anciennes adresses"
: > "$TRAV/fautes.txt"; : > "$TRAV/cibles.txt"
N=0
while read -r chemin cible; do
  N=$((N + 1))
  lu=$(saut "$chemin"); code=${lu%% *}; vers=${lu#* }
  printf '%s\n' "$cible" >> "$TRAV/cibles.txt"
  if [ "$code" != "301" ]; then
    printf '%s code %s au lieu de 301\n' "$chemin" "$code" >> "$TRAV/fautes.txt"
  elif [ "${vers#https://$D}" != "$cible" ]; then
    printf '%s vers %s au lieu de %s\n' "$chemin" "$vers" "$cible" >> "$TRAV/fautes.txt"
  fi
done < <(grep -oE '^[[:space:]]*location = [^ ]+ \{ return 301 [^;$]+' "$NEUF_DST" | awk '{print $3, $7}')
NF_=$(awk 'END { print NR }' "$TRAV/fautes.txt")
dire "   preuve 2 : $N adresses mesurees, $((N - NF_)) en une seule 301 vers la cible voulue, $NF_ fautes"
[ "$NF_" -gt 0 ] && { head -5 "$TRAV/fautes.txt" | sed 's/^/      /'; ecart "$NF_ anciennes adresses ne font pas la 301 voulue"; }
[ "$N" = "$NEUF_REGLES" ] || ecart "$N adresses mesurees au lieu de $NEUF_REGLES"

ETAPE="preuve 3 : les cibles sont en 200 et en index"
sort -u "$TRAV/cibles.txt" -o "$TRAV/cibles.txt"
: > "$TRAV/fautes.txt"
while read -r c; do
  lu=$(saut "$c"); code=${lu%% *}
  rb=$(robots_de "$c")
  case "$code" in
    200) : ;;
    *) printf '%s code %s : chaine ou page absente\n' "$c" "$code" >> "$TRAV/fautes.txt"; continue ;;
  esac
  case "$rb" in
    *noindex*|*none*) printf '%s est en %s\n' "$c" "$rb" >> "$TRAV/fautes.txt" ;;
    *) : ;;
  esac
done < "$TRAV/cibles.txt"
NF_=$(awk 'END { print NR }' "$TRAV/fautes.txt")
dire "   preuve 3 : $(awk 'END { print NR }' "$TRAV/cibles.txt") cibles distinctes, $NF_ fautes (attendu 0 chaine, 0 noindex)"
[ "$NF_" -gt 0 ] && { cat "$TRAV/fautes.txt" | sed 's/^/      /'; ecart "une cible est en chaine ou en noindex"; }

ETAPE="preuve 4 : le slug Legacy"
lu=$(saut "/einsatz/rohrreinigung-Werktage"); dire "   preuve 4 : /einsatz/rohrreinigung-Werktage $lu"
[ "$lu" = "301 https://$D/anliegen/rohrreinigung-24h/" ] || ecart "le slug Legacy ne vise pas /anliegen/rohrreinigung-24h/"

ETAPE="preuve 5 : la page de commune reste servie en noindex"
RB=$(robots_de "/staedte/aarberg/")
dire "   preuve 5 : /staedte/aarberg/ $(saut "/staedte/aarberg/" | cut -d' ' -f1) $RB"
case "$RB" in *noindex*) : ;; *) ecart "la page de la commune n est plus en noindex, follow" ;; esac
RBK=$(robots_de "/kantone/bern/")
dire "   preuve 5 : /kantone/bern/ $RBK"
case "$RBK" in *noindex*|'') ecart "la page du canton n est pas en index" ;; *) : ;; esac

ETAPE="preuve 6 : cinq exemples"
for s in aarberg wila bilten ennenda brunnen; do
  dire "   preuve 6 : /staedte/$s $(saut "/staedte/$s")"
done

dire ""; ligne
dire "Sauvegarde conservee : $SAUVE"
dire "Retour arriere : tar -xzf $SAUVE -C / && nginx -t && systemctl reload nginx"
dire ""
dire "VERDICT : REUSSI"
exit 0
