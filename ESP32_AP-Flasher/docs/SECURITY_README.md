# API Key and Security Configuration

## Security Setup

This project has been configured to protect sensitive information like API keys and server credentials from being committed to Git.

### API Key Configuration

1. **OpenAI API Key Setup:**
   - Copy `openai_config.template.json` to `openai_config.json`
   - Replace `YOUR_OPENAI_API_KEY_HERE` with your actual OpenAI API key
   - The actual config files are now ignored by Git for security

2. **Files with API Key placeholders:**
   - `openai_config.json` (root directory)
   - `wwwroot/openai_config.json`
   - `wwwroot/openai-agent.js`

### Security Features

- All `*config*.json` files are now excluded from Git
- Build files and temporary files are ignored
- Backup files and sensitive data are protected
- Log files and dependencies with potential sensitive info are excluded

### Important Notes

- **Never commit real API keys to Git**
- Use environment variables when possible
- Keep the template files for reference
- Rotate API keys if they were ever committed to version control

### Files Protected by .gitignore

- Configuration files (`*config*.json`)
- Build artifacts (`build/`, `*.bin`, `*.elf`)
- Log files (`*.log`, `logs/`)
- Temporary files (`*.tmp`, `*.temp`)
- Environment files (`.env*`)
- Backup files (`*.bak`, `*.backup`)
- Node.js and Python cache files
- System files (`.DS_Store`, `Thumbs.db`)

### Setup Instructions

1. Clone the repository
2. Copy `openai_config.template.json` to `openai_config.json`
3. Edit the config file with your actual API key
4. The config file will be ignored by Git automatically

## Old API Keys

If you previously committed API keys to this repository:
1. **Immediately rotate/regenerate those keys** on the service provider's website
2. Consider using `git filter-branch` or similar tools to remove them from Git history
3. Use the new secure configuration system going forward
