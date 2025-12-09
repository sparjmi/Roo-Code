import { Pool, PoolClient } from 'pg';
import {
  PostgresConfig,
  SolarWindsNode,
  SolarWindsInterface,
  SolarWindsConnection,
  SolarWindsIPAddress,
  SolarWindsL2Connection,
  SolarWindsCdpEntry,
  SolarWindsLldpEntry,
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
   * Drop all existing tables (use with caution!)
   */
  async dropTables(): Promise<void> {
    const client = await this.pool.connect();

    try {
      console.log('Dropping existing tables...');
      await client.query('BEGIN');

      // Drop in order to respect foreign key constraints
      await client.query('DROP TABLE IF EXISTS lldp_neighbors CASCADE');
      await client.query('DROP TABLE IF EXISTS cdp_neighbors CASCADE');
      await client.query('DROP TABLE IF EXISTS l2_connections CASCADE');
      await client.query('DROP TABLE IF EXISTS node_ip_addresses CASCADE');
      await client.query('DROP TABLE IF EXISTS interfaces CASCADE');
      await client.query('DROP TABLE IF EXISTS devices CASCADE');

      await client.query('COMMIT');
      console.log('Tables dropped successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error dropping tables:', error);
      throw error;
    } finally {
      client.release();
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
          caption VARCHAR(500),
          node_name VARCHAR(500),
          ip_address VARCHAR(100),
          vendor VARCHAR(500),
          machine_type VARCHAR(500),
          location VARCHAR(500),
          status INTEGER,
          status_description VARCHAR(500),
          object_sub_type VARCHAR(500),
          ios_version VARCHAR(500),
          community VARCHAR(500),
          contact VARCHAR(500),
          description TEXT,
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create interfaces table with foreign key to devices
      await client.query(`
        CREATE TABLE IF NOT EXISTS interfaces (
          interface_id INTEGER PRIMARY KEY,
          node_id INTEGER NOT NULL,
          interface_name VARCHAR(500),
          caption VARCHAR(500),
          full_name VARCHAR(1000),
          interface_index INTEGER,
          interface_type INTEGER,
          interface_type_description VARCHAR(500),
          physical_address VARCHAR(100),
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

      // Create node_ip_addresses table with foreign key to devices
      await client.query(`
        CREATE TABLE IF NOT EXISTS node_ip_addresses (
          node_id INTEGER NOT NULL,
          ip_address VARCHAR(100) NOT NULL,
          ip_address_n VARCHAR(100),
          subnet_mask VARCHAR(100),
          ip_address_type VARCHAR(100),
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (node_id) REFERENCES devices(node_id) ON DELETE CASCADE,
          PRIMARY KEY (node_id, ip_address)
        )
      `);

      // Create l2_connections table - MAC addresses seen on switch ports
      await client.query(`
        CREATE TABLE IF NOT EXISTS l2_connections (
          connection_id SERIAL PRIMARY KEY,
          node_id INTEGER NOT NULL,
          port_id INTEGER NOT NULL,
          mac_address VARCHAR(50),
          vlan_id INTEGER,
          status INTEGER,
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (node_id) REFERENCES devices(node_id) ON DELETE CASCADE,
          UNIQUE (node_id, port_id, mac_address)
        )
      `);

      // Create cdp_neighbors table
      await client.query(`
        CREATE TABLE IF NOT EXISTS cdp_neighbors (
          neighbor_id SERIAL PRIMARY KEY,
          node_id INTEGER NOT NULL,
          if_index INTEGER NOT NULL,
          device_id VARCHAR(500),
          device_port VARCHAR(500),
          ip_address VARCHAR(100),
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (node_id) REFERENCES devices(node_id) ON DELETE CASCADE
        )
      `);

      // Create lldp_neighbors table
      await client.query(`
        CREATE TABLE IF NOT EXISTS lldp_neighbors (
          neighbor_id SERIAL PRIMARY KEY,
          node_id INTEGER NOT NULL,
          local_port_number INTEGER NOT NULL,
          remote_system_name VARCHAR(500),
          remote_port_id VARCHAR(500),
          remote_port_description VARCHAR(500),
          remote_ip_address VARCHAR(100),
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (node_id) REFERENCES devices(node_id) ON DELETE CASCADE
        )
      `);

      // Create indexes for better query performance
      await client.query('CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(ip_address)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_devices_vendor ON devices(vendor)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_devices_location ON devices(location)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_interfaces_node_id ON interfaces(node_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_interfaces_name ON interfaces(interface_name)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_node_ip_addresses_node_id ON node_ip_addresses(node_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_node_ip_addresses_ip ON node_ip_addresses(ip_address)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_l2_connections_node ON l2_connections(node_id, port_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_l2_connections_mac ON l2_connections(mac_address)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_l2_connections_vlan ON l2_connections(vlan_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_cdp_neighbors_node ON cdp_neighbors(node_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_cdp_neighbors_device ON cdp_neighbors(device_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_lldp_neighbors_node ON lldp_neighbors(node_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_lldp_neighbors_remote ON lldp_neighbors(remote_system_name)');

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
  async loadNodeIPAddresses(ipAddresses: SolarWindsIPAddress[]): Promise<void> {
    if (ipAddresses.length === 0) {
      console.log('No IP addresses to load');
      return;
    }

    const client = await this.pool.connect();

    try {
      console.log(`Loading ${ipAddresses.length} node IP addresses...`);
      await client.query('BEGIN');

      let loaded = 0;
      let skipped = 0;

      for (const ip of ipAddresses) {
        try {
          // Only insert if the node_id exists in devices table
          await client.query(
            `
            INSERT INTO node_ip_addresses (
              node_id, ip_address, ip_address_n, subnet_mask,
              ip_address_type, last_updated
            )
            SELECT $1, $2, $3, $4, $5, CURRENT_TIMESTAMP
            WHERE EXISTS (SELECT 1 FROM devices WHERE node_id = $1)
            ON CONFLICT (node_id, ip_address) DO UPDATE SET
              ip_address_n = EXCLUDED.ip_address_n,
              subnet_mask = EXCLUDED.subnet_mask,
              ip_address_type = EXCLUDED.ip_address_type,
              last_updated = CURRENT_TIMESTAMP
            `,
            [ip.NodeID, ip.IPAddress, ip.IPAddressN, ip.SubnetMask, ip.IPAddressType]
          );
          loaded++;
        } catch (error: any) {
          // Skip IP addresses for nodes that don't exist
          if (error.code === '23503') {
            skipped++;
          } else {
            throw error;
          }
        }
      }

      await client.query('COMMIT');
      console.log(`Node IP addresses loaded successfully (${loaded} loaded, ${skipped} skipped orphaned)`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error loading node IP addresses:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Load L2 connections into PostgreSQL
   */
  async loadL2Connections(connections: SolarWindsL2Connection[]): Promise<void> {
    if (connections.length === 0) {
      console.log('No L2 connections to load');
      return;
    }

    const client = await this.pool.connect();

    try {
      console.log(`Loading ${connections.length} L2 MAC-to-port mappings...`);
      await client.query('BEGIN');

      for (const conn of connections) {
        await client.query(
          `
          INSERT INTO l2_connections (
            node_id, port_id, mac_address, vlan_id, status, last_updated
          ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
          ON CONFLICT (node_id, port_id, mac_address) DO UPDATE SET
            vlan_id = EXCLUDED.vlan_id,
            status = EXCLUDED.status,
            last_updated = CURRENT_TIMESTAMP
          `,
          [
            conn.NodeID,
            conn.PortID,
            conn.MACAddress,
            conn.VlanId,
            conn.Status,
          ]
        );
      }

      await client.query('COMMIT');
      console.log('L2 MAC-to-port mappings loaded successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error loading L2 connections:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Load CDP neighbor entries into PostgreSQL
   */
  async loadCdpNeighbors(cdpEntries: SolarWindsCdpEntry[]): Promise<void> {
    if (cdpEntries.length === 0) {
      console.log('No CDP neighbors to load');
      return;
    }

    const client = await this.pool.connect();

    try {
      console.log(`Loading ${cdpEntries.length} CDP neighbors...`);
      await client.query('BEGIN');

      for (const entry of cdpEntries) {
        await client.query(
          `
          INSERT INTO cdp_neighbors (
            node_id, if_index, device_id, device_port,
            ip_address, last_updated
          ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
          ON CONFLICT (neighbor_id) DO NOTHING
          `,
          [
            entry.NodeID,
            entry.IfIndex,
            entry.DeviceId,
            entry.DevicePort,
            entry.IpAddress,
          ]
        );
      }

      await client.query('COMMIT');
      console.log('CDP neighbors loaded successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error loading CDP neighbors:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Load LLDP neighbor entries into PostgreSQL
   */
  async loadLldpNeighbors(lldpEntries: SolarWindsLldpEntry[]): Promise<void> {
    if (lldpEntries.length === 0) {
      console.log('No LLDP neighbors to load');
      return;
    }

    const client = await this.pool.connect();

    try {
      console.log(`Loading ${lldpEntries.length} LLDP neighbors...`);
      await client.query('BEGIN');

      for (const entry of lldpEntries) {
        await client.query(
          `
          INSERT INTO lldp_neighbors (
            node_id, local_port_number, remote_system_name, remote_port_id,
            remote_port_description, remote_ip_address, last_updated
          ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
          ON CONFLICT (neighbor_id) DO NOTHING
          `,
          [
            entry.NodeID,
            entry.LocalPortNumber,
            entry.RemoteSystemName,
            entry.RemotePortId,
            entry.RemotePortDescription,
            entry.RemoteIpAddress,
          ]
        );
      }

      await client.query('COMMIT');
      console.log('LLDP neighbors loaded successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error loading LLDP neighbors:', error);
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
          (SELECT COUNT(*) FROM node_ip_addresses) AS ip_addresses,
          (SELECT COUNT(*) FROM l2_connections) AS l2_connections,
          (SELECT COUNT(*) FROM cdp_neighbors) AS cdp_neighbors,
          (SELECT COUNT(*) FROM lldp_neighbors) AS lldp_neighbors
      `);

      return {
        devices: parseInt(result.rows[0].devices),
        interfaces: parseInt(result.rows[0].interfaces),
        ipAddresses: parseInt(result.rows[0].ip_addresses),
        l2Connections: parseInt(result.rows[0].l2_connections),
        cdpNeighbors: parseInt(result.rows[0].cdp_neighbors),
        lldpNeighbors: parseInt(result.rows[0].lldp_neighbors),
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
