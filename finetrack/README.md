# FineTrack UAE — MVP

SaaS B2B de rapprochement et de refacturation des amendes et péages pour les flottes aux Émirats : loueurs, sociétés de leasing, flottes de livraison et flottes d'entreprise.

FineTrack importe les exports des portails Salik, Darb, RTA/police et parking. Il retrouve qui conduisait à la minute de chaque infraction, puis refacture l'amende avec des frais de gestion. L'interface est en anglais et en arabe (sens de lecture de droite à gauche), et tous les horodatages sont en Asia/Dubai.

| Livrable | Où |
|---|---|
| 1. Schéma de base de données et explication | [`prisma/schema.prisma`](prisma/schema.prisma), [`docs/SCHEMA.md`](docs/SCHEMA.md) |
| 2. Moteur de rapprochement et tests | [`src/lib/matching/engine.ts`](src/lib/matching/engine.ts), [`engine.test.ts`](src/lib/matching/engine.test.ts) |
| 3. Écrans | [`src/app/(app)/`](src/app/(app)) : import, rapprochement, relevés, tableau de bord, etc. |
| 4. Jeu de données fictif | [`prisma/fixtures.ts`](prisma/fixtures.ts), [`prisma/seed.ts`](prisma/seed.ts), [`sample-data/`](sample-data) |
| 5. Déploiement | ce fichier |

---

## Stack

- **Next.js 16** (App Router, Server Components, Server Actions) et **TypeScript**
- **PostgreSQL** via **Prisma 6**, compatible Supabase, Neon, RDS…
- **Tailwind CSS 4**, avec des propriétés logiques (`ms-`, `pe-`, `text-start`) pour que la mise en page s'inverse automatiquement en arabe
- Authentification par **lien magique e-mail**, sans mot de passe (tables `Session` et `VerificationToken`)
- Bibliothèques : **pdf-lib** (relevés PDF), **exceljs** et **papaparse** (import `.xlsx`/`.csv`), **nodemailer** (SMTP)
- **Vitest** pour les tests unitaires

## Architecture

```
src/
├─ lib/
│  ├─ matching/engine.ts     ← moteur pur (aucun accès base), testé
│  ├─ matching/service.ts    ← exécute le moteur sur la base, décisions manuelles + audit
│  ├─ import/                ← champs attendus, parsing CSV/XLSX, normalisation, configs par source
│  ├─ connectors/            ← interface des futurs connecteurs API (Salik, RTA, télématique)
│  ├─ billing/               ← frais + TVA, relevés, PDF, export comptable
│  ├─ notify/                ← canaux WhatsApp (simulé en V1) et e-mail, avec repli
│  ├─ db.ts                  ← client Prisma « scopé » par entreprise (multi-tenant)
│  ├─ auth.ts                ← lien magique, sessions, rôles ADMIN / MANAGER
│  ├─ time.ts / money.ts / plate.ts  ← Asia/Dubai, AED en fils (entiers), plaques UAE
│  └─ i18n/                  ← dictionnaires en / ar
└─ app/
   ├─ page.tsx               ← page d'accueil et tarifs
   ├─ (app)/…                ← application (auth requise)
   └─ s/[token]              ← relevé public du conducteur / client (sans compte)
```

**Principes**

- **Multi-entreprise.** Toutes les requêtes métier passent par `tenantDb(companyId)`, qui injecte le `companyId` dans chaque `where` et chaque `create`. Le jeu de démo contient 2 entreprises pour le vérifier.
- **Un seul circuit d'ingestion.** Un import CSV/Excel et un futur connecteur API appellent tous deux `runImport()`. Cette fonction enchaîne normalisation, déduplication (`source + n° de référence`), rapprochement et journal d'activité. Ajouter Salik API revient à implémenter l'interface `Connector` de `src/lib/connectors/types.ts`, sans toucher au cœur.
- **Montants.** Ils sont stockés en `Decimal(12,2)` et calculés en entiers (fils), sans jamais passer par des nombres flottants.
- **Horodatages.** Ils sont stockés en UTC. Les heures des fichiers importés sont lues en Asia/Dubai (UTC+4, sans heure d'été), et l'affichage se fait aussi en Asia/Dubai.
- **Décisions manuelles.** Un gestionnaire qui valide ou corrige une amende la verrouille (`matchLocked`). Les relances du moteur ne l'écrasent jamais.
- **Journal d'activité.** Chaque modification d'attribution, de rapprochement, de relevé ou de contestation est écrite dans `AuditLog`, dans la même transaction.

### Règles du moteur de rapprochement

Pour une amende sur la plaque P à l'instant t (intervalles d'attribution `[début, fin)`, fin vide = en cours) :

