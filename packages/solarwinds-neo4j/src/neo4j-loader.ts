import neo4j, { Driver, Session } from 'neo4j-driver';
import {
  Neo4jConfig,
  SolarWindsNode,
  SolarWindsInterface,
  SolarWindsConnection,
  SolarWindsIPAddress,
} from './types';

/**
 * Neo4j Network Topology Loader
 *
 * This class handles loading network topology data from SolarWinds
 * into a Neo4j graph database with the following schema:
 *
 * Nodes:
 *   - Device: Network devices (routers, switches, servers)
 *   - Interface: Network interfaces on devices
 *   - IPAddress: IP addresses assigned to interfaces
 *   - Subnet: Network subnets
 *
 * Relationships:
 *   - HAS_INTERFACE: Device -> Interface
 *   - HAS_IP: Interface -> IPAddress
 *   - BELONGS_TO_SUBNET: IPAddress -> Subnet
 *   - CONNECTED_TO: Interface <-> Interface (network connections)
 */
export class Neo4jLoader {
  private driver: Driver;
  private config: Neo4jConfig;

  constructor(config: Neo4jConfig) {
    this.config = config;
    this.driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.username, config.password)
    );
  }

  /**
   * Test the connection to Neo4j
   */
  async testConnection(): Promise<boolean> {
    const session = this.driver.session({
      database: this.config.database || 'neo4j',
    });

    try {
      await session.run('RETURN 1');
      return true;
    } catch (error) {
      console.error('Neo4j connection test failed:', error);
      return false;
    } finally {
      await session.close();
    }
  }

  /**
   * Create indexes for better query performance
   */
  async createIndexes(): Promise<void> {
    const session = this.driver.session({
      database: this.config.database || 'neo4j',
    });

    try {
      console.log('Creating Neo4j indexes...');

      // Device indexes
      await session.run(
        'CREATE INDEX device_node_id IF NOT EXISTS FOR (d:Device) ON (d.nodeId)'
      );
      await session.run(
        'CREATE INDEX device_name IF NOT EXISTS FOR (d:Device) ON (d.name)'
      );
      await session.run(
        'CREATE INDEX device_ip IF NOT EXISTS FOR (d:Device) ON (d.ipAddress)'
      );

      // Interface indexes
      await session.run(
        'CREATE INDEX interface_id IF NOT EXISTS FOR (i:Interface) ON (i.interfaceId)'
      );

      // IPAddress indexes
      await session.run(
        'CREATE INDEX ip_address IF NOT EXISTS FOR (ip:IPAddress) ON (ip.address)'
      );

      // Subnet indexes
      await session.run(
        'CREATE INDEX subnet_network IF NOT EXISTS FOR (s:Subnet) ON (s.network)'
      );

      console.log('Indexes created successfully');
    } catch (error) {
      console.error('Error creating indexes:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Clear all existing topology data
   */
  async clearTopology(): Promise<void> {
    const session = this.driver.session({
      database: this.config.database || 'neo4j',
    });

    try {
      console.log('Clearing existing topology data...');
      await session.run(`
        MATCH (n)
        WHERE n:Device OR n:Interface OR n:IPAddress OR n:Subnet
        DETACH DELETE n
      `);
      console.log('Topology data cleared');
    } catch (error) {
      console.error('Error clearing topology:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Load devices into Neo4j
   */
  async loadDevices(nodes: SolarWindsNode[]): Promise<void> {
    const session = this.driver.session({
      database: this.config.database || 'neo4j',
    });

    try {
      console.log(`Loading ${nodes.length} devices...`);

      // Batch insert devices
      await session.run(
        `
        UNWIND $nodes AS node
        MERGE (d:Device {nodeId: node.NodeID})
        SET d.name = node.Caption,
            d.nodeName = node.NodeName,
            d.ipAddress = node.IPAddress,
            d.vendor = node.Vendor,
            d.machineType = node.MachineType,
            d.location = node.Location,
            d.status = node.StatusDescription,
            d.objectSubType = node.ObjectSubType,
            d.iosVersion = node.IOSVersion,
            d.contact = node.Contact,
            d.description = node.Description,
            d.lastUpdated = datetime()
        `,
        { nodes }
      );

      console.log('Devices loaded successfully');
    } catch (error) {
      console.error('Error loading devices:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Load interfaces and create relationships to devices
   */
  async loadInterfaces(interfaces: SolarWindsInterface[]): Promise<void> {
    const session = this.driver.session({
      database: this.config.database || 'neo4j',
    });

    try {
      console.log(`Loading ${interfaces.length} interfaces...`);

      await session.run(
        `
        UNWIND $interfaces AS iface
        MATCH (d:Device {nodeId: iface.NodeID})
        MERGE (i:Interface {interfaceId: iface.InterfaceID})
        SET i.name = iface.InterfaceName,
            i.caption = iface.Caption,
            i.fullName = iface.FullName,
            i.interfaceIndex = iface.InterfaceIndex,
            i.interfaceType = iface.InterfaceTypeDescription,
            i.macAddress = iface.PhysicalAddress,
            i.adminStatus = iface.AdminStatus,
            i.operStatus = iface.OperStatus,
            i.speed = iface.Speed,
            i.mtu = iface.MTU,
            i.inBandwidth = iface.InBandwidth,
            i.outBandwidth = iface.OutBandwidth,
            i.description = iface.Description,
            i.lastUpdated = datetime()
        MERGE (d)-[:HAS_INTERFACE]->(i)
        `,
        { interfaces }
      );

      console.log('Interfaces loaded successfully');
    } catch (error) {
      console.error('Error loading interfaces:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Load IP addresses and create relationships
   */
  async loadIPAddresses(ipAddresses: SolarWindsIPAddress[]): Promise<void> {
    if (ipAddresses.length === 0) {
      console.log('No IP addresses to load');
      return;
    }

    const session = this.driver.session({
      database: this.config.database || 'neo4j',
    });

    try {
      console.log(`Loading ${ipAddresses.length} IP addresses...`);

      await session.run(
        `
        UNWIND $ipAddresses AS ip
        MATCH (i:Interface {interfaceId: ip.InterfaceID})
        MERGE (addr:IPAddress {address: ip.IPAddress})
        SET addr.subnetMask = ip.SubnetMask,
            addr.ipAddressType = ip.IPAddressType,
            addr.lastUpdated = datetime()
        MERGE (i)-[:HAS_IP]->(addr)
        `,
        { ipAddresses }
      );

      console.log('IP addresses loaded successfully');
    } catch (error) {
      console.error('Error loading IP addresses:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Load network connections (topology links)
   */
  async loadConnections(connections: SolarWindsConnection[]): Promise<void> {
    if (connections.length === 0) {
      console.log('No connections to load (topology discovery may not be enabled)');
      return;
    }

    const session = this.driver.session({
      database: this.config.database || 'neo4j',
    });

    try {
      console.log(`Loading ${connections.length} connections...`);

      await session.run(
        `
        UNWIND $connections AS conn
        MATCH (i1:Interface {interfaceId: conn.LocalInterfaceID})
        MATCH (i2:Interface {interfaceId: conn.RemoteInterfaceID})
        MERGE (i1)-[r:CONNECTED_TO]->(i2)
        SET r.connectionType = conn.ConnectionType,
            r.lastUpdated = datetime()
        `,
        { connections }
      );

      console.log('Connections loaded successfully');
    } catch (error) {
      console.error('Error loading connections:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Create subnets from IP addresses and establish relationships
   */
  async createSubnets(): Promise<void> {
    const session = this.driver.session({
      database: this.config.database || 'neo4j',
    });

    try {
      // Check if there are any IP addresses first
      const countResult = await session.run('MATCH (ip:IPAddress) RETURN count(ip) as count');
      const ipCount = countResult.records[0]?.get('count').toNumber() || 0;

      if (ipCount === 0) {
        console.log('No IP addresses available, skipping subnet creation');
        await session.close();
        return;
      }

      console.log('Creating subnets from IP addresses...');

      // This creates subnets based on the subnet mask
      // You may need to adjust this logic based on your specific requirements
      await session.run(`
        MATCH (ip:IPAddress)
        WHERE ip.subnetMask IS NOT NULL AND ip.address IS NOT NULL
        WITH ip,
             split(ip.address, '.') AS ipParts,
             split(ip.subnetMask, '.') AS maskParts
        WITH ip,
             toInteger(ipParts[0]) AS ip1,
             toInteger(ipParts[1]) AS ip2,
             toInteger(ipParts[2]) AS ip3,
             toInteger(ipParts[3]) AS ip4,
             toInteger(maskParts[0]) AS mask1,
             toInteger(maskParts[1]) AS mask2,
             toInteger(maskParts[2]) AS mask3,
             toInteger(maskParts[3]) AS mask4
        WITH ip,
             toString((ip1 & mask1)) + '.' +
             toString((ip2 & mask2)) + '.' +
             toString((ip3 & mask3)) + '.' +
             toString((ip4 & mask4)) AS networkAddr,
             CASE
               WHEN mask1 = 255 AND mask2 = 255 AND mask3 = 255 AND mask4 = 255 THEN '/32'
               WHEN mask1 = 255 AND mask2 = 255 AND mask3 = 255 AND mask4 = 254 THEN '/31'
               WHEN mask1 = 255 AND mask2 = 255 AND mask3 = 255 AND mask4 = 252 THEN '/30'
               WHEN mask1 = 255 AND mask2 = 255 AND mask3 = 255 AND mask4 = 248 THEN '/29'
               WHEN mask1 = 255 AND mask2 = 255 AND mask3 = 255 AND mask4 = 240 THEN '/28'
               WHEN mask1 = 255 AND mask2 = 255 AND mask3 = 255 AND mask4 = 224 THEN '/27'
               WHEN mask1 = 255 AND mask2 = 255 AND mask3 = 255 AND mask4 = 192 THEN '/26'
               WHEN mask1 = 255 AND mask2 = 255 AND mask3 = 255 AND mask4 = 128 THEN '/25'
               WHEN mask1 = 255 AND mask2 = 255 AND mask3 = 255 THEN '/24'
               WHEN mask1 = 255 AND mask2 = 255 AND mask3 = 0 THEN '/16'
               WHEN mask1 = 255 AND mask2 = 0 THEN '/8'
               ELSE '/0'
             END AS cidr
        MERGE (s:Subnet {network: networkAddr + cidr})
        SET s.networkAddress = networkAddr,
            s.cidr = cidr,
            s.lastUpdated = datetime()
        MERGE (ip)-[:BELONGS_TO_SUBNET]->(s)
      `);

      console.log('Subnets created successfully');
    } catch (error) {
      console.error('Error creating subnets:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Get topology statistics
   */
  async getStats(): Promise<Record<string, number>> {
    const session = this.driver.session({
      database: this.config.database || 'neo4j',
    });

    try {
      const result = await session.run(`
        MATCH (d:Device)
        OPTIONAL MATCH (i:Interface)
        OPTIONAL MATCH (ip:IPAddress)
        OPTIONAL MATCH (s:Subnet)
        OPTIONAL MATCH ()-[c:CONNECTED_TO]->()
        RETURN
          count(DISTINCT d) AS devices,
          count(DISTINCT i) AS interfaces,
          count(DISTINCT ip) AS ipAddresses,
          count(DISTINCT s) AS subnets,
          count(DISTINCT c) AS connections
      `);

      const record = result.records[0];
      return {
        devices: record.get('devices').toNumber(),
        interfaces: record.get('interfaces').toNumber(),
        ipAddresses: record.get('ipAddresses').toNumber(),
        subnets: record.get('subnets').toNumber(),
        connections: record.get('connections').toNumber(),
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Close the driver connection
   */
  async close(): Promise<void> {
    await this.driver.close();
  }
}
