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
 * Configuration Types
 */

export interface SolarWindsConfig {
  baseUrl: string;
  username: string;
  password: string;
  verifySSL?: boolean;
  certificatePath?: string;
}

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}

export interface AppConfig {
  solarwinds: SolarWindsConfig;
  postgres: PostgresConfig;
}
