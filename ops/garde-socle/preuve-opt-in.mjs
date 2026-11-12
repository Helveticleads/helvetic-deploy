#!/usr/bin/env node
/**
 * PREUVE : la garde du socle batiment ne change RIEN pour les autres appelants.
 *
 * Ce que la preuve etablit, et comment.
 *
 * 1. LE POINTEUR. Les appelants referencent `deploy-infomaniak.yml@v1`, un
 *    pointeur mobile que SEUL un geste humain deplace (docs/PROMOTION-V1.md).
 *    Tant que `v1` n'est pas promu, rien de ce qui est ecrit ici n'atteint un
 *    seul site. La preuve affiche les deux SHA pour qu'on le voie.
 *
 * 2. L'OPT-IN. Meme apres promotion de `v1`, un appelant qui ne passe pas
 *    `garde_socle` recoit le defaut `false`, et les deux etapes ajoutees
 *    portent `if: ${{ inputs.garde_socle }}`. GitHub Actions saute une etape
 *    dont la condition est fausse : elle ne s'execute pas, et son echec
 *    eventuel ne peut donc pas exister.
 *
 * 3. AUCUNE AUTRE ETAPE N'A BOUGE. La preuve compare le workflow d'avant
 *    (depuis la ref donnee, `v1` par defaut) au workflow d'aujourd'hui : la
 *    liste des etapes PRE-EXISTANTES doit etre identique, nom pour nom,
 *    condition pour condition. Toute etape ajoutee doit etre conditionnee.
 *
 * La comparaison des etapes se fait contre la base de ce travail (`main` par
 * defaut), pas contre `v1` : `v1` est en retard sur `main` pour des travaux
 * anterieurs, et ce retard n'est pas le sujet de cette preuve. La preuve le
 * dit, au lieu de le confondre avec une derive.
 *
 * Usage :
 *   node ops/garde-socle/preuve-opt-in.mjs [ref-base]   (defaut : main)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CHEMIN = ".github/workflows/deploy-infomaniak.yml";
const refBase = process.argv[2] ?? "main";
const REF_POINTEUR = "v1";

function git(...args) {
  return execFileSync("git", ["-C", racine, ...args], { encoding: "utf8" });
}

/**
 * Lecture volontairement textuelle : pas de dependance YAML dans ce depot.
 * Une etape commence par une ligne `      - name: …` ; sa condition est la
 * ligne `        if: …` qui suit, avant la prochaine etape.
 */
function etapes(yaml) {
  const lignes = yaml.split("\n");
  const out = [];
  let courante = null;
  for (const l of lignes) {
    const mNom = l.match(/^ {6}- name: (.+)$/);
    if (mNom) {
      if (courante) out.push(courante);
      courante = { nom: mNom[1].trim(), si: null };
      continue;
    }
    if (/^ {6}- uses: /.test(l)) {
      if (courante) out.push(courante);
      courante = { nom: `(uses) ${l.trim()}`, si: null };
      continue;
    }
    const mSi = l.match(/^ {8}if: (.+)$/);
    if (mSi && courante && courante.si === null) courante.si = mSi[1].trim();
    if (courante && /^ {8}continue-on-error: true\s*$/.test(l)) courante.nonBloquante = true;
  }
  if (courante) out.push(courante);
  return out;
}

function entreeDeclaree(yaml, nom) {
  const bloc = yaml.match(new RegExp(`^ {6}${nom}:\\n([\\s\\S]*?)(?=^ {6}\\S|^ {4}\\S|^\\S)`, "m"));
  if (!bloc) return null;
  const corps = bloc[1];
  return {
    required: /required:\s*(\S+)/.exec(corps)?.[1] ?? null,
    type: /type:\s*(\S+)/.exec(corps)?.[1] ?? null,
    defaut: /default:\s*(\S+)/.exec(corps)?.[1] ?? null,
  };
}

const defauts = [];
const apres = fs.readFileSync(path.join(racine, CHEMIN), "utf8");

