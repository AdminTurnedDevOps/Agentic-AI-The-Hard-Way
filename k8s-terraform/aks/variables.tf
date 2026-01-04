variable "name" {
  type    = string
  default = "aksenvironment01"
}

variable "resource_group_name" {
  type    = string
  default = "devrelasaservice"
}

variable "location" {
  type    = string
  default = "westus"
}

variable "node_count" {
  type    = string
  default = 3
}

variable "k8s_version" {
  type    = string
  default = "1.33.2"
}

variable "sub" {
  type = string
  default = ""
}