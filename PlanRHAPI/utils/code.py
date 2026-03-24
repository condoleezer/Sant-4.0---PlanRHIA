import pandas as pd

from extract import get_first_line, extract_name


# Traiter le fichier excel inséré
def extract_code(file_path):
    # Load the Excel file
    xls = pd.ExcelFile(file_path)

    # Initialize dictionaries for each type of data
    code_meanings = {}

    # Loop through each sheet in the Excel file
    for sheet_name in xls.sheet_names:
        # Check for 'planning' in the sheet name for annual programs
        if 'code' in sheet_name.lower() and 'détail' not in sheet_name.lower():
            code_meanings[sheet_name] = {}
            df = pd.read_excel(xls, sheet_name=sheet_name, header=0)
            code_meanings[sheet_name] = df.to_di
    return code_meanings