# Prerequisites

## Prior Tech Knowledge

The Agentic and AI landscape (for how we're seeing it today) is relatively new. Although AI has been around since the 1950's, the way that the industry is implementing it, seeing it, and the quick adoption is very new.

Because of that, there aren't a whole lot of prereqs that you should have. However, where Agents run and what we do with them has a fair amount of prereqs. Deploying Agents on Kubernetes, writing Agents in general-purpose programming languages, monitoring/observing Agents, securing Agents, authentication needs, and Gateway needs are all things engineers have been implementing for years.

Taking all of that into consideration, if you have a DevOps/Platform Engineering/SRE background, you'll be in good shape to follow along with this repo. If you don't have that experience, now is the time to learn!

## Cloud Account Or Local Laptop

Because the Agents will either run locally or in a Kubernetes cluster, life is easier if you have a cloud account and/or a powerful laptop. For example, I run Agents locally, but I have an M4 Max, so a lot of RAM, a powerful CPU, and GPU cores.

For Kubernetes clusters, you'll see Terraform/HCL configs for Azure, AWS, and GCP [here](https://github.com/AdminTurnedDevOps/Agentic-AI-The-Hard-Way/blob/main/k8s-terraform/setup.md).

## Installations

You should have the following to comfortably follow along:

1. A Code editor like VS Code
2. Python 3.11+ installed
3. Terraform