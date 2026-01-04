data "aws_vpc" "selected" {
  filter {
    name   = "tag:Name"
    values = ["eksctl-mcdemo-cluster/VPC"]
  }
}

resource "aws_eks_cluster" "mcdemo_cluster" {
  name     = var.cluster_name
  version  = var.cluster_version
  role_arn = aws_iam_role.eks_cluster_role.arn

  vpc_config {
    subnet_ids = [var.pub_subnet_id_1, var.pub_subnet_id_2]
  }

  depends_on = [
    aws_iam_role_policy_attachment.amazon_eks_cluster_policy,
    aws_iam_role_policy_attachment.amazon_eks_service_policy,
  ]
}

resource "aws_eks_node_group" "mcdemo_node_group" {
  cluster_name    = aws_eks_cluster.mcdemo_cluster.name
  node_group_name = "mcdemo-nodegroup"
  node_role_arn   = aws_iam_role.eks_node_group_role.arn
  subnet_ids = [var.pub_subnet_id_1, var.pub_subnet_id_2]

  scaling_config {
    desired_size = 4
    max_size     = 6
    min_size     = 3
  }

  instance_types = ["t3.medium"]

  depends_on = [
    aws_iam_role_policy_attachment.amazon_eks_worker_node_policy,
    aws_iam_role_policy_attachment.amazon_ec2_container_registry_read_only,
    aws_iam_role_policy_attachment.amazon_eks_cni_policy,
  ]
}
