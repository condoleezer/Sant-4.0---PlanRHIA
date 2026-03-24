"""
Router pour le système expert/IA de suggestions de remplaçants
"""

from fastapi import APIRouter, HTTPException, Query, Body
from typing import Optional, Dict
from pydantic import BaseModel
from services.replacement_ai_service import ReplacementAIService

router = APIRouter()

class ChatRequest(BaseModel):
    absence_id: str
    message: str
    context: Optional[Dict] = None

@router.get("/replacement-ai/suggestions/{absence_id}")
async def get_replacement_suggestions(
    absence_id: str,
    service_id: Optional[str] = Query(None, description="ID du service")
):
    """
    GET /replacement-ai/suggestions/{absence_id}
    Génère des suggestions de remplaçants optimisées par l'IA
    """
    try:
        ai_service = ReplacementAIService(absence_id)
        
        # Si service_id non fourni, le récupérer depuis l'absence
        if not service_id:
            absence = ai_service.absence
            service_id = absence.get("service_id")
            if not service_id:
                raise HTTPException(
                    status_code=400,
                    detail="service_id requis (non fourni dans l'absence)"
                )
        
        suggestions_data = ai_service.generate_suggestions(service_id)
        
        return {
            "message": "Suggestions générées avec succès",
            "data": suggestions_data
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.get("/replacement-ai/evaluate-user/{absence_id}/{user_id}")
async def evaluate_specific_user(
    absence_id: str,
    user_id: str
):
    """
    GET /replacement-ai/evaluate-user/{absence_id}/{user_id}
    Évalue un utilisateur spécifique pour une absence
    """
    try:
        ai_service = ReplacementAIService(absence_id)
        
        # Évaluer l'utilisateur spécifique
        user_evaluation = ai_service.evaluate_specific_user(user_id)
        
        # Récupérer aussi toutes les suggestions pour le contexte (classement)
        absence = ai_service.absence
        service_id = absence.get("service_id")
        if service_id:
            all_suggestions = ai_service.generate_suggestions(service_id)
        else:
            all_suggestions = {"all_evaluations": [], "suggestions": []}
        
        return {
            "message": "Utilisateur évalué avec succès",
            "data": {
                "user_evaluation": user_evaluation,
                "context": all_suggestions
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.post("/replacement-ai/chat")
async def chat_with_ai(chat_request: ChatRequest):
    """
    POST /replacement-ai/chat
    Chat avec l'IA concernant les suggestions
    """
    try:
        ai_service = ReplacementAIService(chat_request.absence_id)
        
        # Générer une réponse contextuelle basée sur le message
        response = ai_service.generate_chat_response(chat_request.message, chat_request.context)
        
        # Récupérer aussi les suggestions pour le contexte
        absence = ai_service.absence
        service_id = absence.get("service_id")
        suggestions_data = None
        if service_id:
            suggestions_data = ai_service.generate_suggestions(service_id)
        
        return {
            "message": "Réponse générée",
            "data": {
                "response": response,
                "suggestions": suggestions_data
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

