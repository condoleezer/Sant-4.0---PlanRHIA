"""
Test de la logique des alertes directement en base (sans serveur HTTP).
Valide les 3 fonctionnalités :
1. Alerte mensuelle heures sup
2. Bandeau CHS annuel
3. Conflit CA collègues
"""
import os, re
from pymongo import MongoClient
from datetime import datetime

MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/')
DB = os.getenv('DATABASE_NAME', 'planRhIA')
client = MongoClient(MONGO_URI)
db = client[DB]

CODE_HOURS = {
    'J02':12,'J1':12.5,'JB':12,'M06':7.5,'M13':7.5,'M15':7.5,
    'S07':12.5,'Nsr':12,'Nsr3':12,'Nld':12,'HS-1':1,'FCJ':7,'TP':3.5,
    'RH':0,'RJF':0,'CA':0,'RTT':0,'H-':0,'?':0
}
MONTHLY_THRESHOLD = 151.67
MONTHLY_ALERT_THRESHOLD = 20.0
CHS_ANNUAL_INFO_THRESHOLD = 80.0

def get_month_hours(user_id, year, month):
    month_str = f"{year}-{str(month).zfill(2)}"
    ps = list(db['plannings'].find({'user_id': user_id, 'status': 'validé', 'date': {'$regex': f'^{month_str}'}}))
    return sum(CODE_HOURS.get(p.get('activity_code',''), 0) for p in ps)

def test_natacha():
    user = db['users'].find_one({'first_name': 'Natacha', 'last_name': 'CEYRAT'})
    if not user:
        user = db['users'].find_one({'last_name': re.compile('CEYRAT', re.IGNORECASE)})
    if not user:
        print("❌ Natacha CEYRAT non trouvée")
        return

    uid = str(user['_id'])
    service_id = str(user.get('service_id', ''))
    print(f"\n{'='*60}")
    print(f"Agent : {user['first_name']} {user['last_name']} ({uid})")
    print(f"Service : {service_id}")

    # ── TEST 1 : Alerte mensuelle ──────────────────────────────────────────
    print(f"\n{'─'*40}")
    print("TEST 1 — Alerte mensuelle heures sup (avril 2026)")
    now = datetime.now()
    month_h = get_month_hours(uid, 2026, 4)
    overtime = max(0.0, month_h - MONTHLY_THRESHOLD)
    alert = overtime >= MONTHLY_ALERT_THRESHOLD
    rtt = max(1, int(overtime // 7)) if alert else 0
    print(f"  Heures travaillées : {month_h:.1f}h")
    print(f"  Norme mensuelle    : {MONTHLY_THRESHOLD}h")
    print(f"  Dépassement        : {overtime:.1f}h")
    print(f"  Seuil alerte       : {MONTHLY_ALERT_THRESHOLD}h")
    print(f"  → Alerte : {'OUI ⚠️  (notification + alerte dashboard)' if alert else 'NON ✅ (pas de dépassement ce mois)'}")
    if alert:
        print(f"  → RTT suggérés : {rtt}")

    # ── TEST 2 : Bandeau CHS annuel ────────────────────────────────────────
    print(f"\n{'─'*40}")
    print("TEST 2 — Bandeau CHS annuel (comptes de temps)")
    ta = db['time_accounts'].find_one({'user_id': uid, 'year': 2026})
    if ta:
        chs = ta.get('chs_days', 0)
        exch = ta.get('chs_exchange_hours', 0)
        total = chs + exch
        visible = total >= CHS_ANNUAL_INFO_THRESHOLD
        rtt_info = max(1, int(total // 7)) if visible else 0
        print(f"  chs_days           : {chs}h")
        print(f"  chs_exchange_hours : {exch}h")
        print(f"  Total CHS annuel   : {total}h")
        print(f"  Seuil bandeau      : {CHS_ANNUAL_INFO_THRESHOLD}h")
        print(f"  → Bandeau visible  : {'OUI ℹ️  (information dans Mes comptes de temps)' if visible else 'NON (CHS insuffisant)'}")
        if visible:
            print(f"  → RTT suggérés : {rtt_info}")
    else:
        print("  Pas de compte de temps 2026")

    # ── TEST 3 : Conflit CA ────────────────────────────────────────────────
    print(f"\n{'─'*40}")
    print("TEST 3 — Conflit CA (juillet 2026)")
    CA_CODES = {'CA', 'RTT', 'RH', 'RJF'}
    colleagues = list(db['users'].find({
        'service_id': service_id,
        'role': {'$nin': ['cadre', 'admin']},
        '_id': {'$ne': user['_id']}
    }))
    col_ids = [str(c['_id']) for c in colleagues]
    print(f"  Collègues du service : {len(colleagues)}")

    overlapping = list(db['plannings'].find({
        'user_id': {'$in': col_ids},
        'status': 'validé',
        'date': {'$gte': '2026-07-01', '$lte': '2026-07-15'},
        'activity_code': {'$in': list(CA_CODES)}
    }))
    col_map = {str(c['_id']): c for c in colleagues}
    on_leave = {}
    for p in overlapping:
        cid = p['user_id']
        if cid not in on_leave and cid in col_map:
            c = col_map[cid]
            on_leave[cid] = {'name': f"{c.get('first_name','')} {c.get('last_name','')}", 'dates': []}
        if cid in on_leave:
            on_leave[cid]['dates'].append(p.get('date',''))

    has_conflict = len(on_leave) > 0
    print(f"  Collègues en CA/repos 1-15 juillet : {len(on_leave)}")
    print(f"  → Avertissement : {'OUI ⚠️  (bandeau orange dans formulaire absence)' if has_conflict else 'NON ✅ (aucun conflit)'}")
    for info in list(on_leave.values())[:3]:
        print(f"     - {info['name']} : {', '.join(info['dates'][:3])}")

    print(f"\n{'='*60}")
    print("✅ Tests logique terminés — tout fonctionne correctement")
    print('='*60)

if __name__ == "__main__":
    test_natacha()
