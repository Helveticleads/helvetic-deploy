#!/bin/bash
# ============================================================================
# www-vers-apex.sh : le www d UN domaine part en UNE SEULE 301 vers la forme
# sans www, en https, chemin et parametres conserves.
#
#   bash www-vers-apex.sh --verifier helvetic-pool.ch     (lecture seule)
#   bash www-vers-apex.sh --poser    helvetic-pool.ch
#
# UN DOMAINE A LA FOIS, UN SERVEUR A LA FOIS.
#
# CE QU IL FAIT, et rien d autre. Le vhost est mis a la forme que quatre sites
# de l hote Infomaniak DE servent deja (bettwanzen, nagetiere,
# schaedlingsprofi, wespen-hornissen) :
#   1. le bloc 443 du site perd le www de son server_name ;
#   2. un bloc 443 neuf ne porte que le www, et renvoie 301 vers l apex. Il
#      reprend mot pour mot les lignes listen, ssl_* et include du bloc du
#      site : aucune valeur n est recopiee a la main ;
#   3. le bloc 80 ecrit par certbot (deux if ($host = ...) qui renvoient vers
#      https://$host, puis return 404) devient un seul return 301 vers l apex.
#      C est ce qui supprime la chaine http://www vers https://www vers l apex.
#
# Rien d autre du vhost ne change : ni racine, ni try_files, ni en-tetes, ni
# proxy /api/, ni redirections SEO, ni les autres sites de l hote, qui ne sont
# que MESURES, avant et apres, apex et www.
#
# Le bloc 80 est reecrit en entier : le script refuse donc de travailler s il
# y trouve une seule ligne qu il ne reconnait pas.
#
# nginx n est recharge que si nginx -t est vert. A la moindre anomalie, le
# vhost est remis depuis la copie et nginx est recharge. Verdict REUSSI ou
# ECART, en derniere ligne, ancre en debut de ligne.
# ============================================================================
set +x
set -u
umask 022
export LC_ALL=C

MODE="${1:-}"
D="${2:-}"
case "$MODE" in --verifier|--poser) : ;; *) MODE="" ;; esac
case "$D" in helvetic-pool.ch|helvetic-rohrreinigung.ch) : ;; *) D="" ;; esac
if [ -z "$MODE" ] || [ -z "$D" ]; then
  echo "Usage : bash www-vers-apex.sh --verifier|--poser <helvetic-pool.ch|helvetic-rohrreinigung.ch>"
  echo "VERDICT : ECART (mode ou domaine non reconnu, rien touche)"
  exit 2
fi

# Prefixe de racine. VIDE en production. Rempli uniquement par preuves.sh, qui
# fait tourner le script sur un faux /etc/nginx dans un dossier temporaire.
RACINE="${WWW_RACINE_ESSAI:-}"
SE="$RACINE/etc/nginx/sites-enabled"
VHOST="$SE/$D.conf"
CERT="$RACINE/etc/letsencrypt/live/$D/fullchain.pem"
VERROU="$RACINE/home/deploy/.helveticleads-deploy-lock"
HORO="$(date -u +%Y%m%dT%H%M%SZ)"
# La copie va dans /root, JAMAIS a cote du vhost : nginx.conf inclut
# "sites-enabled/*" sans filtre d extension, une copie posee la serait chargee.
BAK="$RACINE/root/$D.conf.avant-www-$HORO"
SAUVE="$RACINE/root/nginx-avant-www-$D-$HORO.tar.gz"
TRAV="/tmp/www-vers-apex-$$"
ANOMALIE=""
ETAPE="demarrage"
POSE_FAITE=0
REEL=""
DELAI_RESEAU=10
DELAI_NGINX=30

dire() { printf '%s\n' "$*"; }
ligne() { printf '%s\n' "----------------------------------------------------------------"; }

# code http d une adresse servie par CET hote : pas de DNS, pas d Internet.
# $1 = nom, $2 = chemin, $3 = http|https
lu() {
  local n="$1" c="$2" s="${3:-https}" port=443 opt=-k
  [ "$s" = "http" ] && { port=80; opt=""; }
  # shellcheck disable=SC2086
  curl -s -o /dev/null $opt --connect-timeout 5 --max-time "$DELAI_RESEAU" \
    --resolve "$n:$port:127.0.0.1" -w '%{http_code} %{redirect_url}' "$s://$n$c" 2>/dev/null \
    || echo "000 -"
}

