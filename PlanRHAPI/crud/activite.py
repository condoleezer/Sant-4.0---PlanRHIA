from bson import ObjectId
from pymongo.database import Database
from schemas.activite import ActiviteCreate, ActiviteUpdate

COLLECTION_NAME = "activites"

def get_activite(db: Database, activite_id: str):
    return db[COLLECTION_NAME].find_one({"_id": ObjectId(activite_id)})

def get_activites_by_service(db: Database, service_id: str):
    return list(db[COLLECTION_NAME].find({"service_id": service_id}))

def create_activite(db: Database, activite: ActiviteCreate):
    activite_dict = activite.dict()
    result = db[COLLECTION_NAME].insert_one(activite_dict)
    return get_activite(db, str(result.inserted_id))

def update_activite(db: Database, activite_id: str, activite: ActiviteUpdate):
    db[COLLECTION_NAME].update_one({"_id": ObjectId(activite_id)}, {"$set": activite.dict()})
    return get_activite(db, activite_id)

def delete_activite(db: Database, activite_id: str):
    db[COLLECTION_NAME].delete_one({"_id": ObjectId(activite_id)})
    return {"status": "success", "message": "Activité supprimée"}
