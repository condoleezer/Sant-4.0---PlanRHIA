# Implémentation de l'Échange de Planning

## Vue d'ensemble

Cette fonctionnalité permet aux agents de proposer des échanges de planning avec leurs collègues du même service et même métier. Le système garantit que seuls les agents compatibles peuvent échanger leurs plannings, et que tous les échanges sont soumis à la validation du cadre.

## Architecture

### Backend (FastAPI)

#### 1. Schémas (`schemas/planning_exchange.py`)

- `PlanningExchangeCreate`: Création d'une demande d'échange
- `PlanningExchangeResponse`: Réponse à une demande (accepter/refuser)
- `PlanningExchangeValidation`: Validation par le cadre

#### 2. Router (`routers/planning_exchange.py`)

**Endpoints créés:**

- `GET /planning-exchanges/compatible-agents` - Récupère les agents compatibles
  - Critères: même service, même métier (role), plannings validés disponibles
  - Retourne la liste des agents avec leurs plannings échangeables

- `POST /planning-exchanges` - Crée une demande d'échange
  - Vérifie la compatibilité des agents
  - Vérifie que les plannings existent et sont validés
  - Crée une notification pour l'agent cible

- `GET /planning-exchanges` - Récupère les demandes d'échange
  - Filtres: user_id, status
  - Retourne les échanges où l'utilisateur est demandeur ou cible

- `PUT /planning-exchanges/{exchange_id}/respond` - Réponse à une demande
  - L'agent cible accepte ou refuse
  - Si accepté: notification au cadre pour validation
  - Si refusé: notification au demandeur

- `PUT /planning-exchanges/{exchange_id}/validate` - Validation par le cadre
  - Si validé: échange effectif des plannings (swap des user_id)
  - Si refusé: annulation de l'échange
  - Notifications aux deux agents

- `GET /planning-exchanges/pending-validation` - Échanges en attente de validation cadre
  - Filtre par service_id
  - Pour l'interface du cadre

#### 3. Collection MongoDB

**Collection: `planning_exchanges`**

Structure d'un document:
```json
{
  "_id": "ObjectId",
  "requester_id": "string",
  "target_id": "string",
  "requester_date": "YYYY-MM-DD",
  "target_date": "YYYY-MM-DD",
  "requester_planning_id": "string",
  "target_planning_id": "string",
  "message": "string (optionnel)",
  "status": "en_attente | accepté | refusé | validé_auto | validé_cadre | refusé_cadre",
  "auto_approved": "boolean (true si ≥ 2 mois)",
  "created_at": "datetime",
  "updated_at": "datetime",
  "validated_by": "string (cadre_id)",
  "cadre_commentaire": "string (optionnel)"
}
```

### Statuts possibles

- **en_attente**: Demande créée, en attente de réponse de l'agent cible
- **accepté**: Agent cible a accepté, en attente de validation cadre (cas < 2 mois - exceptionnel)
- **refusé**: Agent cible a refusé la demande
- **validé_auto**: Échange accepté et appliqué automatiquement (≥ 2 mois)
- **validé_cadre**: Échange validé par le cadre (cas < 2 mois - exceptionnel)
- **refusé_cadre**: Échange refusé par le cadre (cas < 2 mois - exceptionnel)

### Frontend (Angular)

#### 1. Service (`services/planning-exchange/planning-exchange.service.ts`)

**Méthodes:**
- `getCompatibleAgents(userId, date)` - Récupère les agents compatibles
- `createExchangeRequest(exchangeData)` - Crée une demande
- `getExchanges(userId?, status?)` - Liste les échanges
- `respondToExchange(exchangeId, response, message?)` - Répond à une demande
- `validateExchange(exchangeId, status, cadreId, commentaire?)` - Validation cadre
- `getPendingValidationExchanges(serviceId?)` - Échanges à valider

#### 2. Interface Agent (`pages/secretaire/mon-agenda`)

**Fonctionnalités ajoutées:**

1. **Bouton "Proposer un échange"** dans le modal de modification de planning
   - Visible uniquement si un planning validé existe
   - Ouvre le modal d'échange