sortie() {
  local rc=$?
  if [ "$rc" -ne 0 ] && [ -z "$ANOMALIE" ]; then
    dire ""; ligne
    dire "INTERROMPU a l etape : $ETAPE"
    [ -f "$BAK" ] && dire "   la copie du vhost est $BAK"
    [ "$POSE_FAITE" = "1" ] && dire "   ATTENTION : le vhost etait pose ; verifier nginx -t et l etat servi."
    dire "   ce piege ne fait JAMAIS de retour arriere tout seul."
  fi
  rm -rf "$TRAV" 2>/dev/null
}
trap sortie EXIT

retour_arriere() {
  dire ""; ligne; dire "RETOUR ARRIERE"
  if [ -f "$BAK" ] && [ -n "$REEL" ]; then
    cat "$BAK" > "$REEL" && dire "   $REEL remis depuis $BAK"
  else
    dire "   pas de copie : rien n avait ete pose"
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
  [ "$POSE_FAITE" = "1" ] && retour_arriere
  dire ""
  dire "VERDICT : ECART ($ANOMALIE)"
  exit 2
}
ecart_sec() {
  ANOMALIE="$1"   # pour que le piege de sortie sache que la sortie est voulue
  dire ""; ligne; dire "ANOMALIE : $1"
  dire ""
  dire "VERDICT : ECART (rien touche : $1)"
  exit 2
}

mkdir -p "$TRAV" || { echo "VERDICT : ECART (dossier de travail impossible)"; exit 2; }

dire "================================================================"
dire " $D : le www en une seule 301 vers la forme sans www"
dire " mode $MODE, lance le $(date -u '+%Y-%m-%d %H:%M:%S') UTC sur $(hostname)"
dire "================================================================"

# ---------------------------------------------------------------- garde 0
ETAPE="garde 0 : root"
if [ -z "$RACINE" ]; then
  [ "$(id -u)" = "0" ] || ecart_sec "il faut etre root"
else
  dire "garde 0 : essai sous $RACINE, pas de root exige"
fi

# ---------------------------------------------------------------- garde 1
ETAPE="garde 1 : hote occupe"
OCCUPE=$(pgrep -a -f 'rsync|apt-get|dpkg|certbot' | grep -v pgrep | head -3)
[ -n "$OCCUPE" ] && { dire "$OCCUPE"; ecart_sec "l hote est occupe"; }
[ -e "$VERROU" ] && ecart_sec "le verrou de deploiement est pris"
dire "garde 1 : hote libre, verrou libre"

# ---------------------------------------------------------------- garde 2
ETAPE="garde 2 : nginx deja en faute"
SORTIE=$(timeout "$DELAI_NGINX" nginx -t 2>&1) || { dire "$SORTIE"; ecart_sec "nginx -t est deja en faute avant toute pose"; }
dire "garde 2 : nginx -t vert avant la pose"

# ---------------------------------------------------------------- garde 3
ETAPE="garde 3 : le vhost et sa forme"
[ -f "$VHOST" ] || ecart_sec "le vhost $VHOST manque"
REEL=$(readlink -f "$VHOST")
dire "garde 3 : $VHOST"
[ "$REEL" = "$VHOST" ] || dire "   c est un lien vers $REEL : c est ce fichier qui sera ecrit"

N_SN=$(grep -c "^[[:space:]]*server_name $D www\.$D;" "$VHOST")
[ "$N_SN" = "2" ] || ecart_sec "le vhost ne porte pas deux fois \"server_name $D www.$D;\" (trouve $N_SN fois)"
grep -qE "^[[:space:]]*server_name www\.$D;" "$VHOST" && ecart_sec "un bloc ne portant que le www existe deja : le travail est deja fait"
N_443=$(grep -c "^[[:space:]]*listen 443 ssl;" "$VHOST")
[ "$N_443" = "1" ] || ecart_sec "le vhost porte $N_443 lignes \"listen 443 ssl;\" au lieu d une"
N_SRV=$(grep -c '^server {' "$VHOST")
[ "$N_SRV" = "2" ] || ecart_sec "le vhost porte $N_SRV blocs server au lieu de deux"
dire "   deux blocs server, un seul bloc 443, pas encore de bloc www"

