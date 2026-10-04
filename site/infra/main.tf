resource "azurerm_resource_group" "site" {
  name     = var.resource_group_name
  location = var.location
}

resource "azurerm_static_web_app" "site" {
  name                = var.static_web_app_name
  resource_group_name = azurerm_resource_group.site.name
  location            = azurerm_resource_group.site.location
  sku_tier            = "Free"
  sku_size            = "Free"

  # Deploying with the API key from GitHub Actions updates these in Azure (per provider docs).
  lifecycle {
    ignore_changes = [repository_url, repository_branch]
  }
}

resource "azurerm_dns_zone" "site" {
  name                = var.domain_name
  resource_group_name = azurerm_resource_group.site.name
}

resource "azurerm_static_web_app_custom_domain" "apex" {
  static_web_app_id = azurerm_static_web_app.site.id
  domain_name       = azurerm_dns_zone.site.name
  # Apex domains must use TXT validation. Terraform doesn't wait for it to finish.
  validation_type = "dns-txt-token"
}

locals {
  validation_at_apex = var.txt_record_name == "@"
}

# Azure DNS keeps every TXT value for a name in one record set, so SPF and (when validating at "@")
# the domain-validation token share this record.
resource "azurerm_dns_txt_record" "apex" {
  name                = "@"
  zone_name           = azurerm_dns_zone.site.name
  resource_group_name = azurerm_resource_group.site.name
  ttl                 = 3600

  # No mail is sent from this domain; carried over from the Squarespace DNS.
  record {
    value = "v=spf1 -all"
  }

  dynamic "record" {
    for_each = local.validation_at_apex ? [azurerm_static_web_app_custom_domain.apex.validation_token] : []
    content {
      value = record.value
    }
  }

  # Azure clears the validation token once the domain validates; ignore it so later plans don't blank the record.
  # Because `record` is ignored, changing the SPF value or txt_record_name after the first apply
  # needs a manual edit of the record set (or `terraform apply -replace=azurerm_dns_txt_record.apex`).
  lifecycle {
    ignore_changes = [record]
  }
}

resource "azurerm_dns_txt_record" "validation" {
  count               = local.validation_at_apex ? 0 : 1
  name                = var.txt_record_name
  zone_name           = azurerm_dns_zone.site.name
  resource_group_name = azurerm_resource_group.site.name
  ttl                 = 3600

  record {
    value = azurerm_static_web_app_custom_domain.apex.validation_token
  }

  lifecycle {
    ignore_changes = [record]
  }
}

# Alias record so the apex keeps Static Web Apps' global distribution.
resource "azurerm_dns_a_record" "apex" {
  name                = "@"
  zone_name           = azurerm_dns_zone.site.name
  resource_group_name = azurerm_resource_group.site.name
  ttl                 = 3600
  target_resource_id  = azurerm_static_web_app.site.id
}

# www serves the same site; the Free plan allows 2 custom domains per app.
resource "azurerm_dns_cname_record" "www" {
  name                = "www"
  zone_name           = azurerm_dns_zone.site.name
  resource_group_name = azurerm_resource_group.site.name
  ttl                 = 3600
  record              = azurerm_static_web_app.site.default_host_name
}

resource "azurerm_static_web_app_custom_domain" "www" {
  static_web_app_id = azurerm_static_web_app.site.id
  domain_name       = "www.${azurerm_dns_zone.site.name}"
  validation_type   = "cname-delegation"
  depends_on        = [azurerm_dns_cname_record.www]
}