2. **Modal d'échange de planning**
   - Affiche le planning de l'agent à échanger
   - Liste les agents compatibles avec leurs plannings disponibles
   - Sélection du planning cible
   - Message optionnel pour expliquer la demande
   - Soumission de la demande

3. **Bouton "Demandes d'échange"** dans le header
   - Badge avec le nombre de demandes en attente
   - Ouvre le modal des demandes reçues

4. **Modal des demandes reçues**
   - Liste des demandes en attente
   - Comparaison visuelle des deux plannings
   - Boutons Accepter/Refuser
   - Affichage du message du demandeur

**Composants modifiés:**
- `mon-agenda.component.ts` - Ajout de la logique d'échange
- `mon-agenda.component.html` - Ajout des modals et boutons
- `mon-agenda.component.css` - Styles pour les nouveaux éléments

#### 3. Interface Cadre (à implémenter)

**À ajouter dans `pages/cadre/planification`:**
- Section "Échanges en attente de validation"
- Liste des échanges acceptés par les deux agents
- Détails de chaque échange (agents, dates, codes)
- Boutons Valider/Refuser avec commentaire optionnel

## Flux de travail

### 1. Proposition d'échange (≥ 2 mois)

```
Agent A → Sélectionne son planning du 15/08/2026 (dans 4 mois)
       → Clique "Proposer un échange"
       → Voit l'indicateur "Échange direct" (règle des 2 mois)
       → Voit la liste des agents compatibles
       → Sélectionne le planning d'Agent B du 20/08/2026
       → Ajoute un message (optionnel)
       → Soumet la demande
```

**Résultat:**
- Création d'un document dans `planning_exchanges` (status: "en_attente", auto_approved: true)
- Notification envoyée à Agent B

### 2. Réponse de l'agent cible (≥ 2 mois)

```
Agent B → Reçoit une notification
       → Ouvre "Demandes d'échange"
       → Voit la proposition d'Agent A
       → Compare les deux plannings
       → Accepte ou Refuse
```

**Si accepté (≥ 2 mois):**
- Status passe à "validé_auto"
- **Échange appliqué immédiatement** (swap des user_id)
- Notification au cadre pour **information uniquement**
- Notifications aux deux agents (échange effectué)

**Si refusé:**
- Status passe à "refusé"
- Notification à Agent A (refus)

### 3. Tentative d'échange (< 2 mois)

```
Agent A → Sélectionne son planning du 15/05/2026 (dans 36 jours)
       → Clique "Proposer un échange"
       → Voit l'avertissement "Moins de 2 mois"
       → Tente de soumettre la demande
       → Reçoit une erreur EXCHANGE_TOO_SOON
       → Dialog: "Souhaitez-vous faire une demande d'absence ?"
       → Redirection vers le formulaire de demande d'absence
```

**Résultat:**
- Aucun échange créé
- L'agent doit utiliser le processus de demande d'absence standard

## Règles de compatibilité et d'éligibilité

Pour qu'un échange soit possible, les conditions suivantes doivent être remplies:

1. **Même service**: Les deux agents doivent appartenir au même service
2. **Même métier**: Les deux agents doivent avoir le même rôle (nurse, vacataire, etc.)
3. **Plannings validés**: Les deux plannings à échanger doivent avoir le status "validé"
4. **Pas de conflit**: Il ne doit pas y avoir d'autre demande en cours pour ces plannings
5. **Règle des 2 mois**: Les dates d'échange doivent être à au moins 2 mois (60 jours) de la date actuelle

### Règle des 2 mois

Cette règle détermine le workflow de l'échange:

**Si la date d'échange est à 2 mois ou plus (≥ 60 jours):**
- ✅ L'échange est **planifiable directement**
- ✅ Après acceptation par l'agent cible, l'échange est **appliqué automatiquement**
- ✅ Le cadre reçoit une **notification d'information** (pas de validation requise)
- ✅ Les deux agents voient immédiatement le changement dans leur planning

**Si la date d'échange est à moins de 2 mois (< 60 jours):**
- ❌ L'échange n'est **pas autorisé**
- ❌ Le système retourne une erreur avec le code `EXCHANGE_TOO_SOON`
- ➡️ L'agent est **redirigé vers le formulaire de demande d'absence**
- ➡️ La demande doit passer par le **processus normal de demande d'absence**

