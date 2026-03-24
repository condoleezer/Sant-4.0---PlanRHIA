from bson import ObjectId
from pymongo.database import Database
from typing import List, Dict, Optional
from datetime import datetime

COLLECTION_NAME = "weekly_needs"

def get_weekly_needs_by_pole(db: Database, pole_id: str) -> List[Dict]:
    """Récupère toutes les entrées de semaine type pour un pôle"""
    return list(db[COLLECTION_NAME].find({"pole_id": pole_id}))

def get_weekly_need(db: Database, need_id: str) -> Optional[Dict]:
    """Récupère une entrée de semaine type par ID"""
    return db[COLLECTION_NAME].find_one({"_id": ObjectId(need_id)})

def create_or_update_weekly_need(
    db: Database, 
    pole_id: str, 
    day_of_week: int, 
    needs: Dict[str, int],
    created_by: str,
    service_id: Optional[str] = None
) -> Dict:
    """
    Crée ou met à jour une entrée de semaine type pour un jour donné
    """
    # Vérifier si existe déjà
    query = {
        "pole_id": pole_id,
        "day_of_week": day_of_week
    }
    if service_id:
        query["service_id"] = service_id
    
    existing = db[COLLECTION_NAME].find_one(query)
    
    need_data = {
        "pole_id": pole_id,
        "service_id": service_id,
        "day_of_week": day_of_week,
        "needs": needs,
        "updated_at": datetime.now()
    }
    
    if existing:
        # Mettre à jour
        need_data["created_by"] = existing.get("created_by", created_by)
        need_data["created_at"] = existing.get("created_at", datetime.now())
        db[COLLECTION_NAME].update_one(
            {"_id": existing["_id"]},
            {"$set": need_data}
        )
        return get_weekly_need(db, str(existing["_id"]))
    else:
        # Créer
        need_data["created_by"] = created_by
        need_data["created_at"] = datetime.now()
        result = db[COLLECTION_NAME].insert_one(need_data)
        return get_weekly_need(db, str(result.inserted_id))

def delete_weekly_need(db: Database, need_id: str) -> bool:
    """Supprime une entrée de semaine type"""
    result = db[COLLECTION_NAME].delete_one({"_id": ObjectId(need_id)})
    return result.deleted_count > 0

def delete_all_weekly_needs_by_pole(db: Database, pole_id: str) -> int:
    """Supprime toutes les entrées de semaine type d'un pôle"""
    result = db[COLLECTION_NAME].delete_many({"pole_id": pole_id})
    return result.deleted_count

def generate_daily_needs_from_weekly(
    db: Database,
    pole_id: str,
    start_date: str,
    num_weeks: int
) -> Dict[str, Dict[str, int]]:
    """
    Génère les besoins journaliers pour une période à partir de la semaine type
    
    Args:
        db: Base de données
        pole_id: ID du pôle
        start_date: Date de début (YYYY-MM-DD)
        num_weeks: Nombre de semaines
    
    Returns:
        Dict {date: {shift: count}}
    """
    from datetime import datetime, timedelta
    
    # Récupérer la semaine type
    weekly_needs = get_weekly_needs_by_pole(db, pole_id)
    
    if not weekly_needs:
        return {}
    
    # Créer un mapping jour de semaine -> besoins
    needs_by_day = {}
    for need in weekly_needs:
        day_of_week = need['day_of_week']
        needs_by_day[day_of_week] = need['needs']
    
    # Générer les dates
    start = datetime.strptime(start_date, '%Y-%m-%d')
    daily_needs = {}
    
    for week in range(num_weeks):
        for day_offset in range(7):
            date = start + timedelta(days=week * 7 + day_offset)
            date_str = date.strftime('%Y-%m-%d')
            day_of_week = date.weekday()  # 0=Lundi, 6=Dimanche
            
            # Convertir en format 0=Dim, 1=Lun, ..., 6=Sam
            # Python: 0=Lun, 1=Mar, ..., 6=Dim
            # Nous voulons: 0=Dim, 1=Lun, ..., 6=Sam
            day_index = (day_of_week + 1) % 7
            
            if day_index in needs_by_day:
                daily_needs[date_str] = needs_by_day[day_index].copy()
    
    return daily_needs















