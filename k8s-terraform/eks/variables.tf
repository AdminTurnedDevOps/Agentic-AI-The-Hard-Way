variable "aws_region" {
  description = "The AWS region to create resources in."
  default     = "us-east-1"
}

variable "cluster_name" {
  description = "The name of the EKS cluster."
  default     = "bedrocktest"
}

variable "cluster_version" {
  description = "The Kubernetes version for the EKS cluster."
  default     = "1.33"
}

variable "pub_subnet_id_1" {
  type = string
  default = "subnet-0d2ea8898cdc199af"
}

variable "pub_subnet_id_2" {
  type = string
  default = "subnet-08f1c1b07f89afd3e"
}