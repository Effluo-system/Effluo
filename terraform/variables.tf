# Database configuration
variable "db_identifier" {
  description = "Database identifier"
  type        = string
  default     = "effluo-db"
}

variable "db_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "15.8"
}

variable "db_instance_class" {
  description = "Database instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "Database allocated storage in GB"
  type        = number
  default     = 20
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "postgres"
}

variable "db_password" {
  description = "Database master password"
  type        = string
  default     = "password"
  sensitive   = true
}

variable "db_name" {
  description = "Initial database name"
  type        = string
  default     = "effluo"
}

variable "db_port" {
  description = "Database port"
  type        = number
  default     = 5432
}

variable "db_publicly_accessible" {
  description = "Whether the database should be publicly accessible"
  type        = bool
  default     = true
}

variable "skip_final_snapshot" {
  description = "Skip final snapshot when destroying database"
  type        = bool
  default     = true
}

variable "deletion_protection" {
  description = "Enable deletion protection"
  type        = bool
  default     = false
}

# Networking configuration
variable "db_subnet_group_name" {
  description = "Name for the DB subnet group"
  type        = string
  default     = "rds-subnet-group"
}

variable "security_group_name" {
  description = "Name for the RDS security group"
  type        = string
  default     = "rds-security-group"
}

# EKS Configuration
variable "eks_cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
  default     = "effluo-eks-cluster"
}

variable "eks_cluster_version" {
  description = "Kubernetes version for EKS cluster"
  type        = string
  default     = "1.30"
}

variable "eks_cluster_role_name" {
  description = "Name for EKS cluster IAM role"
  type        = string
  default     = "effluo-eks-cluster-role"
}

variable "eks_node_role_name" {
  description = "Name for EKS node group IAM role"
  type        = string
  default     = "effluo-eks-node-role"
}

variable "eks_node_group_name" {
  description = "Name of the EKS node group"
  type        = string
  default     = "effluo-nodes"
}

variable "eks_cluster_sg_name" {
  description = "Name for EKS cluster security group"
  type        = string
  default     = "effluo-eks-cluster-sg"
}

variable "eks_nodes_sg_name" {
  description = "Name for EKS nodes security group"
  type        = string
  default     = "effluo-eks-nodes-sg"
}

# EKS Node Group Configuration
variable "node_group_capacity_type" {
  description = "Type of capacity associated with the EKS Node Group. Valid values: ON_DEMAND, SPOT"
  type        = string
  default     = "ON_DEMAND"
}

variable "node_group_instance_types" {
  description = "List of instance types associated with the EKS Node Group"
  type        = list(string)
  default     = ["t3.medium"]
}

variable "node_group_desired_size" {
  description = "Desired number of nodes in the EKS Node Group"
  type        = number
  default     = 2
}

variable "node_group_max_size" {
  description = "Maximum number of nodes in the EKS Node Group"
  type        = number
  default     = 4
}

variable "node_group_min_size" {
  description = "Minimum number of nodes in the EKS Node Group"
  type        = number
  default     = 1
}
