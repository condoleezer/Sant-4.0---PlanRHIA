from bson import ObjectId
from fastapi import HTTPException

from database.database import asks


async def create_ask(ask_info):
    try:
        # Utilisez 'insert_one' sans 'await'
        db_response = asks.insert_one(ask_info)

        # Récupérez l'ID du document inséré
        ask_id = db_response.inserted_id

        print("ask créé avec succès")

        return {"message": "ask registered successfully", "ask_id": str(ask_id)}

    except Exception as e:
        print(f"Erreur lors de la création du ask : {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")


async def assign_replacer_to_ask():
    print("add users to asks")

async def delete_ask(ask_id):
    try:
        # Utilisez 'insert_one' sans 'await'
        db_response = asks.delete_one({"_id": ObjectId(ask_id)})

        print("ask supprimé avec succès")

        return {"message": "ask supprimé avec succès", "ask_id": str(ask_id)}

    except Exception as e:
        print(f"Erreur lors de la création de l'ask : {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")