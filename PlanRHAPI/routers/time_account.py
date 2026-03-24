"""
Router FastAPI pour les comptes de temps et synthèse des droits
"""

from fastapi import APIRouter, HTTPException, Query
from bson import ObjectId
from typing import Optional
from datetime import datetime
import os
from pymongo import MongoClient
from schemas.time_account import (
    TimeAccountCreate, TimeAccountResponse, TimeAccountUpdate,
    LeaveRightsSummaryCreate, LeaveRightsSummaryResponse, LeaveRightsSummaryUpdate
)
from services.time_calculator import calculate_time_accounts, calculate_leave_rights

# Configuration de la base de données
MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/')
DATABASE_NAME = os.getenv('DATABASE_NAME', 'planRhIA')

client = MongoClient(MONGO_URI)
db = client[DATABASE_NAME]

# Collections MongoDB
time_accounts = db['time_accounts']
leave_rights_summary = db['leave_rights_summary']

router = APIRouter()

# =============================================================================
# ENDPOINTS POUR LES COMPTES DE TEMPS
# =============================================================================

@router.get("/time-accounts/user/{user_id}")
async def get_time_accounts(
    user_id: str,
    reference_date: Optional[str] = Query(None, description="Date de référence (YYYY-MM-DD), défaut: date du jour")
):
    """
    GET /time-accounts/user/{user_id}
    Récupère les comptes de temps d'un utilisateur
    Si reference_date n'est pas fournie, utilise la date du jour
    """
    try:
        # Utiliser la date du jour si non fournie
        if not reference_date:
            reference_date = datetime.now().strftime('%Y-%m-%d')
        
        year = datetime.strptime(reference_date, '%Y-%m-%d').year
        
        # Chercher les comptes existants
        account = time_accounts.find_one({
            "user_id": user_id,
            "reference_date": reference_date,
            "year": year
        })
        
        if account:
            # Récupérer les infos utilisateur
            users_collection = db['users']
            user = users_collection.find_one({"_id": ObjectId(user_id)})
            
            return {
                "message": "Comptes de temps récupérés avec succès",
                "data": TimeAccountResponse(
                    id=str(account["_id"]),
                    user_id=account["user_id"],
                    reference_date=account["reference_date"],
                    year=account["year"],
                    chs_days=account["chs_days"],
                    cfr_days=account["cfr_days"],
                    ca_days=account["ca_days"],
                    rtt_days=account["rtt_days"],
                    cet_days=account["cet_days"],
                    user_name=f"{user.get('first_name', '')} {user.get('last_name', '')}" if user else None,
                    user_matricule=user.get('matricule') if user else None,
                    calculated_at=account.get("calculated_at").isoformat() if account.get("calculated_at") else None,
                    created_at=account.get("created_at").isoformat() if account.get("created_at") else None,
                    updated_at=account.get("updated_at").isoformat() if account.get("updated_at") else None
                )
            }
        else:
            # Si aucun compte n'existe, retourner des valeurs par défaut
            raise HTTPException(
                status_code=404,
                detail="Aucun compte de temps trouvé. Utilisez POST /time-accounts/calculate/{user_id} pour calculer."
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la récupération des comptes de temps: {str(e)}"
        )

@router.post("/time-accounts/calculate/{user_id}")
async def calculate_time_accounts_endpoint(
    user_id: str,
    reference_date: Optional[str] = Query(None, description="Date de référence (YYYY-MM-DD), défaut: date du jour")
):
    """
    POST /time-accounts/calculate/{user_id}
    Calcule et sauvegarde les comptes de temps d'un utilisateur
    Si reference_date n'est pas fournie, utilise la date du jour
    """
    try:
        # Utiliser la date du jour si non fournie
        if not reference_date:
            reference_date = datetime.now().strftime('%Y-%m-%d')
        
        year = datetime.strptime(reference_date, '%Y-%m-%d').year
        
        # Calculer les comptes
        time_account = calculate_time_accounts(user_id, reference_date, year)
        
        # Vérifier si un compte existe déjà
        existing = time_accounts.find_one({
            "user_id": user_id,
            "reference_date": reference_date,
            "year": year
        })
        
        if existing:
            # Mettre à jour
            account_dict = time_account.dict()
            account_dict["updated_at"] = datetime.now()
            time_accounts.update_one(
                {"_id": existing["_id"]},
                {"$set": account_dict}
            )
            account_id = str(existing["_id"])
        else:
            # Créer
            account_dict = time_account.dict()
            result = time_accounts.insert_one(account_dict)
            account_id = str(result.inserted_id)
        
        # Récupérer le compte mis à jour
        updated_account = time_accounts.find_one({"_id": ObjectId(account_id)})
        
        # Récupérer les infos utilisateur pour la réponse
        users_collection = db['users']
        user = users_collection.find_one({"_id": ObjectId(user_id)})
        
        return {
            "message": "Comptes de temps calculés avec succès",
            "data": TimeAccountResponse(
                id=account_id,
                user_id=updated_account["user_id"],
                reference_date=updated_account["reference_date"],
                year=updated_account["year"],
                chs_days=updated_account["chs_days"],
                cfr_days=updated_account["cfr_days"],
                ca_days=updated_account["ca_days"],
                rtt_days=updated_account["rtt_days"],
                cet_days=updated_account["cet_days"],
                user_name=f"{user.get('first_name', '')} {user.get('last_name', '')}" if user else None,
                user_matricule=user.get('matricule') if user else None,
                calculated_at=updated_account.get("calculated_at").isoformat() if updated_account.get("calculated_at") else None,
                created_at=updated_account.get("created_at").isoformat() if updated_account.get("created_at") else None,
                updated_at=updated_account.get("updated_at").isoformat() if updated_account.get("updated_at") else None
            )
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors du calcul des comptes de temps: {str(e)}"
        )

