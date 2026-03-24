from fastapi import HTTPException

from database.database import programs
from utils.program import extract_annual_programs


async def create_annual_program(program_info):
    try:
        annual_programs = extract_annual_programs(program_info['path'])
        # Insérer les programmes annuels
        for program in annual_programs:
            # Insert the entire program dictionary
            programs.insert_one(program)

        print("Programme inséré avec succès")

        return {"message": "Programme inséré avec succès", "program": str(annual_programs)}

    except Exception as e:
        print(f"Erreur lors de la création de l'utilisateur : {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")