| Situation | Statut | Raison |
|---|---|---|
| Plaque inconnue | non attribuée | `UNKNOWN_PLATE` |
| Code de plaque absent, plusieurs véhicules possibles | à vérifier | `AMBIGUOUS_PLATE` (candidats proposés) |
| Une seule attribution couvre t | **attribuée** | `SINGLE_MATCH` |
| Plusieurs attributions, même personne | **attribuée** | `SINGLE_MATCH` |
| Plusieurs attributions, personnes différentes | à vérifier | `OVERLAP` |
| t à moins de N minutes d'une remise de véhicule (réglable, 15 par défaut) | à vérifier | `NEAR_BOUNDARY` |
| Entre deux attributions (trou dans l'historique) | à vérifier | `GAP` (avant et après proposés) |
| Avant la première ou après la dernière attribution | non attribuée | `NO_ASSIGNMENT` |

## Démarrage en local

Prérequis : Node.js ≥ 20.9 et PostgreSQL ≥ 14.

```bash
cd finetrack
cp .env.example .env              # renseigner DATABASE_URL
npm install
npm run db:migrate                # crée le schéma (ou: npm run db:push en dev)
npm run db:seed                   # données de démo
npm run dev                       # http://localhost:3000
```

**Connexion.** Sans `SMTP_URL`, aucun e-mail n'est envoyé. Le lien de connexion s'affiche directement sur la page `/login` et dans la console du serveur.

| Compte de démo | Rôle | Entreprise |
|---|---|---|
| `admin@finetrack.demo` | Admin | Desert Wheels Rent A Car LLC (500 amendes) |
| `manager@finetrack.demo` | Gestionnaire | Desert Wheels Rent A Car LLC |
| `ops@gulfexpress.demo` | Admin | Gulf Express Delivery FZE (autre entreprise, pour vérifier l'isolation) |

Toute autre adresse e-mail crée un compte vide et passe par la création d'entreprise.

### Tests

```bash
npm test         # 43 tests : moteur de rapprochement, dates Dubai, plaques, import, frais/TVA
npm run lint     # vérification TypeScript
```

Les tests du moteur couvrent notamment :
- chevauchement d'attributions (personnes différentes, ou même personne) ;
- amende hors de toute attribution (avant, après, dans un trou, véhicule sans historique) ;
- plaque inconnue, plaque d'un autre émirat, code de plaque différent ou absent ;
- bornes incluses et exclues, attribution en cours, marge autour des remises de véhicule, fuseau horaire.

## Jeu de données fictif

`npm run db:seed` génère des données **déterministes** (graine fixe) sur les **3 derniers mois**, jusqu'à aujourd'hui ou jusqu'à `SEED_END_DATE` :

- **50 véhicules** : 36 à Dubaï, 8 à Abu Dhabi, 4 à Sharjah et 2 à Ajman. Modèles courants (Corolla, Sunny, Attrage, Patrol…). 2 sont en maintenance et 1 est vendu en cours de période.
- **30 conducteurs et clients** : 18 conducteurs salariés et 12 clients de location, dont 3 sociétés. Quelques permis sont expirés ou expirent bientôt.
- **Environ 370 attributions** :
  - affectations et shifts avec remise du véhicule à 08:00 et passages à l'atelier ;
  - contrats de location de 2 à 20 jours, avec des jours d'immobilisation entre deux contrats ;
  - 6 doublons qui se chevauchent, volontairement.
- **500 amendes et péages** :
  - Salik au tarif variable (6 AED aux heures de pointe en semaine, 4 AED sinon, gratuit de 1 h à 6 h) ;
  - Darb (4 AED aux heures de pointe) ;
  - amendes RTA / police d'Abu Dhabi (300 à 1 500 AED, avec points noirs) ;
  - parking (100 à 200 AED) ;
  - quelques plaques inconnues, horodatages proches des remises de véhicule, et plaques sans code dans les exports Darb.
- **Activité simulée** : environ 60 % des cas « à vérifier » tranchés, 7 contestations dans tous les statuts, relevés émis pour les 2 mois écoulés (environ 70 % payés pour le plus ancien), notifications envoyées.

Les données passent par **le vrai circuit d'import**, avec les configurations Salik, Darb, RTA et parking. Le seed teste donc aussi l'import.

Pour tester l'import à la main dans une entreprise vide, les mêmes données existent en fichiers CSV au format des portails, dans `sample-data/` (régénérables avec `npm run sample:csv`). Il faut les importer dans l'ordre 1 → 7.

## Déploiement en production

### Option A — Vercel + Supabase (recommandé pour démarrer)

1. **Base de données.** Créer un projet Supabase dans la région la plus proche (`me-central-1`, Émirats, si elle est disponible, sinon `eu-central-1`). Récupérer l'URL Postgres en mode *Session pooler*.
2. **Stockage des pièces jointes.** Dans Supabase → Storage, créer un bucket **privé** nommé `attachments`.
3. **Schéma.** Depuis un poste ou la CI :
   ```bash
   DATABASE_URL="postgresql://…" npm run db:migrate
   ```
4. **Vercel.** Importer le dépôt et choisir `finetrack` comme *Root Directory*. Le framework Next.js est détecté automatiquement, et la commande de build est `npm run build`.
5. **Variables d'environnement** (dans Vercel → Settings → Environment Variables) :

   | Variable | Exemple |
   |---|---|
   | `DATABASE_URL` | `postgresql://postgres.xxx:…@aws-0-….pooler.supabase.com:5432/postgres` |
   | `APP_URL` | `https://app.finetrack.ae` |
   | `SMTP_URL` | `smtps://resend:API_KEY@smtp.resend.com:465` (Resend, SES, Postmark, SendGrid…) |
   | `EMAIL_FROM` | `FineTrack UAE <no-reply@finetrack.ae>` |
   | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | pour les pièces jointes des contestations |

6. **Domaine.** Ajouter le domaine dans Vercel, puis configurer SPF/DKIM chez le fournisseur d'e-mail pour que les liens magiques ne tombent pas en spam.
7. *(Optionnel)* **Données de démo** : lancer `DATABASE_URL=… npm run db:seed` une fois, sur un environnement de préproduction uniquement.

> Limites Vercel : les Server Actions sont configurées pour accepter jusqu'à 20 Mo, mais les fonctions Vercel limitent le corps des requêtes à environ 4,5 Mo. Au-delà (exports de plus de 30 000 lignes), il faut découper le fichier ou passer à l'option B.

### Option B — Serveur ou Docker (VPS, AWS, Azure UAE North…)

```bash
docker build -t finetrack .
docker run -p 3000:3000 --env-file .env -v finetrack_uploads:/app/uploads finetrack
```

Le conteneur lance `prisma migrate deploy` au démarrage. Sans Supabase, les pièces jointes sont stockées dans `/app/uploads` : monter ce dossier en volume persistant. Placer un reverse proxy HTTPS devant (Caddy, Nginx, ALB).

### Checklist avant mise en production

- [ ] `APP_URL` en HTTPS : le cookie de session est `Secure` en production.
- [ ] SMTP configuré et domaine d'envoi vérifié.
- [ ] Sauvegardes Postgres automatiques (PITR sur Supabase Pro).
- [ ] Bucket de pièces jointes **privé**.
- [ ] Row Level Security Postgres en défense supplémentaire (facultatif : l'isolation est déjà assurée par `tenantDb`).
- [ ] Surveillance des erreurs (Sentry…) et des journaux.

## Fonctionnalités V1 — état

| # | Fonctionnalité | État |
|---|---|---|
| 1 | Véhicules (saisie manuelle et import) | ✅ |
| 2 | Conducteurs et clients (WhatsApp, permis, expiration) | ✅ avec alerte « expiré / bientôt » |
| 3 | Attributions (historique, import et saisie, chevauchements signalés) | ✅ |
| 4 | Import CSV/Excel avec correspondance des colonnes et configuration enregistrable par source | ✅ 4 configurations intégrées (Salik, Darb, RTA, parking) |
| 5 | Rapprochement auto, 3 statuts, validation et correction en masse | ✅ |
| 6 | Relevés PDF, frais fixes ou en %, TVA, export comptable CSV | ✅ |
| 7 | Contestations (statuts, pièces jointes) | ✅ |
| 8 | Notifications (interface abstraite, WhatsApp simulé, e-mail réel) | ✅ |
| 9 | Tableau de bord | ✅ |
| — | Multi-entreprise, EN/AR avec RTL, Asia/Dubai, journal d'activité | ✅ |

**Limites connues et pistes pour la V2**
- **PDF en arabe.** Le PDF utilise les polices standard, qui ne couvrent que l'alphabet latin : les noms en arabe y sont remplacés par « ? ». La page web du relevé, elle, affiche l'arabe. Il faudra intégrer une police arabe avec mise en forme (par exemple via `@react-pdf` et HarfBuzz).
- **WhatsApp.** L'envoi est simulé. Pour l'activer, implémenter `MessageChannel` avec l'API Meta WhatsApp Cloud (modèles de messages validés au préalable).
- **Connecteurs API.** Ils sont préparés (`Connector`, table `Connector`, bouton « bientôt » dans les réglages). Il reste à obtenir les accès Salik/RTA et à planifier la synchronisation (cron).
- **Paiement en ligne** des relevés (Stripe, Network International, Telr).
- **Facturation de l'abonnement SaaS** : la grille tarifaire s'affiche sur la page d'accueil, mais le paiement n'est pas branché.
