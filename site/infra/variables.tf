variable "subscription_id" {
  type        = string
  description = "Azure subscription ID. Set with TF_VAR_subscription_id; `make infra-plan` reads it from `az account show`."
}

variable "resource_group_name" {
  type    = string
  default = "agenticfieldguide"
}

variable "location" {
  type        = string
  description = "Region for the Static Web App (the Free tier is offered in a limited set of regions)."
  default     = "eastus2"
}

variable "static_web_app_name" {
  type    = string
  default = "agentic-field-guide"
}

variable "domain_name" {
  type    = string
  default = "agenticfieldguide.ai"
}

variable "txt_record_name" {
  type        = string
  description = "Record name for the apex domain-validation TXT value. Microsoft's apex guide uses \"@\"; switch to \"_dnsauth\" if validation stays pending."
  default     = "@"
  validation {
    condition     = contains(["@", "_dnsauth"], var.txt_record_name)
    error_message = "txt_record_name must be \"@\" or \"_dnsauth\"."
  }
}
