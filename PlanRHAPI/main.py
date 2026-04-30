from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles
from pathlib import Path

from routers import (
    user, service, pole, speciality, code, program, absence, asks,
    planning, replacement, replacement_ai, contrat, role, availability,
    time_account, saphir, activite, planning_optimization, hublo_proxy,
    leave_window, planning_exchange, exchange_reciprocity, alerts_rtt
)

app = FastAPI(
    title="PlanRH API",
    description="API pour la gestion des plannings, disponibilités et remplacements",
    version="1.0.0",
    redirect_slashes=False
)

origins = [
    "http://localhost:4200",
    "http://127.0.0.1:4200",
    "https://chaplanifiarh.fr",
    "https://www.chaplanifiarh.fr",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Répondre explicitement aux preflight OPTIONS
@app.options("/{rest_of_path:path}")
async def preflight_handler(rest_of_path: str, request: Request):
    return JSONResponse(
        content={},
        headers={
            "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Credentials": "true",
        }
    )

# =============================================================================
# ROUTERS PRINCIPAUX
# =============================================================================

# Gestion des utilisateurs et authentification
app.include_router(user.router)
app.include_router(role.router)

# Gestion des services et organisation
app.include_router(service.router)
app.include_router(pole.router)
app.include_router(speciality.router)

# Gestion des absences et remplacements
app.include_router(absence.router)
app.include_router(replacement.router)  # Remplacements temporaires (vacataires)
app.include_router(replacement_ai.router)  # Système expert/IA pour suggestions de remplaçants

# Gestion des plannings et disponibilités
app.include_router(planning.router)  # Plannings validés et simulations
app.include_router(availability.router)  # Disponibilités proposées/validées
app.include_router(planning_optimization.router, tags=["planning-optimization"], prefix="")  # Optimisation de planning avec OR-Tools
app.include_router(planning_exchange.router, tags=["planning-exchange"], prefix="")  # Échanges de planning entre agents

# Gestion des contrats et codes d'activité
app.include_router(contrat.router)
app.include_router(code.router)

# Programmes et demandes
app.include_router(program.router)
app.include_router(asks.router)

# Système SAPHIR (alertes et anomalies)
app.include_router(saphir.router, tags=["saphir"], prefix="")
app.include_router(activite.router, tags=["activites"], prefix="") # Ajouter le routeur d'activité

# Gestion des comptes de temps et synthèse des droits
app.include_router(time_account.router)

# Proxy Hublo pour intégration iframe
app.include_router(hublo_proxy.router)

# Gestion des fenêtres de dépôt de congés
app.include_router(leave_window.router)

# Réciprocité des remplacements
app.include_router(exchange_reciprocity.router, tags=["exchange-reciprocity"], prefix="")

# Alertes heures supplémentaires et avertissements CA
app.include_router(alerts_rtt.router, tags=["alerts-rtt"], prefix="")

# Serve static files for Angular app (seulement si le dossier existe)
_dist_path = Path("dist/plan-rh-app")
if _dist_path.exists():
    app.mount("/admin", StaticFiles(directory=str(_dist_path)), name="admin")

@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.get("/health")
async def health_check():
    """Diagnostic endpoint - vérifie la connexion MongoDB"""
    import os
    from pymongo import MongoClient
    mongo_uri = os.getenv("MONGO_URI", os.getenv("MONGODB_URI", os.getenv("MONGODB_URL", "NOT_SET")))
    db_name = os.getenv("DATABASE_NAME", os.getenv("DB_NAME", "planRhIA"))
    
    result = {
        "status": "ok",
        "mongo_uri_set": mongo_uri != "NOT_SET",
        "mongo_uri_preview": mongo_uri[:30] + "..." if len(mongo_uri) > 30 else mongo_uri,
        "db_name": db_name,
    }
    
    try:
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=3000)
        client.admin.command('ping')
        result["mongo_connected"] = True
        db = client[db_name]
        result["collections"] = db.list_collection_names()
    except Exception as e:
        result["mongo_connected"] = False
        result["mongo_error"] = str(e)
    
    return result

@app.get("/hello/{name}")
async def say_hello(name: str):
    return {"message": f"Hello {name}"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=3001, reload=True, log_level="debug")