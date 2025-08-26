const fs = require('fs');
const path = require('path');

class FileManager {
    constructor(projectRoot) {
        this.projectRoot = path.resolve(projectRoot);
        this.allowedExtensions = new Set([
            '.cpp', '.c', '.h', '.hpp', '.cc', '.cxx',
            '.js', '.json', '.html', '.css', '.md', '.txt',
            '.ini', '.cfg', '.conf', '.xml', '.yaml', '.yml',
            '.py', '.sh', '.ps1', '.bat', '.cmake', '.make',
            '.ino', '.pde', '.csv', '.log'
        ]);
        this.excludedDirs = new Set([
            'node_modules', '.git', '.vscode', 'build', '.pio',
            '__pycache__', '.pytest_cache', 'dist', 'uploads'
        ]);
    }

    // Get file tree structure
    getFileTree(startDir = this.projectRoot, maxDepth = 10) {
        const tree = {
            name: path.basename(startDir),
            path: path.relative(this.projectRoot, startDir) || '.',
            type: 'directory',
            children: []
        };

        if (maxDepth <= 0) return tree;

        try {
            const items = fs.readdirSync(startDir);
            for (const item of items) {
                const itemPath = path.join(startDir, item);
                const stat = fs.statSync(itemPath);
                const relativePath = path.relative(this.projectRoot, itemPath);

                // Skip excluded directories
                if (stat.isDirectory() && this.excludedDirs.has(item)) {
                    continue;
                }

                // Skip hidden files/dirs (starting with .)
                if (item.startsWith('.') && item !== '.gitignore') {
                    continue;
                }

                if (stat.isDirectory()) {
                    const subtree = this.getFileTree(itemPath, maxDepth - 1);
                    tree.children.push(subtree);
                } else {
                    const ext = path.extname(item).toLowerCase();
                    tree.children.push({
                        name: item,
                        path: relativePath,
                        type: 'file',
                        size: stat.size,
                        modified: stat.mtime,
                        extension: ext,
                        editable: this.allowedExtensions.has(ext)
                    });
                }
            }
        } catch (error) {
            console.error(`Error reading directory ${startDir}:`, error.message);
        }

        return tree;
    }

    // Read file content
    readFile(relativePath) {
        const fullPath = path.resolve(this.projectRoot, relativePath);

        // Security check: ensure file is within project
        if (!fullPath.startsWith(this.projectRoot)) {
            throw new Error('Access denied: file outside project directory');
        }

        if (!fs.existsSync(fullPath)) {
            throw new Error('File not found');
        }

        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) {
            throw new Error('Not a file');
        }

        // Check if file is too large (> 1MB)
        if (stat.size > 1024 * 1024) {
            throw new Error('File too large to edit (> 1MB)');
        }

        const content = fs.readFileSync(fullPath, 'utf8');
        const ext = path.extname(fullPath).toLowerCase();

