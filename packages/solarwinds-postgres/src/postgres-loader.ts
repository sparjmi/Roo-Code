import { Pool, PoolClient } from 'pg';
import {
  PostgresConfig,
  SolarWindsNode,
  SolarWindsInterface,
  SolarWindsConnection,
  SolarWindsIPAddress,
} from './types';

/**
 * PostgreSQL Network Topology Loader
 *
 * This class handles loading network topology data from SolarWinds
 * into a PostgreSQL database with the following schema:
 *
 * Tables:
 *   - devices: Network devices (routers, switches, servers)
 *   - interfaces: Network interfaces on devices
 *   - ip_addresses: IP addresses assigned to interfaces
 *   - connections: Network connections between interfaces
 *
 * Relationships:
 *   - interfaces.node_id -> devices.node_id
 *   - ip_addresses.interface_id -> interfaces.interface_id
 *   - connections.local_interface_id -> interfaces.interface_id
 *   - connections.remote_interface_id -> interfaces.interface_id
 */
export class PostgresLoader {
  private pool: Pool;
  private config: PostgresConfig;

  constructor(config: PostgresConfig) {
    this.config = config;
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
    });
  }

  /**
   * Test the connection to PostgreSQL
   */
  async testConnection(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      return true;
    } catch (error) {
      console.error('PostgreSQL connection test failed:', error);
      return false;
    }
  }

  /**
   * Create tables with proper schema and relationships
   */
  async createTables(): Promise<void> {
    const client = await this.pool.connect();

    try {
      console.log('Creating PostgreSQL tables...');

      await client.query('BEGIN');

      // Create devices table
      await client.query(`
        CREATE TABLE IF NOT EXISTS devices (
          node_id INTEGER PRIMARY KEY,
          caption VARCHAR(255),
          node_name VARCHAR(255),
          ip_address VARCHAR(50),
          vendor VARCHAR(255),
          machine_type VARCHAR(255),
          location VARCHAR(255),
          status INTEGER,
          status_description VARCHAR(100),
          object_sub_type VARCHAR(100),
          ios_version VARCHAR(100),
          community VARCHAR(255),
          contact VARCHAR(255),
          description TEXT,
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create interfaces table with foreign key to devices
      await client.query(`
        CREATE TABLE IF NOT EXISTS interfaces (
          interface_id INTEGER PRIMARY KEY,
          node_id INTEGER NOT NULL,
          interface_name VARCHAR(255),
          caption VARCHAR(255),
          full_name VARCHAR(500),
          interface_index INTEGER,
          interface_type INTEGER,
          interface_type_description VARCHAR(255),
          physical_address VARCHAR(50),
          admin_status INTEGER,
          oper_status INTEGER,
          speed BIGINT,
          mtu INTEGER,
          in_bandwidth BIGINT,
          out_bandwidth BIGINT,
          description TEXT,
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (node_id) REFERENCES devices(node_id) ON DELETE CASCADE
        )
      `);

      // Create ip_addresses table with foreign key to interfaces
      await client.query(`
        CREATE TABLE IF NOT EXISTS ip_addresses (
          ip_address_id INTEGER PRIMARY KEY,
          interface_id INTEGER NOT NULL,
          ip_address VARCHAR(50) NOT NULL,
          subnet_mask VARCHAR(50),
          ip_address_type VARCHAR(50),
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (interface_id) REFERENCES interfaces(interface_id) ON DELETE CASCADE
        )
      `);

      // Create connections table with foreign keys to interfaces
      await client.query(`
        CREATE TABLE IF NOT EXISTS connections (
          connection_id SERIAL PRIMARY KEY,
          local_node_id INTEGER,
          local_interface_id INTEGER NOT NULL,
          remote_node_id INTEGER,
          remote_interface_id INTEGER NOT NULL,
          connection_type VARCHAR(50),
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (local_interface_id) REFERENCES interfaces(interface_id) ON DELETE CASCADE,
          FOREIGN KEY (remote_interface_id) REFERENCES interfaces(interface_id) ON DELETE CASCADE,
          UNIQUE (local_interface_id, remote_interface_id)
        )
      `);

      // Create indexes for better query performance
      await client.query('CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(ip_address)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_devices_vendor ON devices(vendor)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_devices_location ON devices(location)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_interfaces_node_id ON interfaces(node_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_interfaces_name ON interfaces(interface_name)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_ip_addresses_interface_id ON ip_addresses(interface_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_ip_addresses_ip ON ip_addresses(ip_address)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_connections_local_iface ON connections(local_interface_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_connections_remote_iface ON connections(remote_interface_id)');

      await client.query('COMMIT');
      console.log('Tables created successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating tables:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Clear all existing topology data
   */
  async clearTopology(): Promise<void> {
    const client = await this.pool.connect();

    try {
      console.log('Clearing existing topology data...');
      await client.query('BEGIN');

      // Delete in order to respect foreign key constraints
      await client.query('DELETE FROM connections');
      await client.query('DELETE FROM ip_addresses');
      await client.query('DELETE FROM interfaces');
      await client.query('DELETE FROM devices');

      await client.query('COMMIT');
      console.log('Topology data cleared');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error clearing topology:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Load devices into PostgreSQL
   */
  async loadDevices(nodes: SolarWindsNode[]): Promise<void> {
    if (nodes.length === 0) {
      console.log('No devices to load');
      return;
    }

    const client = await this.pool.connect();

    try {
      console.log(`Loading ${nodes.length} devices...`);
      await client.query('BEGIN');

      // Use batch insert with ON CONFLICT to handle updates
      for (const node of nodes) {
        await client.query(
          `
          INSERT INTO devices (
            node_id, caption, node_name, ip_address, vendor, machine_type,
            location, status, status_description, object_sub_type, ios_version,
            community, contact, description, last_updated
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
          ON CONFLICT (node_id) DO UPDATE SET
            caption = EXCLUDED.caption,
            node_name = EXCLUDED.node_name,
            ip_address = EXCLUDED.ip_address,
            vendor = EXCLUDED.vendor,
            machine_type = EXCLUDED.machine_type,
            location = EXCLUDED.location,
            status = EXCLUDED.status,
            status_description = EXCLUDED.status_description,
            object_sub_type = EXCLUDED.object_sub_type,
            ios_version = EXCLUDED.ios_version,
            community = EXCLUDED.community,
            contact = EXCLUDED.contact,
            description = EXCLUDED.description,
            last_updated = CURRENT_TIMESTAMP
          `,
          [
            node.NodeID,
            node.Caption,
            node.NodeName,
            node.IPAddress,
            node.Vendor,
            node.MachineType,
            node.Location,
            node.Status,
            node.StatusDescription,
            node.ObjectSubType,
            node.IOSVersion,
            node.Community,
            node.Contact,
            node.Description,
          ]
        );
      }

      await client.query('COMMIT');
      console.log('Devices loaded successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error loading devices:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Load interfaces into PostgreSQL
   */
  async loadInterfaces(interfaces: SolarWindsInterface[]): Promise<void> {
    if (interfaces.length === 0) {
      console.log('No interfaces to load');
      return;
    }

    const client = await this.pool.connect();

    try {
      console.log(`Loading ${interfaces.length} interfaces...`);
      await client.query('BEGIN');

      for (const iface of interfaces) {
        await client.query(
          `
          INSERT INTO interfaces (
            interface_id, node_id, interface_name, caption, full_name,
            interface_index, interface_type, interface_type_description,
            physical_address, admin_status, oper_status, speed, mtu,
            in_bandwidth, out_bandwidth, description, last_updated
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP)
          ON CONFLICT (interface_id) DO UPDATE SET
            node_id = EXCLUDED.node_id,
            interface_name = EXCLUDED.interface_name,
            caption = EXCLUDED.caption,
            full_name = EXCLUDED.full_name,
            interface_index = EXCLUDED.interface_index,
            interface_type = EXCLUDED.interface_type,
            interface_type_description = EXCLUDED.interface_type_description,
            physical_address = EXCLUDED.physical_address,
            admin_status = EXCLUDED.admin_status,
            oper_status = EXCLUDED.oper_status,
            speed = EXCLUDED.speed,
            mtu = EXCLUDED.mtu,
            in_bandwidth = EXCLUDED.in_bandwidth,
            out_bandwidth = EXCLUDED.out_bandwidth,
            description = EXCLUDED.description,
            last_updated = CURRENT_TIMESTAMP
          `,
          [
            iface.InterfaceID,
            iface.NodeID,
            iface.InterfaceName,
            iface.Caption,
            iface.FullName,
            iface.InterfaceIndex,
            iface.InterfaceType,
            iface.InterfaceTypeDescription,
            iface.PhysicalAddress,
            iface.AdminStatus,
            iface.OperStatus,
            iface.Speed,
            iface.MTU,
            iface.InBandwidth,
            iface.OutBandwidth,
            iface.Description,
          ]
        );
      }

      await client.query('COMMIT');
      console.log('Interfaces loaded successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error loading interfaces:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Load IP addresses into PostgreSQL
   */
  async loadIPAddresses(ipAddresses: SolarWindsIPAddress[]): Promise<void> {
    if (ipAddresses.length === 0) {
      console.log('No IP addresses to load');
      return;
    }

    const client = await this.pool.connect();

    try {
      console.log(`Loading ${ipAddresses.length} IP addresses...`);
      await client.query('BEGIN');

      for (const ip of ipAddresses) {
        await client.query(
          `
          INSERT INTO ip_addresses (
            ip_address_id, interface_id, ip_address, subnet_mask,
            ip_address_type, last_updated
          ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
          ON CONFLICT (ip_address_id) DO UPDATE SET
            interface_id = EXCLUDED.interface_id,
            ip_address = EXCLUDED.ip_address,
            subnet_mask = EXCLUDED.subnet_mask,
            ip_address_type = EXCLUDED.ip_address_type,
            last_updated = CURRENT_TIMESTAMP
          `,
          [ip.IPAddressID, ip.InterfaceID, ip.IPAddress, ip.SubnetMask, ip.IPAddressType]
        );
      }

      await client.query('COMMIT');
      console.log('IP addresses loaded successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error loading IP addresses:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Load network connections into PostgreSQL
   */
  async loadConnections(connections: SolarWindsConnection[]): Promise<void> {
    if (connections.length === 0) {
      console.log('No connections to load (topology discovery may not be enabled)');
      return;
    }

    const client = await this.pool.connect();

    try {
      console.log(`Loading ${connections.length} connections...`);
      await client.query('BEGIN');

      for (const conn of connections) {
        await client.query(
          `
          INSERT INTO connections (
            local_node_id, local_interface_id, remote_node_id,
            remote_interface_id, connection_type, last_updated
          ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
          ON CONFLICT (local_interface_id, remote_interface_id) DO UPDATE SET
            local_node_id = EXCLUDED.local_node_id,
            remote_node_id = EXCLUDED.remote_node_id,
            connection_type = EXCLUDED.connection_type,
            last_updated = CURRENT_TIMESTAMP
          `,
          [
            conn.LocalNodeID,
            conn.LocalInterfaceID,
            conn.RemoteNodeID,
            conn.RemoteInterfaceID,
            conn.ConnectionType,
          ]
        );
      }

      await client.query('COMMIT');
      console.log('Connections loaded successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error loading connections:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get topology statistics
   */
  async getStats(): Promise<Record<string, number>> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(`
        SELECT
          (SELECT COUNT(*) FROM devices) AS devices,
          (SELECT COUNT(*) FROM interfaces) AS interfaces,
          (SELECT COUNT(*) FROM ip_addresses) AS ip_addresses,
          (SELECT COUNT(*) FROM connections) AS connections
      `);

      return {
        devices: parseInt(result.rows[0].devices),
        interfaces: parseInt(result.rows[0].interfaces),
        ipAddresses: parseInt(result.rows[0].ip_addresses),
        connections: parseInt(result.rows[0].connections),
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close the database connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
