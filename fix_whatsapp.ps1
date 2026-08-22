# Script to unsubscribe unwanted apps from WABA
# Run this ONLY after confirming with your team that Infobip/Spur are not actively used

$token = "EAAWzrhE0H2sBSfZAD9OZBDN2v3Q9jOZAr332yyQQPiDR04srILPhaVx2jLwGNucWgCltqIJ21LpZCyi5F8X1zsueQy2LP0OFmR8AmJBNrMp6rB1CIDykOEPHlgToqePbw0CmaKVgAQMNZBZBJrqc26vxAbntBSRIFqS3ZAZC2nSNucmniswuKLMxh4sfdnDFfAZDZD"
$wabaId = "1066623268847296"
$headers = @{"Authorization" = "Bearer $token"}

Write-Host "Current subscribed apps:" -ForegroundColor Yellow
$response = Invoke-RestMethod -Uri "https://graph.facebook.com/v21.0/$wabaId/subscribed_apps" -Headers $headers -Method Get
$response.data | ForEach-Object {
    Write-Host "  - $($_.whatsapp_business_api_data.name) (ID: $($_.whatsapp_business_api_data.id))"
}

Write-Host "`nWARNING: This will unsubscribe ALL apps except CEP from your WABA." -ForegroundColor Red
Write-Host "Apps to keep: CEP (1604935077863275)" -ForegroundColor Green
Write-Host "Apps to remove: Infobip apps, Spur, etc." -ForegroundColor Red
Write-Host "`nPress Ctrl+C to cancel, or Enter to continue..."
Read-Host

# To unsubscribe an app, you need to use that app's access token
# Since we only have CEP's token, we can only unsubscribe CEP itself
# You'll need to contact Infobip/Spur or use Meta Business Settings to remove their apps

Write-Host "`nNOTE: You need to unsubscribe other apps through Meta Business Settings:" -ForegroundColor Yellow
Write-Host "1. Go to https://business.facebook.com/settings/whatsapp-business-accounts/$wabaId" -ForegroundColor Cyan
Write-Host "2. Look for 'Apps' or 'Integrations' section" -ForegroundColor Cyan
Write-Host "3. Remove: Infobip apps and Spur" -ForegroundColor Cyan
Write-Host "4. Keep: CEP" -ForegroundColor Green