        return {
            path: relativePath,
            name: path.basename(fullPath),
            content,
            size: stat.size,
            modified: stat.mtime,
            extension: ext,
            editable: this.allowedExtensions.has(ext)
        };
    }

    // Write file content
    writeFile(relativePath, content) {
        const fullPath = path.resolve(this.projectRoot, relativePath);

        // Security check
        if (!fullPath.startsWith(this.projectRoot)) {
            throw new Error('Access denied: file outside project directory');
        }

        const ext = path.extname(fullPath).toLowerCase();
        if (!this.allowedExtensions.has(ext)) {
            throw new Error('File type not allowed for editing');
        }

        // Create directory if it doesn't exist
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(fullPath, content, 'utf8');

        const stat = fs.statSync(fullPath);
        return {
            path: relativePath,
            name: path.basename(fullPath),
            size: stat.size,
            modified: stat.mtime
        };
    }

    // Create new file
    createFile(relativePath, content = '') {
        const fullPath = path.resolve(this.projectRoot, relativePath);

        if (!fullPath.startsWith(this.projectRoot)) {
            throw new Error('Access denied: file outside project directory');
        }

        if (fs.existsSync(fullPath)) {
            throw new Error('File already exists');
        }

        return this.writeFile(relativePath, content);
    }

    // Create new directory
    createDirectory(relativePath) {
        const fullPath = path.resolve(this.projectRoot, relativePath);

        if (!fullPath.startsWith(this.projectRoot)) {
            throw new Error('Access denied: directory outside project');
        }

        if (fs.existsSync(fullPath)) {
            throw new Error('Directory already exists');
        }

        fs.mkdirSync(fullPath, { recursive: true });
        return { path: relativePath, name: path.basename(fullPath) };
    }

    // Delete file or directory
    delete(relativePath) {
        const fullPath = path.resolve(this.projectRoot, relativePath);

        if (!fullPath.startsWith(this.projectRoot)) {
            throw new Error('Access denied: path outside project directory');
        }

        if (!fs.existsSync(fullPath)) {
            throw new Error('File or directory not found');
        }

        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(fullPath);
        }

        return { deleted: relativePath };
    }

    // Search for text in files
    searchInFiles(query, fileTypes = [], maxResults = 100) {
        const results = [];
        const searchRegex = new RegExp(query, 'gi');

        const searchDir = (dir, depth = 0) => {
            if (depth > 8 || results.length >= maxResults) return;

            try {
                const items = fs.readdirSync(dir);
                for (const item of items) {
                    if (results.length >= maxResults) break;

                    const itemPath = path.join(dir, item);
                    const stat = fs.statSync(itemPath);
                    const relativePath = path.relative(this.projectRoot, itemPath);

                    if (stat.isDirectory() && !this.excludedDirs.has(item) && !item.startsWith('.')) {
                        searchDir(itemPath, depth + 1);
                    } else if (stat.isFile() && stat.size < 1024 * 1024) { // Skip large files
                        const ext = path.extname(item).toLowerCase();

                        // Filter by file types if specified
                        if (fileTypes.length > 0 && !fileTypes.includes(ext)) {
                            continue;
                        }

                        if (this.allowedExtensions.has(ext)) {
                            try {
                                const content = fs.readFileSync(itemPath, 'utf8');
                                const lines = content.split('\n');

                                lines.forEach((line, lineNum) => {
                                    if (searchRegex.test(line) && results.length < maxResults) {
                                        results.push({
                                            file: relativePath,
                                            line: lineNum + 1,
                                            content: line.trim(),
                                            match: line.match(searchRegex)?.[0] || query
                                        });
                                    }
                                });
                            } catch (err) {
                                // Skip files that can't be read as text
                            }
                        }
                    }
                }
            } catch (error) {
                console.error(`Error searching in ${dir}:`, error.message);
            }
        };

        searchDir(this.projectRoot);
        return results;
    }

    // Get project statistics
    getProjectStats() {
        const stats = {
            totalFiles: 0,
            totalSize: 0,
            fileTypes: {},
            directories: 0,
            sourceFiles: 0,
            headerFiles: 0,
            webFiles: 0,
            configFiles: 0
        };

        const analyzeDir = (dir) => {
            try {
                const items = fs.readdirSync(dir);
                for (const item of items) {
                    const itemPath = path.join(dir, item);
                    const stat = fs.statSync(itemPath);

                    if (stat.isDirectory() && !this.excludedDirs.has(item) && !item.startsWith('.')) {
                        stats.directories++;
                        analyzeDir(itemPath);
                    } else if (stat.isFile()) {
                        stats.totalFiles++;
                        stats.totalSize += stat.size;

                        const ext = path.extname(item).toLowerCase();
                        stats.fileTypes[ext] = (stats.fileTypes[ext] || 0) + 1;

                        // Categorize files
                        if (['.cpp', '.c', '.cc', '.cxx', '.ino'].includes(ext)) {
                            stats.sourceFiles++;
                        } else if (['.h', '.hpp'].includes(ext)) {
                            stats.headerFiles++;
                        } else if (['.html', '.css', '.js'].includes(ext)) {
                            stats.webFiles++;
                        } else if (['.json', '.ini', '.cfg', '.yaml', '.yml'].includes(ext)) {
                            stats.configFiles++;
                        }
                    }
                }
            } catch (error) {
                console.error(`Error analyzing ${dir}:`, error.message);
            }
        };

        analyzeDir(this.projectRoot);
        return stats;
    }

    // Get recent files (by modification time)
    getRecentFiles(limit = 20) {
        const files = [];

        const scanDir = (dir, depth = 0) => {
            if (depth > 8) return;

            try {
                const items = fs.readdirSync(dir);
                for (const item of items) {
                    const itemPath = path.join(dir, item);
                    const stat = fs.statSync(itemPath);
                    const relativePath = path.relative(this.projectRoot, itemPath);

                    if (stat.isDirectory() && !this.excludedDirs.has(item) && !item.startsWith('.')) {
                        scanDir(itemPath, depth + 1);
                    } else if (stat.isFile()) {
                        const ext = path.extname(item).toLowerCase();
                        if (this.allowedExtensions.has(ext)) {
                            files.push({
                                path: relativePath,
                                name: item,
                                modified: stat.mtime,
                                size: stat.size,
                                extension: ext
                            });
                        }
                    }
                }
            } catch (error) {
                console.error(`Error scanning ${dir}:`, error.message);
            }
        };

        scanDir(this.projectRoot);

        // Sort by modification time (newest first) and limit
        return files
            .sort((a, b) => b.modified - a.modified)
            .slice(0, limit);
    }
}

module.exports = FileManager;
