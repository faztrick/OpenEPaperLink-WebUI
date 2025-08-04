# PowerShell script to test OpenAI API with curl
# ================================================

# Set the API key (same as in openai-agent.js)
$env:OPENAI_API_KEY = "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"

Write-Host "🧪 Testing OpenAI API with curl..." -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Gray

# Test 1: Simple chat completion (correct format)
Write-Host "📡 Test 1: Simple Chat Completion" -ForegroundColor Yellow

$response1 = curl https://api.openai.com/v1/chat/completions `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $env:OPENAI_API_KEY" `
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [
      {
        "role": "user",
        "content": "Hello! Please respond with \"API is working!\" if you can receive this message."
      }
    ],
    "max_tokens": 50,
    "temperature": 0.7
  }' `
  -s

Write-Host "Response:" -ForegroundColor Green
$response1 | ConvertFrom-Json | ConvertTo-Json -Depth 10

Write-Host "`n================================================" -ForegroundColor Gray

# Test 2: List available models
Write-Host "📊 Test 2: List Available Models" -ForegroundColor Yellow

$response2 = curl https://api.openai.com/v1/models `
  -H "Authorization: Bearer $env:OPENAI_API_KEY" `
  -s

$models = $response2 | ConvertFrom-Json
Write-Host "Available models count: $($models.data.Count)" -ForegroundColor Green
Write-Host "Some available models:" -ForegroundColor Green

# Show first 10 models
$models.data | Select-Object -First 10 | ForEach-Object {
    Write-Host "  - $($_.id)" -ForegroundColor White
}

Write-Host "`n================================================" -ForegroundColor Gray

# Test 3: Corrected version of your original request (using gpt-4o instead of gpt-4.1)
Write-Host "🔧 Test 3: Corrected Version of Your Request" -ForegroundColor Yellow

$response3 = curl https://api.openai.com/v1/chat/completions `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $env:OPENAI_API_KEY" `
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {
        "role": "user",
        "content": "hai"
      }
    ],
    "max_tokens": 2048,
    "temperature": 1,
    "top_p": 1
  }' `
  -s

Write-Host "Response:" -ForegroundColor Green
$response3 | ConvertFrom-Json | ConvertTo-Json -Depth 10

Write-Host "`n✅ All tests completed!" -ForegroundColor Green
