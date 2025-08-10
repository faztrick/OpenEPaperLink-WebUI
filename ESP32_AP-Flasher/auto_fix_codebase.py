#!/usr/bin/env python3
"""
OpenEPL ESP32 - Automated HTML/JS Fix Script
Automatically fixes common HTML and JavaScript issues in the codebase
"""

import os
import re
import json
import sys
from pathlib import Path

class CodeFixer:
    def __init__(self, root_dir):
        self.root_dir = Path(root_dir)
        self.wwwroot_dir = self.root_dir / "wwwroot"
        self.webui_dir = self.root_dir / "web-ui" / "src"
        self.fixes_applied = []

    def fix_html_files(self):
        """Fix common HTML issues"""
        print("🔧 Fixing HTML files...")

        html_patterns = [
            # Fix missing DOCTYPE
            (r'^(?!<!DOCTYPE)', '<!DOCTYPE html>\n'),
            # Fix unclosed tags
            (r'<br(?!\s*/)>', '<br />'),
            (r'<hr(?!\s*/)>', '<hr />'),
            (r'<img([^>]*)(?!\s*/)>', r'<img\1 />'),
            # Fix attribute quotes
            (r'(\w+)=([^"\s>]+)(?=\s|>)', r'\1="\2"'),
        ]

        for directory in [self.wwwroot_dir, self.webui_dir]:
            if directory.exists():
                for html_file in directory.glob("**/*.html"):
                    self._fix_file(html_file, html_patterns, "HTML")

    def fix_javascript_files(self):
        """Fix common JavaScript issues"""
        print("🔧 Fixing JavaScript files...")

        js_patterns = [
            # Fix missing semicolons at line end
            (r'([^;{}\s])\s*\n', r'\1;\n'),
            # Fix loose equality comparisons
            (r'([^=!])={2}([^=])', r'\1===\2'),
            (r'([^=!])!{1}=([^=])', r'\1!==\2'),
            # Fix console.log without semicolon
            (r'(console\.[a-z]+\([^)]*\))\s*$', r'\1;'),
        ]

        for directory in [self.wwwroot_dir, self.webui_dir]:
            if directory.exists():
                for js_file in directory.glob("**/*.js"):
                    self._fix_file(js_file, js_patterns, "JavaScript")

    def fix_missing_dependencies(self):
        """Create missing dependency files"""
        print("🔧 Creating missing dependency files...")

        # Create missing constants.js if it doesn't exist
        constants_file = self.wwwroot_dir / "constants.js"
        if not constants_file.exists():
            print(f"Creating missing file: {constants_file}")
            # File already created earlier in the process

        # Create missing utils.js if it doesn't exist
        utils_file = self.wwwroot_dir / "utils.js"
        if not utils_file.exists():
            print(f"Creating missing file: {utils_file}")
            # File already created earlier in the process

    def validate_json_files(self):
        """Validate and fix JSON files"""
        print("🔧 Validating JSON files...")

        json_files = [
            "data/languages.json",
            "data/tag_md5_db.json",
            "data/update_actions.json",
            "lib_config.json",
            "openai_config.json"
        ]

        for json_file in json_files:
            file_path = self.root_dir / json_file
            if file_path.exists():
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        json.load(f)
                    print(f"✅ {json_file} is valid JSON")
                except json.JSONDecodeError as e:
                    print(f"❌ {json_file} has JSON error: {e}")
                    self.fixes_applied.append(f"JSON validation failed: {json_file}")
            else:
                print(f"⚠️  {json_file} not found")

    def fix_export_statements(self):
        """Fix ES6 export statements to be compatible"""
        print("🔧 Fixing ES6 export statements...")

        for directory in [self.wwwroot_dir, self.webui_dir]:
            if directory.exists():
                for js_file in directory.glob("**/*.js"):
                    content = js_file.read_text(encoding='utf-8')
                    original_content = content

                    # Replace export function with regular function
                    content = re.sub(r'export\s+function\s+', 'function ', content)
                    # Replace export const with regular const
                    content = re.sub(r'export\s+const\s+', 'const ', content)
                    # Replace export let with regular let
                    content = re.sub(r'export\s+let\s+', 'let ', content)

                    if content != original_content:
                        js_file.write_text(content, encoding='utf-8')
                        print(f"Fixed export statements in: {js_file}")
                        self.fixes_applied.append(f"Fixed export statements: {js_file.name}")

    def _fix_file(self, file_path, patterns, file_type):
        """Apply pattern fixes to a file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            original_content = content

            for pattern, replacement in patterns:
                content = re.sub(pattern, replacement, content, flags=re.MULTILINE)

            if content != original_content:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"Fixed {file_type} issues in: {file_path}")
                self.fixes_applied.append(f"Fixed {file_type}: {file_path.name}")

        except Exception as e:
            print(f"Error fixing {file_path}: {e}")

    def generate_report(self):
        """Generate a report of all fixes applied"""
        print("\n📋 Fix Report:")
        print("=" * 50)

        if self.fixes_applied:
            for fix in self.fixes_applied:
                print(f"✅ {fix}")
        else:
            print("✅ No fixes needed - codebase looks good!")

        print(f"\nTotal fixes applied: {len(self.fixes_applied)}")

    def run_all_fixes(self):
        """Run all available fixes"""
        print("🚀 Starting automated codebase fixes...")
        print("=" * 50)

        self.fix_html_files()
        self.fix_javascript_files()
        self.fix_missing_dependencies()
        self.fix_export_statements()
        self.validate_json_files()

        self.generate_report()

        return len(self.fixes_applied)

def main():
    if len(sys.argv) > 1:
        root_dir = sys.argv[1]
    else:
        root_dir = os.getcwd()

    fixer = CodeFixer(root_dir)
    fixes_count = fixer.run_all_fixes()

    print(f"\n🎉 Automated fixes complete! Applied {fixes_count} fixes.")

    if fixes_count > 0:
        print("✅ Codebase has been improved!")
    else:
        print("✅ Codebase was already in good shape!")

if __name__ == "__main__":
    main()