### Calcul de la période

```
Aujourd'hui: 09/04/2026
Date limite: 09/06/2026 (60 jours plus tard)

Exemples:
- Planning du 10/06/2026 → ✅ Éligible (61 jours)
- Planning du 08/06/2026 → ❌ Non éligible (59 jours)
- Planning du 15/08/2026 → ✅ Éligible (128 jours)
```

## Notifications

Le système crée automatiquement des notifications pour:

### Échanges directs (≥ 2 mois)
1. **Agent cible** - Nouvelle demande d'échange reçue
2. **Les deux agents** - Échange effectué automatiquement (après acceptation)
3. **Cadre** - Information sur l'échange effectué (notification d'information)

### Échanges nécessitant validation (< 2 mois - cas exceptionnel)
1. **Agent cible** - Nouvelle demande d'échange reçue
2. **Cadre** - Échange accepté par les deux agents, en attente de validation
3. **Agent demandeur** - Réponse de l'agent cible (accepté/refusé)
4. **Les deux agents** - Validation ou refus du cadre

### Tentatives d'échange non éligibles (< 2 mois)
1. **Agent demandeur** - Message d'erreur avec explication de la règle des 2 mois
2. **Proposition de redirection** - Vers le formulaire de demande d'absence

## Sécurité et Validation

- Vérification de l'appartenance au même service
- Vérification du même métier
- Vérification de l'existence et du statut des plannings
- **Vérification de la règle des 2 mois (60 jours minimum)**
- Validation automatique pour les échanges ≥ 2 mois
- Validation cadre requise pour les échanges < 2 mois (cas exceptionnel)
- Traçabilité complète (created_at, updated_at, validated_by, auto_approved)
- Marquage des échanges automatiques (auto_exchanged: true)

## Tests recommandés

1. **Test de compatibilité**
   - Vérifier que seuls les agents du même service et métier apparaissent
   - Vérifier que seuls les plannings validés sont proposés

2. **Test du flux complet**
   - Créer une demande
   - Accepter la demande
   - Valider par le cadre
   - Vérifier que les plannings sont bien échangés

3. **Test des refus**
   - Refus par l'agent cible
   - Refus par le cadre
   - Vérifier que les plannings restent inchangés

4. **Test des notifications**
   - Vérifier que toutes les notifications sont créées
   - Vérifier le contenu des notifications

5. **Test des cas limites**
   - Demande en double
   - Planning supprimé entre-temps
   - Agent changé de service

## Améliorations futures possibles

1. **Échanges multiples**: Permettre d'échanger plusieurs jours en une seule demande
2. **Historique**: Afficher l'historique des échanges effectués
3. **Statistiques**: Nombre d'échanges par agent, par période
4. **Filtres avancés**: Filtrer les agents compatibles par spécialité, ancienneté, etc.
5. **Suggestions automatiques**: Proposer des échanges pertinents basés sur les préférences
6. **Délai de réponse**: Annulation automatique après X jours sans réponse
7. **Échange en chaîne**: A échange avec B, B échange avec C, etc.

## Fichiers créés/modifiés

### Backend
- ✅ `schemas/planning_exchange.py` (créé)
- ✅ `routers/planning_exchange.py` (créé)
- ✅ `main.py` (modifié - ajout du router)

### Frontend
- ✅ `services/planning-exchange/planning-exchange.service.ts` (créé)
- ✅ `pages/secretaire/mon-agenda/mon-agenda.component.ts` (modifié)
- ✅ `pages/secretaire/mon-agenda/mon-agenda.component.html` (modifié)
- ✅ `pages/secretaire/mon-agenda/mon-agenda.component.css` (modifié)

### À faire
- ⏳ Interface cadre pour valider les échanges
- ⏳ Tests unitaires et d'intégration
- ⏳ Documentation utilisateur

## Conclusion

L'implémentation de base de la fonctionnalité d'échange de planning est complète et fonctionnelle. Les agents peuvent proposer des échanges, les accepter ou les refuser, et le système garantit que seuls les échanges validés par le cadre sont effectivement appliqués. La prochaine étape consiste à implémenter l'interface cadre pour la validation des échanges.
