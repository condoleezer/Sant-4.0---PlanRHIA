import pandas as pd

from extract import get_first_line, extract_name


# Traiter le fichier excel inséré
def extract_annual_programs(file_path):
    # Load the Excel file
    xls = pd.ExcelFile(file_path)

    # Initialize dictionaries for each type of data
    all_programs = []
    monthly_programs = {}
    code_meanings = {}

    # Loop through each sheet in the Excel file
    for sheet_name in xls.sheet_names:
        # Check for 'planning' in the sheet name for annual programs
        if 'planning' in sheet_name.lower():
            # Check for 'agent' in the title and 'mois' not in the title
            if 'agent' in sheet_name.lower() and 'mois' not in sheet_name.lower():
                print(f"Processing sheet: {sheet_name}")
                # Get Agent name
                data = get_first_line(file_path, sheet_name)
                name = extract_name(data)

                # Read only the specified number of rows
                df = pd.read_excel(xls, sheet_name=sheet_name, nrows=34, header=[1, 1])
                annual_program = {'name': name, 'data': {}}
                for month in df.columns.levels[0]:  # Get the unique month names from the first row
                    if month not in annual_program['data']:
                        annual_program['data'][month] = {}

                    # Populate the dictionary with line IDs for each month
                    for index in range(len(df)):
                        if index < len(df) - 1:  # Exclude the last row for regular entries
                            line_id = f"{index + 1}"  # Create a unique line ID
                            # print("month "+ df.iloc[index][month])
                            annual_program['data'][month][line_id] = {
                                'day': df.iloc[index][month][0],  # Adjust based on your actual DataFrame structure
                                'plan': df.iloc[index][month][1]  # Adjust based on your actual DataFrame structure
                            }
                all_programs.append(annual_program)
    return all_programs