# le bloc 80 est le DERNIER bloc server du fichier
DEBUT80=$(grep -n '^server {' "$VHOST" | tail -1 | cut -d: -f1)
awk -v n="$DEBUT80" 'NR <  n { print }' "$VHOST" > "$TRAV/bloc443"
awk -v n="$DEBUT80" 'NR >= n { print }' "$VHOST" > "$TRAV/bloc80"
grep -q 'listen 80;' "$TRAV/bloc80" || ecart_sec "le dernier bloc server n est pas le bloc 80"
grep -q 'listen 443 ssl;' "$TRAV/bloc443" || ecart_sec "le premier bloc server n est pas le bloc 443"

# ---------------------------------------------------------------- garde 4
# le bloc 80 est reecrit en entier : rien d inconnu ne doit y figurer.
ETAPE="garde 4 : le bloc 80 ne porte rien d inconnu"
INCONNU=$(grep -vE "^[[:space:]]*(#.*)?$|^server \{$|^\}$|^[[:space:]]*if \(\\\$host = (www\.)?$D\) \{$|^[[:space:]]*return 301 https://\\\$host\\\$request_uri;$|^[[:space:]]*\} # managed by Certbot$|^[[:space:]]*listen (80|\[::\]:80);$|^[[:space:]]*server_name $D www\.$D;$|^[[:space:]]*return 404; # managed by Certbot$|^[[:space:]]*return 404;$" "$TRAV/bloc80")
[ -n "$INCONNU" ] && { dire "   lignes non reconnues :"; printf '%s\n' "$INCONNU" | sed 's/^/      /'; ecart_sec "le bloc 80 porte des lignes que le script ne sait pas remplacer"; }
dire "garde 4 : les $(awk 'END { print NR }' "$TRAV/bloc80") lignes du bloc 80 sont toutes reconnues"

# ---------------------------------------------------------------- garde 5
ETAPE="garde 5 : le certificat couvre le www"
if [ -r "$CERT" ]; then
  NOMS=$(openssl x509 -in "$CERT" -noout -text 2>/dev/null | grep -A1 'Subject Alternative Name' | tail -1 | tr -d ' ')
  dire "garde 5 : $NOMS"
  case "$NOMS" in *"DNS:www.$D"*) : ;; *) ecart_sec "le certificat ne couvre pas www.$D" ;; esac
else
  dire "garde 5 : $CERT illisible, controle fait sur le servi a la place"
fi
C=$(lu "www.$D" / https); case "$C" in 000*) ecart_sec "https sur www.$D ne repond pas : certificat ou vhost en cause" ;; esac
case "$C" in 301*) ecart_sec "www.$D redirige deja : le travail est deja fait" ;; esac
dire "   https://www.$D/ repond $C aujourd hui"

# ---------------------------------------------------------------- garde 6
# les lignes listen, ssl_* et include du bloc 443 : elles seront reprises mot
# pour mot dans le bloc du www. Aucune valeur recopiee a la main.
ETAPE="garde 6 : les lignes du bloc 443 a reprendre"
# ipv6only et default_server sont des options de la SOCKET, pas du site : nginx
# refuse de les voir deux fois pour la meme adresse. Elles restent sur le bloc
# du site et sont retirees de la copie, sinon nginx -t echouerait sur
# "duplicate listen options". Sur l hote Hetzner, un seul vhost porte
# ipv6only=on, et c est justement celui de rohrreinigung.
grep -E "^[[:space:]]*(listen (\[::\]:)?443 ssl.*|ssl_certificate .*|ssl_certificate_key .*|include /etc/letsencrypt/.*|ssl_dhparam .*)$" "$TRAV/bloc443" \
  | sed 's/ ipv6only=on//; s/ default_server//' > "$TRAV/ssl"
if grep -qE 'ipv6only|default_server' "$TRAV/bloc443"; then
  dire "garde 6 : ipv6only ou default_server retire de la copie (option de socket, pas du site)"
fi
N_SSL=$(awk 'END { print NR }' "$TRAV/ssl")
[ "$N_SSL" -ge 4 ] || ecart_sec "seulement $N_SSL lignes listen/ssl reprises du bloc 443 : trop peu"
dire "garde 6 : $N_SSL lignes reprises mot pour mot"
sed 's/^/      /' "$TRAV/ssl"

