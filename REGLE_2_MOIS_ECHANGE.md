# Règle des 2 Mois - Échange de Planning

## Vue d'ensemble

La règle des 2 mois est un mécanisme de gestion automatique des échanges de planning qui permet de simplifier le processus pour les échanges planifiés à l'avance, tout en maintenant un contrôle strict pour les échanges de dernière minute.

## Principe

**Si la date d'échange est à 2 mois ou plus (≥ 60 jours) de la date actuelle:**
- L'échange est considéré comme "planifiable directement"
- Après acceptation par l'agent cible, l'échange est appliqué automatiquement
- Le cadre reçoit une notification d'information (pas de validation requise)

**Si la date d'échange est à moins de 2 mois (< 60 jours):**
- L'échange n'est pas autorisé via le système d'échange
- L'agent doit faire une demande d'absence classique à son encadrement

## Justification

### Avantages de la règle

1. **Autonomie des agents**: Les agents peuvent gérer leurs échanges à l'avance sans attendre la validation du cadre
2. **Réduction de la charge administrative**: Le cadre n'a pas à valider chaque échange planifié longtemps à l'avance
3. **Flexibilité**: Les agents peuvent s'organiser entre eux pour les périodes futures
4. **Contrôle maintenu**: Les échanges de dernière minute restent sous contrôle de l'encadrement
5. **Traçabilité**: Tous les échanges sont enregistrés et le cadre est informé

### Pourquoi 2 mois ?

- **Délai raisonnable**: 60 jours permettent une planification anticipée
- **Stabilité du planning**: Les plannings à 2 mois sont généralement stables
- **Temps de réaction**: Laisse le temps au cadre de réagir si nécessaire
- **Équilibre**: Compromis entre autonomie et contrôle

## Implémentation technique

### Backend (FastAPI)

#### Vérification lors de la création

```python
# Dans routers/planning_exchange.py
today = datetime.now().date()
two_months_from_now = today + timedelta(days=60)

requester_date = datetime.strptime(exchange_data.requester_date, '%Y-%m-%d').date()
target_date = datetime.strptime(exchange_data.target_date, '%Y-%m-%d').date()

if requester_date < two_months_from_now or target_date < two_months_from_now:
    raise HTTPException(
        status_code=422,
        detail={
            "error_code": "EXCHANGE_TOO_SOON",
            "message": "L'échange concerne une date dans moins de 2 mois...",
            "days_until_requester": (requester_date - today).days,
            "days_until_target": (target_date - today).days,
            "minimum_days_required": 60
        }
    )
```

#### Application automatique après acceptation

```python
# Dans routers/planning_exchange.py - respond_to_exchange
is_auto_approved = exchange.get("auto_approved", False)

if is_auto_approved and new_status == "accepté":
    # Échanger directement les plannings
    plannings.update_one(
        {"_id": ObjectId(requester_planning_id)},
        {"$set": {
            "user_id": exchange.get("target_id"),
            "auto_exchanged": True
        }}
    )
    # ... (swap complet)
    
    # Notifier le cadre pour information
    # Notifier les agents (échange effectué)
```

### Frontend (Angular)

#### Indicateur visuel

```typescript
isDateEligibleForExchange(date: any): boolean {
  const targetDate = date instanceof Date ? date : new Date(date);
  const today = new Date();
  const diffDays = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays >= 60;
}
```

#### Gestion de l'erreur

```typescript
if (error.status === 422 && error.error?.detail?.error_code === 'EXCHANGE_TOO_SOON') {
  // Afficher message d'erreur
  // Proposer redirection vers demande d'absence
}
```

## Workflow détaillé

### Cas 1: Échange éligible (≥ 2 mois)

```
1. Agent A sélectionne son planning du 15/08/2026 (dans 128 jours)
   ↓
2. Interface affiche: "✓ Échange direct - Règle des 2 mois"
   ↓
3. Agent A sélectionne le planning d'Agent B du 20/08/2026
   ↓
4. Agent A soumet la demande
   ↓
5. Système crée l'échange avec auto_approved=true
   ↓
6. Agent B reçoit la notification
   ↓
7. Agent B accepte
   ↓
8. Système applique l'échange IMMÉDIATEMENT
   ↓
9. Les deux agents voient le changement dans leur planning
   ↓
10. Cadre reçoit une notification d'information
```

### Cas 2: Échange non éligible (< 2 mois)

```
1. Agent A sélectionne son planning du 15/05/2026 (dans 36 jours)
   ↓
2. Interface affiche: "⚠ Moins de 2 mois - Demande d'absence requise"
   ↓
3. Agent A tente de soumettre
   ↓
4. Système retourne erreur EXCHANGE_TOO_SOON
   ↓
5. Interface affiche: "L'échange concerne une date dans moins de 2 mois..."
   ↓
6. Dialog: "Souhaitez-vous faire une demande d'absence ?"
   ↓
7. Si oui: Redirection vers formulaire de demande d'absence
   ↓
8. Agent A fait une demande d'absence classique
```

