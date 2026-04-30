"""
Script de test pour les fonctionnalités :
1. Alerte heures supplémentaires
2. Avertissement CA collègues
3. Bandeau CHS annuel
"""
import os
import requests
import json

BASE_URL = "https://localhost:8443"
VERIFY_SSL = False  # certificat auto-signé en local

import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def test_monthly_summary(user_id: str, name: str):
    print(f"\n{'='*60}")
    print(f"TEST 1 — Synthèse mensuelle : {name}")
    print('='*60)
    r = requests.get(f"{BASE_URL}/alerts-rtt/monthly-summary/{user_id}?year=2026&month=4", verify=VERIFY_SSL)
    if r.status_code == 200:
        d = r.json()
        print(f"  Heures travaillées avril : {d['month_hours']}h")
        print(f"  Norme mensuelle          : {d['monthly_threshold']}h")
        print(f"  Dépassement              : {d['overtime_month']}h")
        print(f"  RTT suggérés             : {d['rtt_suggested']}")
        print(f"  Alerte déclenchée        : {'OUI ⚠️' if d['alert'] else 'NON ✅'}")
        if d['alert_message']:
            print(f"  Message                  : {d['alert_message']}")
        print(f"\n  Synthèse annuelle :")
        for m in d['monthly_breakdown']:
            flag = " ⚠️" if m['alert'] else ""
            print(f"    {m['month_name']:12} : {m['hours_worked']:6.1f}h  (sup: {m['overtime_hours']:.1f}h){flag}")
        print(f"\n  Total annuel : {d['year_hours']:.1f}h | Sup annuel : {d['year_overtime']:.1f}h")
    else:
        print(f"  ERREUR {r.status_code}: {r.text}")

def test_check_notify(user_id: str, name: str):
    print(f"\n{'='*60}")
    print(f"TEST 2 — Vérification & notification : {name}")
    print('='*60)
    r = requests.post(f"{BASE_URL}/alerts-rtt/check-and-notify/{user_id}", verify=VERIFY_SSL)
    if r.status_code == 200:
        d = r.json()
        if d.get('notified'):
            print(f"  ✅ Notification envoyée !")
            print(f"  Heures sup : {d['overtime_hours']}h")
            print(f"  RTT suggérés : {d['rtt_suggested']}")
            print(f"  Mois : {d['month']}")
        else:
            print(f"  ℹ️  Pas de notification (dépassement insuffisant ou déjà notifié)")
            print(f"  Heures sup ce mois : {d.get('overtime_hours', 0)}h")
    else:
        print(f"  ERREUR {r.status_code}: {r.text}")

def test_ca_conflict(user_id: str, service_id: str, name: str):
    print(f"\n{'='*60}")
    print(f"TEST 3 — Conflit CA : {name}")
    print('='*60)
    # Tester sur une période future
    params = {
        "user_id": user_id,
        "service_id": service_id,
        "start_date": "2026-07-01",
        "end_date": "2026-07-15"
    }
    r = requests.get(f"{BASE_URL}/alerts-rtt/ca-conflict-check", params=params, verify=VERIFY_SSL)
    if r.status_code == 200:
        d = r.json()
        print(f"  Conflit détecté : {'OUI ⚠️' if d['has_conflict'] else 'NON ✅'}")
        print(f"  Collègues en congé : {d['count']}")
        if d['warning']:
            print(f"  Avertissement : {d['warning']}")
        for c in d['colleagues_on_leave']:
            print(f"    - {c['name']} : {', '.join(c['dates'][:3])}")
    else:
        print(f"  ERREUR {r.status_code}: {r.text}")

def test_chs_banner(user_id: str, name: str):
    print(f"\n{'='*60}")
    print(f"TEST 4 — Bandeau CHS annuel : {name}")
    print('='*60)
    from pymongo import MongoClient
    MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/')
    DB = os.getenv('DATABASE_NAME', 'planRhIA')
    client = MongoClient(MONGO_URI)
    db = client[DB]
    ta = db['time_accounts'].find_one({'user_id': user_id, 'year': 2026})
    if ta:
        chs = ta.get('chs_days', 0)
        exch = ta.get('chs_exchange_hours', 0)
        total = chs + exch
        seuil = 80
        print(f"  chs_days          : {chs}h")
        print(f"  chs_exchange_hours: {exch}h")
        print(f"  Total CHS         : {total}h")
        print(f"  Seuil bandeau     : {seuil}h")
        print(f"  Bandeau visible   : {'OUI ℹ️' if total >= seuil else 'NON'}")
        if total >= seuil:
            rtt = max(1, int(total // 7))
            print(f"  RTT suggérés      : {rtt}")
    else:
        print(f"  Pas de compte de temps 2026 pour cet agent")

def main():
    from pymongo import MongoClient
    import re
    MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/')
    DB = os.getenv('DATABASE_NAME', 'planRhIA')
    client = MongoClient(MONGO_URI)
    db = client[DB]

    # Trouver Natacha CEYRAT
    user = db['users'].find_one({'first_name': 'Natacha', 'last_name': 'CEYRAT'})
    if not user:
        user = db['users'].find_one({'last_name': re.compile('CEYRAT', re.IGNORECASE)})

    if not user:
        print("❌ Natacha CEYRAT non trouvée. Vérifiez la base.")
        return

    uid = str(user['_id'])
    service_id = str(user.get('service_id', ''))
    name = f"{user['first_name']} {user['last_name']}"

    print(f"\n🔍 Agent testé : {name} (ID: {uid})")
    print(f"   Service : {service_id}")

    test_monthly_summary(uid, name)
    test_check_notify(uid, name)
    test_ca_conflict(uid, service_id, name)
    test_chs_banner(uid, name)

    print(f"\n{'='*60}")
    print("✅ Tests terminés")
    print('='*60)

if __name__ == "__main__":
    main()
