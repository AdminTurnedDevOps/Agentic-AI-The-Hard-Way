output "name_servers" {
  description = "Set these four as custom nameservers at the registrar (Squarespace Domains)."
  value       = azurerm_dns_zone.site.name_servers
}

output "default_host_name" {
  value = azurerm_static_web_app.site.default_host_name
}

output "api_key" {
  description = "Deployment token for GitHub Actions. Store with `make deploy-token`; never commit."
  value       = azurerm_static_web_app.site.api_key
  sensitive   = true
}
