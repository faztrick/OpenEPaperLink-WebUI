import os
import gzip
import shutil
import argparse
from pathlib import Path

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
    parser = argparse.ArgumentParser(description="Recursively gzip UI asset files for embedding into LittleFS / data/www")
    parser.add_argument("--source", "-s", default=None, help="Source folder containing raw (uncompressed) web assets")
    parser.add_argument("--dest", "-d", default="data/www", help="Destination folder for .gz files (default: data/www)")
    parser.add_argument("--clean", action="store_true", help="Remove existing destination folder before processing")
    args = parser.parse_args()

    # Determine default source: prefer web-ui/public/device next to this script, fall back to legacy wwwroot
    script_dir = Path(__file__).parent
    legacy_wwwroot = script_dir.parent / "wwwroot"  # ESP32_AP-Flasher/wwwroot (legacy)
    new_public_device = script_dir / "web-ui" / "public" / "device"

    if args.source:
        source_folder = args.source
    else:
        if new_public_device.exists():
            source_folder = str(new_public_device)
        elif legacy_wwwroot.exists():
            source_folder = str(legacy_wwwroot)
        else:
            raise SystemExit("No source folder found. Provide --source or create web-ui/public/device or wwwroot.")

    destination_folder = args.dest

    if args.clean and os.path.isdir(destination_folder):
        print(f"Cleaning destination: {destination_folder}")
        shutil.rmtree(destination_folder, ignore_errors=True)

    print(f"Source: {source_folder}")
    print(f"Destination: {destination_folder}")
    gzip_files(source_folder, destination_folder)
    print("Done.")
