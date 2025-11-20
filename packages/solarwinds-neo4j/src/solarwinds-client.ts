import axios, { AxiosInstance } from 'axios';
import https from 'https';
import fs from 'fs';
import {
  SolarWindsConfig,
  SolarWindsNode,
  SolarWindsInterface,
  SolarWindsConnection,
  SolarWindsIPAddress,
} from './types';

/**
 * SolarWinds NPM API Client
 *
 * This client uses the SolarWinds Information Service (SWIS) API to query
 * network performance monitoring data.
 *
 * IMPORTANT: SolarWinds Platform 2025.2+ enforces SSL certificate validation by default.
 * If using self-signed certificates, either:
 * 1. Provide the CA certificate file path via certificatePath config
 * 2. Set verifySSL to false (not recommended for production)
 * 3. Use a properly signed certificate on your SolarWinds server
 */
export class SolarWindsClient {
  private client: AxiosInstance;
  private config: SolarWindsConfig;

  constructor(config: SolarWindsConfig) {
    this.config = config;

    // Configure HTTPS agent for SSL/TLS
    const httpsAgentOptions: https.AgentOptions = {
      rejectUnauthorized: config.verifySSL !== false,
    };

    // If a certificate path is provided, load it for SSL verification
    // This is especially important for SolarWinds 2025.2+ with self-signed certs
    if (config.certificatePath) {
      try {
        const ca = fs.readFileSync(config.certificatePath);
        httpsAgentOptions.ca = ca;
        console.log(`Loaded SSL certificate from: ${config.certificatePath}`);
      } catch (error) {
        console.warn(`Warning: Could not load certificate from ${config.certificatePath}:`, error);
        throw new Error(`Failed to load SSL certificate: ${error}`);
      }
    }

    const httpsAgent = new https.Agent(httpsAgentOptions);

    this.client = axios.create({
      baseURL: `${config.baseUrl}/SolarWinds/InformationService/v3/Json`,
      auth: {
        username: config.username,
        password: config.password,
      },
      headers: {
        'Content-Type': 'application/json',
      },
      httpsAgent,
    });
  }

  /**
   * Execute a SWQL (SolarWinds Query Language) query
   */
  private async query<T>(swql: string): Promise<T[]> {
    try {
      const response = await this.client.post('/Query', {
        query: swql,
      });

      return response.data.results || [];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('SolarWinds API Error:', error.response?.data || error.message);
        throw new Error(`SolarWinds API query failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Fetch all network nodes (devices)
   */
  async getNodes(): Promise<SolarWindsNode[]> {
    const swql = `
      SELECT
        NodeID,
        Caption,
        NodeName,
        IPAddress,
        Vendor,
        MachineType,
        Location,
        Status,
        StatusDescription,
        ObjectSubType,
        IOSVersion,
        Community,
        Contact,
        Description
      FROM Orion.Nodes
      WHERE Status IS NOT NULL
    `;

    return this.query<SolarWindsNode>(swql);
  }

  /**
   * Fetch all network interfaces
   */
  async getInterfaces(): Promise<SolarWindsInterface[]> {
    const swql = `
      SELECT
        InterfaceID,
        NodeID,
        InterfaceName,
        Caption,
        FullName,
        InterfaceIndex,
        InterfaceType,
        InterfaceTypeDescription,
        PhysicalAddress,
        AdminStatus,
        OperStatus,
        Speed,
        MTU,
        InBandwidth,
        OutBandwidth,
        Description
      FROM Orion.NPM.Interfaces
      WHERE Status IS NOT NULL
    `;

    return this.query<SolarWindsInterface>(swql);
  }

  /**
   * Fetch network connections (topology links)
   * This uses the Neighbor Discovery data from NPM
   */
  async getConnections(): Promise<SolarWindsConnection[]> {
    const swql = `
      SELECT
        LocalNodeID,
        LocalInterfaceID,
        RemoteNodeID,
        RemoteInterfaceID,
        ConnectionType
      FROM Orion.NPM.InterfaceNeighbors
    `;

    return this.query<SolarWindsConnection>(swql);
  }

  /**
   * Fetch IP addresses assigned to interfaces
   */
  async getIPAddresses(): Promise<SolarWindsIPAddress[]> {
    const swql = `
      SELECT
        IPAddressID,
        InterfaceID,
        IPAddress,
        SubnetMask,
        IPAddressType
      FROM Orion.NPM.IPAddresses
    `;

    return this.query<SolarWindsIPAddress>(swql);
  }

  /**
   * Fetch all topology data in one call
   */
  async getAllTopologyData() {
    console.log('Fetching nodes from SolarWinds...');
    const nodes = await this.getNodes();
    console.log(`Fetched ${nodes.length} nodes`);

    console.log('Fetching interfaces from SolarWinds...');
    const interfaces = await this.getInterfaces();
    console.log(`Fetched ${interfaces.length} interfaces`);

    console.log('Fetching connections from SolarWinds...');
    const connections = await this.getConnections();
    console.log(`Fetched ${connections.length} connections`);

    console.log('Fetching IP addresses from SolarWinds...');
    const ipAddresses = await this.getIPAddresses();
    console.log(`Fetched ${ipAddresses.length} IP addresses`);

    return {
      nodes,
      interfaces,
      connections,
      ipAddresses,
    };
  }

  /**
   * Test the connection to SolarWinds
   */
  async testConnection(): Promise<boolean> {
    try {
      const swql = 'SELECT TOP 1 NodeID FROM Orion.Nodes';
      await this.query(swql);
      return true;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
}
