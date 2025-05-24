module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.21.0"

  name = "effluo-vpc"
  cidr = "10.0.0.0/16"

  azs            = ["us-east-1a", "us-east-1b"]
  public_subnets = ["10.0.1.0/24", "10.0.2.0/24"]

  enable_dns_hostnames = true

  enable_nat_gateway     = false
  one_nat_gateway_per_az = false
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "20.36.0"

  cluster_name    = "effluo"
  cluster_version = "1.30"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.public_subnets

  eks_managed_node_groups = {
    default = {
      desired_size = 2
      max_size     = 2
      min_size     = 1

      instance_types = ["t3.micro"]
    }
  }
}

# Network Load Balancer for GitHub webhooks
resource "aws_lb" "webhook" {
  name               = "effluo-webhook-nlb"
  internal           = false
  load_balancer_type = "network"
  subnets            = module.vpc.public_subnets

  enable_deletion_protection = false
}

# Target Group for webhook service
resource "aws_lb_target_group" "webhook" {
  name     = "effluo-webhook-tg"
  port     = 30080  # NodePort for webhook
  protocol = "TCP"
  vpc_id   = module.vpc.vpc_id
  
  health_check {
    enabled  = true
    protocol = "TCP"
    port     = 30080
  }
}

# Listener for webhook
resource "aws_lb_listener" "webhook" {
  load_balancer_arn = aws_lb.webhook.arn
  port              = "80"
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.webhook.arn
  }
}

# Attach nodes to target group
resource "aws_autoscaling_attachment" "webhook" {
  autoscaling_group_name = module.eks.eks_managed_node_groups.default.asg_name
  lb_target_group_arn    = aws_lb_target_group.webhook.arn
}

# Security group rule for NLB to nodes
resource "aws_security_group_rule" "nlb_webhook" {
  type              = "ingress"
  from_port         = 30080
  to_port           = 30080
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = module.eks.node_security_group_id
  description       = "Allow NLB to reach NodePort"
}