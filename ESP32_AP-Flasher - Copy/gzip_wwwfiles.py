import os
import gzip
import shutil

def gzip_files(source_folder, destination_folder):
    # Create the destination folder if it doesn't exist
    if not os.path.exists(destination_folder):
        os.makedirs(destination_folder)

    # Walk through all files and subdirectories recursively
    for root, dirs, files in os.walk(source_folder):
        # Calculate relative path from source folder
        rel_path = os.path.relpath(root, source_folder)
        
        # Create corresponding directory structure in destination
        if rel_path != '.':
            dest_dir = os.path.join(destination_folder, rel_path)
            if not os.path.exists(dest_dir):
                os.makedirs(dest_dir)
                print(f"Created directory: {rel_path}/")

        for file in files:
            # Skip hidden files
            if file.startswith('.'):
                continue
                
            source_file_path = os.path.join(root, file)
            
            # Build destination path maintaining directory structure
            if rel_path != '.':
                destination_file_path = os.path.join(destination_folder, rel_path, file + ".gz")
                display_path = f"{rel_path}/{file}"
            else:
                destination_file_path = os.path.join(destination_folder, file + ".gz")
                display_path = file
            
            print(f"Gzipping: {display_path}")
            
            try:
                with open(source_file_path, 'rb') as f_in, gzip.GzipFile(destination_file_path, 'wb', mtime=0) as f_out:
                    shutil.copyfileobj(f_in, f_out)
            except Exception as e:
                print(f"Error compressing {display_path}: {e}")

if __name__ == "__main__":
    source_folder = "wwwroot"  # Replace with the path of the source folder
    destination_folder = "data/www"  # Replace with the path of the destination folder

    gzip_files(source_folder, destination_folder)