# =============================================================================
# ENDPOINTS POUR LA SYNTHÈSE DES DROITS
# =============================================================================

@router.get("/leave-rights/user/{user_id}")
async def get_leave_rights(
    user_id: str,
    reference_date: Optional[str] = Query(None, description="Date de référence (YYYY-MM-DD), défaut: date du jour")
):
    """
    GET /leave-rights/user/{user_id}
    Récupère la synthèse des droits d'un utilisateur
    Si reference_date n'est pas fournie, utilise la date du jour
    """
    try:
        # Utiliser la date du jour si non fournie
        if not reference_date:
            reference_date = datetime.now().strftime('%Y-%m-%d')
        
        year = datetime.strptime(reference_date, '%Y-%m-%d').year
        
        # Chercher la synthèse existante
        summary = leave_rights_summary.find_one({
            "user_id": user_id,
            "reference_date": reference_date,
            "year": year
        })
        
        if summary:
            # Récupérer les infos utilisateur
            users_collection = db['users']
            user = users_collection.find_one({"_id": ObjectId(user_id)})
            
            return {
                "message": "Synthèse des droits récupérée avec succès",
                "data": LeaveRightsSummaryResponse(
                    id=str(summary["_id"]),
                    user_id=summary["user_id"],
                    reference_date=summary["reference_date"],
                    year=summary["year"],
                    rights=summary["rights"],
                    user_name=f"{user.get('first_name', '')} {user.get('last_name', '')}" if user else None,
                    user_matricule=user.get('matricule') if user else None,
                    calculated_at=summary.get("calculated_at").isoformat() if summary.get("calculated_at") else None,
                    created_at=summary.get("created_at").isoformat() if summary.get("created_at") else None,
                    updated_at=summary.get("updated_at").isoformat() if summary.get("updated_at") else None
                )
            }
        else:
            # Si aucune synthèse n'existe, retourner une erreur
            raise HTTPException(
                status_code=404,
                detail="Aucune synthèse des droits trouvée. Utilisez POST /leave-rights/calculate/{user_id} pour calculer."
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la récupération de la synthèse des droits: {str(e)}"
        )

@router.post("/leave-rights/calculate/{user_id}")
async def calculate_leave_rights_endpoint(
    user_id: str,
    reference_date: Optional[str] = Query(None, description="Date de référence (YYYY-MM-DD), défaut: date du jour")
):
    """
    POST /leave-rights/calculate/{user_id}
    Calcule et sauvegarde la synthèse des droits d'un utilisateur
    Si reference_date n'est pas fournie, utilise la date du jour
    """
    try:
        # Utiliser la date du jour si non fournie
        if not reference_date:
            reference_date = datetime.now().strftime('%Y-%m-%d')
        
        year = datetime.strptime(reference_date, '%Y-%m-%d').year
        
        # Calculer la synthèse
        leave_rights = calculate_leave_rights(user_id, reference_date, year)
        
        # Vérifier si une synthèse existe déjà
        existing = leave_rights_summary.find_one({
            "user_id": user_id,
            "reference_date": reference_date,
            "year": year
        })
        
        if existing:
            # Mettre à jour
            summary_dict = leave_rights.dict()
            summary_dict["updated_at"] = datetime.now()
            leave_rights_summary.update_one(
                {"_id": existing["_id"]},
                {"$set": summary_dict}
            )
            summary_id = str(existing["_id"])
        else:
            # Créer
            summary_dict = leave_rights.dict()
            result = leave_rights_summary.insert_one(summary_dict)
            summary_id = str(result.inserted_id)
        
        # Récupérer la synthèse mise à jour
        updated_summary = leave_rights_summary.find_one({"_id": ObjectId(summary_id)})
        
        # Récupérer les infos utilisateur
        users_collection = db['users']
        user = users_collection.find_one({"_id": ObjectId(user_id)})
        
        return {
            "message": "Synthèse des droits calculée avec succès",
            "data": LeaveRightsSummaryResponse(
                id=summary_id,
                user_id=updated_summary["user_id"],
                reference_date=updated_summary["reference_date"],
                year=updated_summary["year"],
                rights=updated_summary["rights"],
                user_name=f"{user.get('first_name', '')} {user.get('last_name', '')}" if user else None,
                user_matricule=user.get('matricule') if user else None,
                calculated_at=updated_summary.get("calculated_at").isoformat() if updated_summary.get("calculated_at") else None,
                created_at=updated_summary.get("created_at").isoformat() if updated_summary.get("created_at") else None,
                updated_at=updated_summary.get("updated_at").isoformat() if updated_summary.get("updated_at") else None
            )
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors du calcul de la synthèse des droits: {str(e)}"
        )

