/**
 * SolarWinds NPM API Response Types
 */

export interface SolarWindsNode {
  NodeID: number;
  Caption: string;
  NodeName: string;
  IPAddress: string;
  Vendor: string;
  MachineType: string;
  Location: string;
  Status: number;
  StatusDescription: string;
  ObjectSubType: string;
  IOSVersion?: string;
  Community?: string;
  Contact?: string;
  Description?: string;
}

export interface SolarWindsInterface {
  InterfaceID: number;
  NodeID: number;
  InterfaceName: string;
  Caption: string;
  FullName: string;
  InterfaceIndex: number;
  InterfaceType: number;
  InterfaceTypeDescription: string;
  PhysicalAddress: string;
  AdminStatus: number;
  OperStatus: number;
  Speed: number;
  MTU: number;
  InBandwidth?: number;
  OutBandwidth?: number;
  Description?: string;
}

export interface SolarWindsConnection {
  LocalNodeID: number;
  LocalInterfaceID: number;
  RemoteNodeID: number;
  RemoteInterfaceID: number;
  ConnectionType: string;
}

export interface SolarWindsIPAddress {
  IPAddressID: number;
  InterfaceID: number;
  IPAddress: string;
  SubnetMask: string;
  IPAddressType: string;
}

/**
 * Neo4j Graph Schema Types
 */

export interface Device {
  nodeId: number;
  name: string;
  ipAddress: string;
  vendor?: string;
  machineType?: string;
  location?: string;
  status: string;
  objectSubType?: string;
  iosVersion?: string;
  contact?: string;
  description?: string;
}

export interface NetworkInterface {
  interfaceId: number;
  name: string;
  fullName: string;
  interfaceIndex: number;
  interfaceType: string;
  macAddress?: string;
  adminStatus: string;
  operStatus: string;
  speed?: number;
  mtu?: number;
  description?: string;
}

export interface IPAddressNode {
  ipAddress: string;
  subnetMask?: string;
  ipAddressType?: string;
}

export interface Subnet {
  network: string;
  cidr: string;
}

/**
 * Configuration Types
 */

export interface SolarWindsConfig {
  baseUrl: string;
  username: string;
  password: string;
  verifySSL?: boolean;
  certificatePath?: string; // Path to CA certificate file for SSL verification (SolarWinds 2025.2+)
}

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

export interface AppConfig {
  solarwinds: SolarWindsConfig;
  neo4j: Neo4jConfig;
}
