from fastapi import UploadFile
import pandas as pd
from io import BytesIO

async def parse_excel(file: UploadFile):
    contents = await file.read()
    data = pd.read_excel(BytesIO(contents))
    return data.to_dict(orient='records')