## Notifications

### Échange automatique (≥ 2 mois)

**Agent cible:**
```
Titre: Proposition d'échange de planning
Message: [Nom] vous propose d'échanger votre planning du [date] contre son planning du [date]
Type: info
```

**Les deux agents (après acceptation):**
```
Titre: Échange effectué
Message: Votre échange de planning avec [Nom] a été effectué avec succès
Type: success
```

**Cadre (information):**
```
Titre: Échange de planning effectué
Message: Un échange de planning entre [Nom1] et [Nom2] a été effectué automatiquement (règle des 2 mois)
Type: info
Priority: low
```

### Tentative non éligible (< 2 mois)

**Agent demandeur:**
```
Titre: Échange impossible
Message: L'échange concerne une date dans moins de 2 mois. Veuillez faire une demande d'absence à votre encadrement.
Type: warning
Life: 8000ms
```

## Base de données

### Champs ajoutés

```javascript
{
  // ... autres champs
  "auto_approved": true,        // Éligible à l'approbation automatique
  "auto_exchanged": true,       // Échange appliqué automatiquement
  "status": "validé_auto"       // Nouveau statut pour échanges automatiques
}
```

### Requêtes utiles

**Compter les échanges automatiques:**
```javascript
db.planning_exchanges.countDocuments({ status: "validé_auto" })
```

**Lister les échanges du mois:**
```javascript
db.planning_exchanges.find({
  created_at: {
    $gte: new Date("2026-04-01"),
    $lt: new Date("2026-05-01")
  }
})
```

**Statistiques par type:**
```javascript
db.planning_exchanges.aggregate([
  {
    $group: {
      _id: "$status",
      count: { $sum: 1 }
    }
  }
])
```

## Tests recommandés

### Test 1: Échange éligible
```
Date actuelle: 09/04/2026
Date d'échange: 15/06/2026 (67 jours)
Résultat attendu: ✅ Échange créé avec auto_approved=true
```

### Test 2: Échange limite (exactement 60 jours)
```
Date actuelle: 09/04/2026
Date d'échange: 08/06/2026 (60 jours)
Résultat attendu: ✅ Échange créé avec auto_approved=true
```

### Test 3: Échange non éligible
```
Date actuelle: 09/04/2026
Date d'échange: 07/06/2026 (59 jours)
Résultat attendu: ❌ Erreur EXCHANGE_TOO_SOON
```

### Test 4: Application automatique
```
1. Créer échange éligible
2. Agent cible accepte
3. Vérifier que les plannings sont échangés immédiatement
4. Vérifier que status = "validé_auto"
5. Vérifier que auto_exchanged = true
```

### Test 5: Notification cadre
```
1. Créer et accepter échange éligible
2. Vérifier que le cadre reçoit une notification
3. Vérifier que type = "info" et priority = "low"
4. Vérifier que le message mentionne "règle des 2 mois"
```

## Maintenance et évolution

### Paramétrage du délai

Le délai de 2 mois (60 jours) est actuellement codé en dur. Pour le rendre configurable:

1. Ajouter un paramètre dans la configuration du service
2. Stocker dans la base de données (collection `settings`)
3. Permettre au cadre de modifier ce délai

```javascript
// Exemple de configuration
{
  "service_id": "xxx",
  "exchange_min_days": 60,  // Configurable par service
  "updated_at": "2026-04-09"
}
```

### Statistiques et reporting

Ajouter un dashboard pour le cadre:
- Nombre d'échanges automatiques par mois
- Nombre de tentatives refusées (< 2 mois)
- Agents les plus actifs dans les échanges
- Périodes les plus demandées

### Améliorations futures

1. **Délai variable par type de code**: Certains codes pourraient avoir un délai différent
2. **Exceptions**: Permettre au cadre d'autoriser des échanges < 2 mois dans des cas exceptionnels
3. **Quotas**: Limiter le nombre d'échanges automatiques par agent par mois
4. **Historique**: Afficher l'historique des échanges dans le profil de l'agent
5. **Annulation**: Permettre d'annuler un échange automatique dans un délai de X jours

## Conclusion

La règle des 2 mois offre un équilibre optimal entre autonomie des agents et contrôle de l'encadrement. Elle simplifie la gestion des échanges planifiés à l'avance tout en maintenant un processus strict pour les changements de dernière minute.

Cette règle s'inscrit dans une logique de responsabilisation des agents et d'optimisation des processus administratifs, tout en garantissant la qualité et la stabilité des plannings.

Oui, la charte prévoit un quota d'heures supplémentaires (code HS-1) :

≤ 240h par an (Charte p.21) — violation bloquante au-delà
≤ 20h par mois (Charte p.21) — violation bloquante au-delà
Ces limites sont déjà implémentées dans exchange_compliance_service.py avec des avertissements préventifs à partir de 220h/an et 15h/mois.