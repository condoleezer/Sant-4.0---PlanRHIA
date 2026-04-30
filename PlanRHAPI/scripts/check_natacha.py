import os
from pymongo import MongoClient

MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/')
DB = os.getenv('DATABASE_NAME', 'planRhIA')
client = MongoClient(MONGO_URI)
db = client[DB]

CODE_HOURS = {
    'J02':12,'J1':12.5,'JB':12,'M06':7.5,'M13':7.5,'M15':7.5,
    'S07':12.5,'Nsr':12,'Nsr3':12,'Nld':12,'HS-1':1,'FCJ':7,'TP':3.5,
    'RH':0,'RJF':0,'CA':0,'RTT':0,'H-':0,'?':0
}

# Trouver Natacha CEYRAT
user = db['users'].find_one({'first_name': 'Natacha', 'last_name': 'CEYRAT'})
if not user:
    import re
    user = db['users'].find_one({'last_name': re.compile('CEYRAT', re.IGNORECASE)})
if not user:
    print('Utilisateur non trouve')
    exit()

uid = str(user['_id'])
print(f"ID: {uid}")
print(f"Nom: {user['first_name']} {user['last_name']}")
print()

# Compte de temps 2026
ta = db['time_accounts'].find_one({'user_id': uid, 'year': 2026})
if ta:
    print(f"chs_days (annuel): {ta.get('chs_days')} jours = {ta.get('chs_days', 0) * 8:.1f}h")
    print(f"chs_exchange_hours: {ta.get('chs_exchange_hours', 0)}h")
else:
    print("Pas de compte de temps 2026")
print()

# Plannings avril 2026
plannings = list(db['plannings'].find({
    'user_id': uid,
    'status': 'valide',
    'date': {'$regex': '^2026-04'}
}))
plannings += list(db['plannings'].find({
    'user_id': uid,
    'status': 'valid\u00e9',
    'date': {'$regex': '^2026-04'}
}))

total_h = sum(CODE_HOURS.get(p.get('activity_code', ''), 0) for p in plannings)
print(f"Plannings avril 2026: {len(plannings)} entrees")
print(f"Heures travaillees avril: {total_h}h")
print(f"Norme mensuelle: 151.67h")
print(f"Depassement mensuel: {max(0, total_h - 151.67):.1f}h")
print()

# Detail des codes
from collections import Counter
codes = Counter(p.get('activity_code', '?') for p in plannings)
print("Codes avril:", dict(codes))
