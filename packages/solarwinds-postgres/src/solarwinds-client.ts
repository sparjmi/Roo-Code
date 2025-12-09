import axios, { AxiosInstance } from 'axios';
import https from 'https';
import fs from 'fs';
import {
  SolarWindsConfig,
  SolarWindsNode,
  SolarWindsInterface,
  SolarWindsConnection,
  SolarWindsIPAddress,
  SolarWindsL2Connection,
  SolarWindsCdpEntry,
  SolarWindsLldpEntry,
  TopologyData,
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
        // Re-throw the original axios error to preserve error properties
        // This allows callers to check error.response.status
        throw error;
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
   *
   * Tries multiple entity names for compatibility across SolarWinds versions:
   * 1. Orion.Topology.InterfaceNeighbors (newer versions)
   * 2. Orion.NPM.InterfaceNeighbors (older versions)
   * 3. CDP/LLDP tables as fallback
   */
  async getConnections(): Promise<SolarWindsConnection[]> {
    // Try different entity names in order of preference
    const entityQueries = [
      // Modern versions (2024.x+) use Orion.Topology namespace
      {
        name: 'Orion.Topology.InterfaceNeighbors',
        swql: `
          SELECT
            LocalNode.NodeID AS LocalNodeID,
            LocalInterface.InterfaceID AS LocalInterfaceID,
            RemoteNode.NodeID AS RemoteNodeID,
            RemoteInterface.InterfaceID AS RemoteInterfaceID,
            Protocol AS ConnectionType
          FROM Orion.Topology.InterfaceNeighbors
          WHERE LocalNode.NodeID IS NOT NULL
            AND RemoteNode.NodeID IS NOT NULL
        `,
      },
      // Older versions
      {
        name: 'Orion.NPM.InterfaceNeighbors',
        swql: `
          SELECT
            LocalNodeID,
            LocalInterfaceID,
            RemoteNodeID,
            RemoteInterfaceID,
            ConnectionType
          FROM Orion.NPM.InterfaceNeighbors
        `,
      },
      // CDP (Cisco Discovery Protocol) fallback
      {
        name: 'Orion.NPM.CDPNeighbors',
        swql: `
          SELECT
            LocalNode.NodeID AS LocalNodeID,
            LocalInterface.InterfaceID AS LocalInterfaceID,
            RemoteNode.NodeID AS RemoteNodeID,
            RemoteInterface.InterfaceID AS RemoteInterfaceID,
            'CDP' AS ConnectionType
          FROM Orion.NPM.CDPNeighbors
          WHERE LocalNode.NodeID IS NOT NULL
            AND RemoteNode.NodeID IS NOT NULL
        `,
      },
      // LLDP (Link Layer Discovery Protocol) fallback
      {
        name: 'Orion.NPM.LLDPNeighbors',
        swql: `
          SELECT
            LocalNode.NodeID AS LocalNodeID,
            LocalInterface.InterfaceID AS LocalInterfaceID,
            RemoteNode.NodeID AS RemoteNodeID,
            RemoteInterface.InterfaceID AS RemoteInterfaceID,
            'LLDP' AS ConnectionType
          FROM Orion.NPM.LLDPNeighbors
          WHERE LocalNode.NodeID IS NOT NULL
            AND RemoteNode.NodeID IS NOT NULL
        `,
      },
    ];

    // Try each query until one succeeds
    for (const { name, swql } of entityQueries) {
      try {
        console.log(`Trying to fetch connections from ${name}...`);
        const results = await this.query<SolarWindsConnection>(swql);
        if (results.length > 0) {
          console.log(`Successfully fetched ${results.length} connections from ${name}`);
          return results;
        }
        console.log(`${name} returned no results, trying next option...`);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 400) {
          console.log(`${name} not available in this SolarWinds instance, trying next option...`);
          continue;
        }
        // Re-throw non-404 errors
        throw error;
      }
    }

    // If all queries fail, return empty array and log warning
    console.warn('Warning: Could not fetch network connections from any available entity.');
    console.warn('Your SolarWinds instance may not have topology discovery enabled (CDP/LLDP).');
    console.warn('The topology will still include devices and interfaces, but without connection relationships.');
    return [];
  }

  /**
   * Fetch IP addresses assigned to interfaces
   *
   * Tries multiple entity names for compatibility across SolarWinds versions:
   * 1. Orion.NPM.IPAddresses (older versions)
   * 2. Orion.IPAM.IPNode (if IPAM module is available)
   * 3. Direct from interface properties as fallback
   */
  async getIPAddresses(): Promise<SolarWindsIPAddress[]> {
    const entityQueries = [
      // Traditional NPM IP addresses table
      {
        name: 'Orion.NPM.IPAddresses',
        swql: `
          SELECT
            IPAddressID,
            InterfaceID,
            IPAddress,
            SubnetMask,
            IPAddressType
          FROM Orion.NPM.IPAddresses
        `,
      },
      // IPAM module (if available)
      {
        name: 'Orion.IPAM.IPNode',
        swql: `
          SELECT
            I.IPNodeID AS IPAddressID,
            I.InterfaceID,
            I.IPAddress,
            I.SubnetMask,
            I.IPAddressType
          FROM Orion.IPAM.IPNode I
          WHERE I.InterfaceID IS NOT NULL
        `,
      },
      // Fallback: Get IP from interfaces directly
      {
        name: 'Orion.NPM.Interfaces (IP fallback)',
        swql: `
          SELECT
            InterfaceID AS IPAddressID,
            InterfaceID,
            IPAddress,
            NULL AS SubnetMask,
            'Interface' AS IPAddressType
          FROM Orion.NPM.Interfaces
          WHERE IPAddress IS NOT NULL
            AND IPAddress != ''
            AND IPAddress != '0.0.0.0'
        `,
      },
    ];

    // Try each query until one succeeds
    for (const { name, swql } of entityQueries) {
      try {
        console.log(`Trying to fetch IP addresses from ${name}...`);
        const results = await this.query<SolarWindsIPAddress>(swql);
        if (results.length > 0) {
          console.log(`Successfully fetched ${results.length} IP addresses from ${name}`);
          return results;
        }
        console.log(`${name} returned no results, trying next option...`);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 400) {
          console.log(`${name} not available in this SolarWinds instance, trying next option...`);
          continue;
        }
        // Re-throw non-400 errors
        throw error;
      }
    }

    // If all queries fail, return empty array and log warning
    console.warn('Warning: Could not fetch IP addresses from any available entity.');
    console.warn('The topology will still include devices and interfaces, but without IP address information.');
    return [];
  }

  /**
   * Fetch IP addresses from Orion.NodeIPAddresses
   * This is the correct table for SolarWinds 2025.2.1
   */
  async getNodeIPAddresses(): Promise<SolarWindsIPAddress[]> {
    try {
      console.log('Fetching IP addresses from Orion.NodeIPAddresses...');
      const swql = `
        SELECT
          NodeID,
          IPAddress,
          IPAddressN,
          SubnetMask,
          IPAddressType
        FROM Orion.NodeIPAddresses
      `;
      const results = await this.query<SolarWindsIPAddress>(swql);
      console.log(`✓ Fetched ${results.length} IP addresses from Orion.NodeIPAddresses`);
      return results;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        console.warn('Orion.NodeIPAddresses not available, trying fallback...');
        // Fallback: Get IP addresses directly from Nodes table
        try {
          const swql = `
            SELECT
              NodeID,
              IPAddress,
              IPAddress AS IPAddressN,
              '' AS SubnetMask,
              IPAddressType
            FROM Orion.Nodes
            WHERE IPAddress IS NOT NULL
          `;
          const results = await this.query<SolarWindsIPAddress>(swql);
          console.log(`✓ Fetched ${results.length} IP addresses from Orion.Nodes (fallback)`);
          return results;
        } catch (fallbackError) {
          console.warn('Could not fetch IP addresses from any source');
          return [];
        }
      }
      throw error;
    }
  }

  /**
   * Fetch Layer 2 connections from Orion.NodeL2Connections
   * This table shows MAC addresses seen on switch ports
   */
  async getL2Connections(): Promise<SolarWindsL2Connection[]> {
    try {
      console.log('Fetching L2 connections from Orion.NodeL2Connections...');
      const swql = `
        SELECT
          NodeID,
          PortID,
          MACAddress,
          VlanId,
          Status
        FROM Orion.NodeL2Connections
      `;
      const results = await this.query<SolarWindsL2Connection>(swql);
      console.log(`✓ Fetched ${results.length} L2 MAC-to-port mappings`);
      return results;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        console.warn('Orion.NodeL2Connections not available');
        return [];
      }
      throw error;
    }
  }

  /**
   * Fetch CDP neighbor entries
   */
  async getCdpEntries(): Promise<SolarWindsCdpEntry[]> {
    try {
      console.log('Fetching CDP entries from Orion.NodeCdpEntry...');
      const swql = `
        SELECT
          NodeID,
          IfIndex,
          DeviceId,
          DevicePort,
          IpAddress
        FROM Orion.NodeCdpEntry
      `;
      const results = await this.query<SolarWindsCdpEntry>(swql);
      console.log(`✓ Fetched ${results.length} CDP entries`);
      return results;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        console.warn('Orion.NodeCdpEntry not available');
        return [];
      }
      throw error;
    }
  }

  /**
   * Fetch LLDP neighbor entries
   */
  async getLldpEntries(): Promise<SolarWindsLldpEntry[]> {
    try {
      console.log('Fetching LLDP entries from Orion.NodeLldpEntry...');
      const swql = `
        SELECT
          NodeID,
          LocalPortNumber,
          RemoteSystemName,
          RemotePortId,
          RemotePortDescription,
          RemoteIpAddress
        FROM Orion.NodeLldpEntry
      `;
      const results = await this.query<SolarWindsLldpEntry>(swql);
      console.log(`✓ Fetched ${results.length} LLDP entries`);
      return results;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        console.warn('Orion.NodeLldpEntry not available');
        return [];
      }
      throw error;
    }
  }

  /**
   * Fetch all topology data in one call
   */
  async getAllTopologyData(): Promise<TopologyData> {
    console.log('Fetching nodes from SolarWinds...');
    const nodes = await this.getNodes();
    console.log(`Fetched ${nodes.length} nodes`);

    console.log('Fetching interfaces from SolarWinds...');
    const interfaces = await this.getInterfaces();
    console.log(`Fetched ${interfaces.length} interfaces`);

    // Fetch IP addresses from the correct table
    const ipAddresses = await this.getNodeIPAddresses();

    // Fetch L2 connections
    const l2Connections = await this.getL2Connections();

    // Fetch CDP entries
    const cdpEntries = await this.getCdpEntries();

    // Fetch LLDP entries
    const lldpEntries = await this.getLldpEntries();

    return {
      nodes,
      interfaces,
      ipAddresses,
      l2Connections,
      cdpEntries,
      lldpEntries,
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

  /**
   * Discover available topology entities in the SolarWinds instance
   * Useful for troubleshooting and determining what data sources are available
   */
  async discoverTopologyEntities(): Promise<string[]> {
    // Map entities to specific column queries (SWQL doesn't support SELECT * in some versions)
    const entitiesToCheck = [
      { name: 'Orion.Nodes', query: 'SELECT TOP 1 NodeID FROM Orion.Nodes' },
      { name: 'Orion.NPM.Interfaces', query: 'SELECT TOP 1 InterfaceID FROM Orion.NPM.Interfaces' },
      { name: 'Orion.NPM.IPAddresses', query: 'SELECT TOP 1 IPAddressID FROM Orion.NPM.IPAddresses' },
      { name: 'Orion.IPAM.IPNode', query: 'SELECT TOP 1 IPNodeID FROM Orion.IPAM.IPNode' },
      { name: 'Orion.Topology.InterfaceNeighbors', query: 'SELECT TOP 1 LocalNode.NodeID FROM Orion.Topology.InterfaceNeighbors' },
      { name: 'Orion.NPM.InterfaceNeighbors', query: 'SELECT TOP 1 LocalNodeID FROM Orion.NPM.InterfaceNeighbors' },
      { name: 'Orion.NPM.CDPNeighbors', query: 'SELECT TOP 1 LocalNode.NodeID FROM Orion.NPM.CDPNeighbors' },
      { name: 'Orion.NPM.LLDPNeighbors', query: 'SELECT TOP 1 LocalNode.NodeID FROM Orion.NPM.LLDPNeighbors' },
    ];

    const available: string[] = [];

    for (const { name, query } of entitiesToCheck) {
      try {
        await this.query(query);
        available.push(name);
      } catch (error) {
        // Entity not available
      }
    }

    return available;
  }
}
