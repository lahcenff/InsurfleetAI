# FineTrack UAE — Schéma de base de données (livrable 1)

Fichier source : [`prisma/schema.prisma`](../prisma/schema.prisma). Il est validé avec `prisma validate`.

## Vue d'ensemble

```
Company (tenant) ─┬─ Membership ── User            (auth par e-mail, rôles ADMIN / MANAGER)
                  ├─ Vehicle ─────┐
                  ├─ Party ───────┼── Assignment   (qui conduisait quoi, de quand à quand)
                  │               │
                  ├─ Offense ─────┴── MatchCandidate  (propositions quand « à vérifier »)
                  │     ├── Dispute ── Attachment
                  │     └── StatementLine ── Statement ── Notification
                  ├─ ImportMapping ── ImportBatch ── Connector (futurs connecteurs API)
                  └─ AuditLog
```

## Principes transverses

| Sujet | Choix |
|---|---|
| **Multi-entreprise** | Toutes les tables métier ont un `companyId`. L'application passe par un client Prisma « scopé » qui injecte `companyId` dans chaque requête. On peut ajouter la Row Level Security de Postgres en défense supplémentaire. |
| **Horodatages** | Colonnes `timestamptz`, stockées en UTC. Les heures « nues » des fichiers importés sont interprétées en Asia/Dubai (UTC+4, sans heure d'été), et l'affichage se fait aussi en Asia/Dubai. |
| **Montants** | `Decimal(12,2)` en AED, jamais de nombres flottants. Les arrondis se font ligne par ligne, puis on additionne. |
| **Déduplication** | Une amende est unique par `(companyId, source, externalRef)`. Réimporter le même export Salik ne crée donc pas de doublons. |
| **Traçabilité** | La table `AuditLog` est en ajout seul (avant/après en JSON). Elle est écrite dans la même transaction que la modification. |

## Les tables, une par une

### Company, User, Membership, Session, VerificationToken
- `Company` porte les **paramètres** de l'entreprise :
  - frais de gestion (`feeType` = FIXED ou PERCENT, et `feeValue`) ;
  - TVA sur les frais (5 % par défaut) ;
  - préfixe et compteur des numéros de relevé ;
  - tolérance du rapprochement (`matchGraceMinutes`, 15 min par défaut).
- Un utilisateur peut appartenir à plusieurs entreprises. Son rôle est porté par `Membership`.
- Les tables `Session` et `VerificationToken` servent à Auth.js (lien magique par e-mail).
- Les conducteurs et clients **n'ont pas de compte** : ils accèdent à leur relevé par un lien à jeton (voir `Statement.publicToken`).

### Vehicle
- La plaque est découpée en `emirate` + `plateCode` + `plateNumber`. Une clé normalisée `plateKey` (ex. `DXB-A-12345`) est unique par entreprise et sert au rapprochement.
- Il y a un index secondaire `(emirate, plateNumber)`. Il sert quand l'export ne contient pas le code de plaque : si un seul véhicule correspond, on l'attribue ; sinon le statut est `AMBIGUOUS_PLATE`, donc « à vérifier ».

### Party (conducteur **ou** client)
- Une seule table, avec `type` = DRIVER ou CUSTOMER. Le moteur de rapprochement, les relevés et les notifications fonctionnent ainsi de la même manière pour un conducteur salarié et pour un client de location.
- Champs : nom, WhatsApp (format E.164), e-mail, n° et date d'expiration du permis, Emirates ID, raison sociale pour les clients B2B, langue préférée (pour les messages en EN ou AR).

### Assignment (historique d'attribution)
- Relie `vehicleId` et `partyId` sur un intervalle `[startsAt, endsAt)`. Si `endsAt` est nul, l'attribution est en cours.
- `kind` = contrat de location, affectation ou shift. `reference` contient le n° de contrat ou de shift.
- **Les chevauchements ne sont pas interdits en base.** Les données réelles en contiennent (contrat prolongé, shift mal clôturé). C'est le moteur qui les détecte et passe l'amende en « à vérifier ».
- Toute modification est tracée dans `AuditLog`, pour savoir qui a modifié quelle attribution et quand.

### Offense (amende ou péage)
- **Tel que reçu** : `source` (SALIK, DARB, RTA, POLICE, PARKING…), `category` (péage, amende, parking), n° de référence, plaque brute et décomposée, `occurredAt`, lieu, montant, points noirs, échéance, et la ligne d'origine en JSON (`rawData`).
- **Résultat du rapprochement** :
  - `vehicleId`, `partyId`, `assignmentId` ;
  - `matchStatus` : ASSIGNED (« attribuée »), TO_REVIEW (« à vérifier ») ou UNASSIGNED (« non attribuée ») ;
  - `matchReason`, qui explique le statut.
- `matchLocked` passe à vrai dès qu'un gestionnaire valide ou corrige. Relancer le moteur n'écrase donc jamais une décision humaine.
- `billingStatus` : UNBILLED, BILLED, PAID ou WRITTEN_OFF (perte). Ce champ alimente l'indicateur « refacturé contre non récupéré » du tableau de bord.

### MatchCandidate
- Pour une amende « à vérifier », cette table liste les attributions possibles : plusieurs attributions en cas de chevauchement, ou les attributions juste avant et juste après en cas de trou. L'écran de rapprochement propose ces candidats en un clic.

### Règles du moteur (résumé, détaillées au livrable 2)
Pour une amende sur le véhicule V à l'instant t :
1. Plaque introuvable → **non attribuée** (`UNKNOWN_PLATE`). Plusieurs véhicules possibles → **à vérifier** (`AMBIGUOUS_PLATE`).
2. Attributions de V qui couvrent t :
   - exactement 1 → **attribuée** ;
   - 2 ou plus → **à vérifier** (`OVERLAP`).
   Si t tombe à moins de `matchGraceMinutes` d'une borne d'une autre attribution → **à vérifier** (`NEAR_BOUNDARY`).
3. Aucune attribution ne couvre t :
   - il existe une attribution avant **et** une après → **à vérifier** (`GAP`) ;
   - sinon → **non attribuée** (`NO_ASSIGNMENT`).

### ImportMapping, ImportBatch, Connector
- `ImportMapping` est la **configuration enregistrable par source**. Elle contient :
  - `columnMap`, qui relie un champ attendu à une ou plusieurs colonnes du fichier (ex. date et heure dans deux colonnes séparées) ;
  - le format de date ;
  - des valeurs par défaut (ex. `category = TOLL`, `emirate = DXB`).
- `ImportBatch` trace chaque import : fichier, empreinte SHA-256 (qui alerte si le même fichier est réimporté), nombre de lignes insérées, en doublon ou en erreur, et le détail des erreurs par ligne.
- **Préparation des connecteurs API.** Un connecteur Salik, RTA ou télématique crée simplement un `ImportBatch` avec `channel = API` et passe par le **même pipeline** : normalisation, déduplication, rapprochement. Le cœur de l'outil ne change pas, il suffit d'ajouter un adaptateur.

### Statement et StatementLine (relevés)
- Un relevé couvre un conducteur ou client et une période. Il porte un numéro séquentiel par entreprise (ex. `FT-2026-00042`).
- Les **paramètres de frais sont copiés** (type, valeur, TVA) au moment de l'émission. Changer les réglages plus tard ne modifie donc pas les relevés déjà émis.
- Chaque ligne donne le montant de l'amende, les frais, la TVA et le total. Une amende ne peut figurer que sur un seul relevé actif.
- `publicToken` est un jeton aléatoire (≥ 32 octets). Il donne accès en lecture seule au relevé et à son PDF, sans compte, et peut expirer.
- Le PDF est généré à la demande. L'export comptable CSV est construit à partir des lignes.

### Dispute et Attachment (contestations)
- Il y a au plus une contestation par amende. Statuts : TO_DISPUTE, SUBMITTED, ACCEPTED (amende annulée), REJECTED ou WITHDRAWN.
- Les pièces justificatives sont stockées dans un stockage objet (S3 ou Supabase Storage). La base ne garde que leurs métadonnées.

### Notification
- Chaque tentative d'envoi est enregistrée avec son canal (WHATSAPP ou EMAIL) et son statut (QUEUED, SENT, SIMULATED ou FAILED).
- Si l'e-mail est envoyé en secours après un échec WhatsApp, `fallbackOfId` pointe vers la tentative WhatsApp. En V1, WhatsApp est au statut `SIMULATED`.

### AuditLog
- Chaque entrée contient `actorId` (nul pour le système), `action` (ex. `assignment.update`), l'entité concernée, et l'état avant/après en JSON.
