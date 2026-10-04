terraform {
  required_version = ">= 1.12"
  required_providers {
    azurerm = {
      source = "hashicorp/azurerm"
      # Exact pin: the repo .gitignore excludes *.lock.hcl, so this is what fixes the provider version.
      version = "5.8.0"
    }
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}