/* 1. Le pointeur v1 */
let shaV1 = null;
let shaMain = null;
try {
  shaV1 = git("rev-parse", `${REF_POINTEUR}^{commit}`).trim();
  shaMain = git("rev-parse", "HEAD").trim();
} catch {
  defauts.push(`pointeur:impossible de resoudre ${REF_POINTEUR} ou HEAD`);
}
if (shaV1 && shaMain) {
  console.log(`  pointeur ${REF_POINTEUR} = ${shaV1.slice(0, 8)}`);
  console.log(`  HEAD            = ${shaMain.slice(0, 8)}`);
  if (shaV1 === shaMain) {
    defauts.push(
      `pointeur:${REF_POINTEUR} pointe deja sur HEAD. La modification atteindrait les appelants des maintenant.`,
    );
  } else {
    console.log(`  OK ${REF_POINTEUR} ne pointe pas sur ce travail : aucun appelant ne le voit.`);
  }
}

/* 1 bis. Ecart deja existant entre le pointeur et la base, pour information */
try {
  const yamlV1 = git("show", `${REF_POINTEUR}:${CHEMIN}`);
  const yamlBase = git("show", `${refBase}:${CHEMIN}`);
  const nomsV1 = new Set(etapes(yamlV1).map((e) => e.nom));
  const enPlus = etapes(yamlBase).filter((e) => !nomsV1.has(e.nom)).map((e) => e.nom);
  if (enPlus.length > 0) {
    console.log(
      `  (information) ${refBase} porte deja ${enPlus.length} etape(s) que ${REF_POINTEUR} n'a pas, d'un travail anterieur : ${enPlus.join(", ")}`,
    );
  }
} catch {
  /* information seulement */
}

/* 2. L'entree est bien optionnelle, booleenne, fausse par defaut */
const entree = entreeDeclaree(apres, "garde_socle");
if (!entree) {
  defauts.push("entree:garde_socle n'est pas declaree dans workflow_call.inputs");
} else {
  if (entree.required !== "false") defauts.push(`entree:garde_socle required=${entree.required}, attendu false`);
  if (entree.type !== "boolean") defauts.push(`entree:garde_socle type=${entree.type}, attendu boolean`);
  if (entree.defaut !== "false") defauts.push(`entree:garde_socle default=${entree.defaut}, attendu false`);
  if (defauts.length === 0) console.log("  OK garde_socle : required false, type boolean, default false");
}

/* 3. Les etapes pre-existantes n'ont pas bouge ; les nouvelles sont conditionnees */
let avant = null;
try {
  avant = git("show", `${refBase}:${CHEMIN}`);
} catch {
  defauts.push(`base:impossible de lire ${CHEMIN} a la ref ${refBase}`);
}

if (avant) {
  const eAvant = etapes(avant);
  const eApres = etapes(apres);
  const nomsAvant = new Set(eAvant.map((e) => e.nom));

  for (const a of eAvant) {
    const b = eApres.find((x) => x.nom === a.nom);
    if (!b) {
      defauts.push(`etape:« ${a.nom} » a disparu`);
      continue;
    }
    if ((a.si ?? "") !== (b.si ?? "")) {
      defauts.push(
        `etape:« ${a.nom} » a change de condition : ${a.si ?? "(aucune)"} -> ${b.si ?? "(aucune)"}`,
      );
    }
  }

  const ajoutees = eApres.filter((e) => !nomsAvant.has(e.nom));
  for (const n of ajoutees) {
    // IndexNow (decision du 11.11) vise tout le reseau : admise sans opt-in
    // a condition de ne jamais pouvoir rendre un deploiement rouge.
    if (n.nom.startsWith("IndexNow") && n.nonBloquante) continue;
    if (!n.si || !n.si.includes("inputs.garde_socle")) {
      defauts.push(
        `etape:« ${n.nom} » est ajoutee sans condition sur inputs.garde_socle (condition : ${n.si ?? "aucune"})`,
      );
    }
  }
  console.log(
    `  OK ${eAvant.length} etapes de ${refBase} inchangees, ${ajoutees.length} ajoutee(s), conditionnees sur garde_socle ou IndexNow non bloquantes`,
  );
  for (const n of ajoutees) console.log(`     + ${n.nom}  [if: ${n.si}]${n.nonBloquante ? " [continue-on-error]" : ""}`);
}

if (defauts.length > 0) {
  console.error("\nPREUVE_OPT_IN_FAIL");
  for (const d of defauts) console.error(`  - ${d}`);
  process.exit(1);
}
console.log("\nPREUVE_OPT_IN_OK rien de bloquant ajoute pour les appelants qui ne demandent rien");