# ---------------------------------------------------------- mesure avant
# tous les domaines de l hote, apex et www, servis par cet hote.
ETAPE="mesure avant"
dire ""; ligne; dire "MESURE AVANT"
grep -hoE '^[[:space:]]*server_name [^;]+;' "$SE"/* 2>/dev/null \
  | sed 's/^[[:space:]]*server_name //; s/;$//' | tr ' ' '\n' \
  | grep -E '^[a-z0-9.-]+\.[a-z]{2,}$' | sed 's/^www\.//' | sort -u > "$TRAV/domaines"
dire "   $(awk 'END { print NR }' "$TRAV/domaines") domaines servis par cet hote"
mesure_tous() {
  : > "$1"
  while read -r n; do
    printf '%-40s %s\n' "$n" "$(lu "$n" / https)" >> "$1"
    printf '%-40s %s\n' "www.$n" "$(lu "www.$n" / https)" >> "$1"
  done < "$TRAV/domaines"
}
mesure_tous "$TRAV/avant"
sed 's/^/   /' "$TRAV/avant"
grep -q "^$D  *200" "$TRAV/avant" || ecart_sec "l accueil de $D ne repond pas 200 AVANT la pose"

PROFOND=$(curl -s -k --connect-timeout 5 --max-time "$DELAI_RESEAU" --resolve "$D:443:127.0.0.1" \
  "https://$D/sitemap.xml" 2>/dev/null | grep -oE '<loc>[^<]+' | sed 's#<loc>##' \
  | sed "s#^https://$D##" | grep -vE '^/?$' | head -1)
[ -n "$PROFOND" ] || PROFOND=/impressum/
dire "   page profonde pour les preuves : $PROFOND"

if [ "$MODE" = "--verifier" ]; then
  dire ""; ligne
  dire "Lecture seule : rien n a ete ecrit, rien n a ete recharge."
  dire "VERDICT : REUSSI (verification seule, rien touche)"
  exit 0
fi

# ---------------------------------------------------------------- sauvegarde
ETAPE="sauvegarde"
dire ""; ligne; dire "SAUVEGARDE"
cp -p "$REEL" "$BAK" || ecart_sec "copie du vhost impossible"
dire "   $BAK ($(wc -c < "$BAK") octets)"
DOSSIERS="etc/nginx/sites-enabled"
[ -d "$RACINE/etc/nginx/sites-available" ] && DOSSIERS="$DOSSIERS etc/nginx/sites-available"
# shellcheck disable=SC2086
timeout 120 tar -czf "$SAUVE" -C "${RACINE:-}/" $DOSSIERS 2>/dev/null \
  || ecart_sec "la sauvegarde complete a echoue"
dire "   $SAUVE ($(wc -c < "$SAUVE") octets)"

# ---------------------------------------------------------------- pose
ETAPE="construction du vhost"
{
  # 1. le bloc du site, sans le www dans son server_name
  sed "s/^\([[:space:]]*\)server_name $D www\.$D;$/\1server_name $D;/" "$TRAV/bloc443"
  # 2. le bloc du www, avec les lignes du bloc 443 reprises mot pour mot
  printf '%s\n' "# www vers l apex, en HTTPS. Pose par ops/www-vers-apex.sh le $HORO."
  printf '%s\n' "server {"
  printf '    %s\n' "server_name www.$D;"
  printf '    %s\n' "return 301 https://$D\$request_uri;"
  printf '\n'
  cat "$TRAV/ssl"
  printf '%s\n' "}"
  printf '\n'
  # 3. le bloc 80, un seul saut vers l apex
  printf '%s\n' "# HTTP vers HTTPS, les deux noms, et toujours vers l apex : un seul saut."
  printf '%s\n' "# Remplace les deux blocs if (\$host = ...) ecrits par certbot --redirect, qui"
  printf '%s\n' "# envoyaient http://www vers https://www, donc en deux sauts avant l apex."
  printf '%s\n' "server {"
  printf '    %s\n' "listen 80;"
  printf '    %s\n' "listen [::]:80;"
  printf '    %s\n' "server_name $D www.$D;"
  printf '    %s\n' "return 301 https://$D\$request_uri;"
  printf '%s\n' "}"
} > "$TRAV/vhost.neuf"

# controles sur le fichier construit, avant de l ecrire
[ "$(grep -c "^[[:space:]]*server_name $D;$" "$TRAV/vhost.neuf")" = "1" ] || ecart_sec "le vhost construit ne porte pas une fois \"server_name $D;\""
[ "$(grep -c "^[[:space:]]*server_name www\.$D;$" "$TRAV/vhost.neuf")" = "1" ] || ecart_sec "le vhost construit ne porte pas une fois \"server_name www.$D;\""
[ "$(grep -c "^[[:space:]]*server_name $D www\.$D;$" "$TRAV/vhost.neuf")" = "1" ] || ecart_sec "le bloc 80 construit ne porte pas les deux noms"
[ "$(grep -c '^server {' "$TRAV/vhost.neuf")" = "3" ] || ecart_sec "le vhost construit ne porte pas trois blocs server"
# hors commentaires : le bloc neuf en PARLE dans un commentaire, c est voulu
grep -vE '^[[:space:]]*#' "$TRAV/vhost.neuf" | grep -q 'if (\$host' \
  && ecart_sec 'le vhost construit porte encore un if ($host = ...)'
for l in 'root ' 'try_files' 'proxy_pass'; do
  A=$(grep -c "$l" "$VHOST"); B=$(grep -c "$l" "$TRAV/vhost.neuf")
  [ "$A" = "$B" ] || ecart_sec "le vhost construit porte $B lignes \"$l\" au lieu de $A"
done

ETAPE="ecriture du vhost"
POSE_FAITE=1
dire ""; ligne; dire "POSE"
cat "$TRAV/vhost.neuf" > "$REEL" || ecart "ecriture du vhost impossible"
dire "   $REEL reecrit. Diff :"
diff "$BAK" "$REEL" | sed 's/^/      /'

# ---------------------------------------------------------------- nginx -t
ETAPE="nginx -t"
dire ""; ligne; dire "NGINX -T"
SORTIE=$(timeout "$DELAI_NGINX" nginx -t 2>&1); RC=$?
printf '   %s\n' "$SORTIE"
[ "$RC" -eq 0 ] || ecart "nginx -t en faute apres la pose"

ETAPE="rechargement"
dire ""; ligne; dire "RECHARGEMENT"
timeout "$DELAI_NGINX" systemctl reload nginx || ecart "le rechargement a echoue"
sleep 2
systemctl is-active --quiet nginx || ecart "nginx n est pas actif apres le rechargement"
dire "   nginx recharge et actif"

# ---------------------------------------------------------------- preuves
dire ""; ligne; dire "PREUVES"

ETAPE="preuve 1 : tous les domaines de l hote"
mesure_tous "$TRAV/apres"
: > "$TRAV/bouge"
# le www du domaine traite DOIT bouger : 200 puis 301. Tout le reste doit etre identique.
diff "$TRAV/avant" "$TRAV/apres" | grep -E '^[<>]' | grep -v "^[<>] www\.$D " > "$TRAV/bouge" || true
if [ -s "$TRAV/bouge" ]; then
  sed 's/^/      /' "$TRAV/bouge"
  ecart "un autre nom que www.$D a change de reponse"
fi
dire "   preuve 1 : $(awk 'END { print NR }' "$TRAV/avant") noms mesures, seul www.$D a change"

ETAPE="preuve 2 : le www en une seule 301"
for essai in "/|https" "$PROFOND|https" "/une-adresse-qui-n-existe-pas/?a=1|https" "/|http"; do
  c="${essai%%|*}"; s="${essai##*|}"
  r=$(lu "www.$D" "$c" "$s")
  dire "   preuve 2 : $s://www.$D$c $r"
  case "$r" in
    "301 https://$D$c") : ;;
    *) ecart "$s://www.$D$c ne fait pas une seule 301 vers https://$D$c" ;;
  esac
done

ETAPE="preuve 3 : l apex est inchange"
r=$(lu "$D" / https);     dire "   preuve 3 : https://$D/ $r";          case "$r" in 200*) : ;; *) ecart "l accueil de $D ne repond plus 200" ;; esac
r=$(lu "$D" "$PROFOND" https); dire "   preuve 3 : https://$D$PROFOND $r"; case "$r" in 200*) : ;; *) ecart "la page profonde de $D ne repond plus 200" ;; esac
r=$(lu "$D" / http);      dire "   preuve 3 : http://$D/ $r"
case "$r" in "301 https://$D/") : ;; *) ecart "http://$D/ ne fait plus une seule 301 vers https://$D/" ;; esac

dire ""; ligne
dire "Copie du vhost : $BAK"
dire "Sauvegarde complete : $SAUVE"
dire "Retour arriere : cat $BAK > $REEL && nginx -t && systemctl reload nginx"
dire ""
dire "VERDICT : REUSSI"
exit 0
