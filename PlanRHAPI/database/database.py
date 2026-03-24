from pymongo import MongoClient

client = MongoClient('localhost', 27017)
db = client['planRhIA']
programs = db['annual_programs']
users = db["users"]
services = db["services"]
absences = db["absences"]
speciality = db["speciality"]
roles = db["role"]
codes = db["code"]
asks = db["asks"]
polls = db["polls"]
user_contrat = db["user_contrat"]
missions = db["missions"]
comments = db["comments"]
plannings = db["plannings"]  # Collection des plannings importés
daily_needs_overrides = db["daily_needs_overrides"]  # Exceptions ponctuelles sur les besoins
