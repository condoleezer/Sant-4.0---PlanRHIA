from bson import ObjectId
from fastapi import HTTPException, Depends
from fastapi.params import Header
from jose import jwt
from database.database import db
from fastapi.security import OAuth2PasswordBearer
from datetime import datetime, timedelta, timezone
from jose.exceptions import JWTError

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

SECRET_KEY = "542680"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

def create_token(user_id: str) -> str:
    # Get the current UTC time
    now_utc = datetime.utcnow()
    # Set expiration to 1 hour in the future
    expiration_utc = now_utc + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    # Convert to Unix timestamp (seconds since epoch)
    exp_timestamp = int(expiration_utc.timestamp())

    payload = {
        "user_id": user_id,
        "exp": exp_timestamp
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return token


def get_token(authorization: str = Header(...)):
    print(f"Authorization header: {authorization}")
    if not authorization:
        raise HTTPException(status_code=401, detail="Token manquant")
    if "Bearer" not in authorization:
        raise HTTPException(status_code=401, detail="Token invalide")
    return authorization.replace("Bearer ", "")


def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])  # Remplacez "your_secret_key" par votre clé secrète
        user_id: str = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

