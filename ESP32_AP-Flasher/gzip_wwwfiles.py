import os
import gzip
import shutil

def gzip_files(source_folder, destination_folder):
    # Create the destination folder if it doesn't exist
    if not os.path.exists(destination_folder):
        os.makedirs(destination_folder)

    # Get a list of all files in the source folder
    files = os.listdir(source_folder)

    for file in files:
        source_file_path = os.path.join(source_folder, file)
        destination_file_path = os.path.join(destination_folder, file + ".gz")
        
        # Skip directories and hidden files
        if os.path.isdir(source_file_path) or file.startswith('.'):
            continue
            
        print(f"Gzipping: {file}")
        
        try:
            with open(source_file_path, 'rb') as f_in, gzip.GzipFile(destination_file_path, 'wb', mtime=0) as f_out:
                shutil.copyfileobj(f_in, f_out)
        except Exception as e:
            print(f"Error compressing {file}: {e}")

if __name__ == "__main__":
    source_folder = "wwwroot"  # Replace with the path of the source folder
    destination_folder = "data/www"  # Replace with the path of the destination folder

    gzip_files(source_folder, destination_folder)
