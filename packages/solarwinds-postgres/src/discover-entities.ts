import * as dotenv from 'dotenv';
import { SolarWindsClient } from './solarwinds-client';

dotenv.config();

/**
 * Discover all available SolarWinds entities and their schemas
 */
async function discoverEntities() {
  console.log('=== SolarWinds Entity Discovery ===\n');

  try {
    const config = {
      baseUrl: process.env.SOLARWINDS_URL!,
      username: process.env.SOLARWINDS_USERNAME!,
      password: process.env.SOLARWINDS_PASSWORD!,
      verifySSL: process.env.SOLARWINDS_VERIFY_SSL !== 'false',
      certificatePath: process.env.SOLARWINDS_CERT_PATH,
    };

    const client = new SolarWindsClient(config);

    // Test connection first
    console.log('Testing connection...');
    const connected = await client.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to SolarWinds');
    }
    console.log('✓ Connected successfully\n');

    // Discover all entities
    console.log('--- Discovering All Entities ---\n');
    console.log('Querying entity metadata (this may take a moment)...\n');

    const metadataQuery = `
      SELECT
        Namespace,
        Name,
        FullName,
        BaseType
      FROM Metadata.Entity
      WHERE Namespace LIKE 'Orion%'
      ORDER BY Namespace, Name
    `;

    const entities = await client.query<{
      Namespace: string;
      Name: string;
      FullName: string;
      BaseType: string;
    }>(metadataQuery);

    console.log(`Found ${entities.length} entities\n`);

    // Group by namespace
    const grouped: Record<string, typeof entities> = {};
    entities.forEach(entity => {
      if (!grouped[entity.Namespace]) {
        grouped[entity.Namespace] = [];
      }
      grouped[entity.Namespace].push(entity);
    });

    // Look for topology-related entities
    console.log('\n=== TOPOLOGY & CONNECTION ENTITIES ===');
    const topologyKeywords = ['neighbor', 'topology', 'connection', 'link', 'cdp', 'lldp', 'l2', 'layer'];
    const topologyEntities = entities.filter(e =>
      topologyKeywords.some(kw => e.FullName.toLowerCase().includes(kw))
    );

    if (topologyEntities.length > 0) {
      topologyEntities.forEach(e => {
        console.log(`  ${e.FullName}`);
      });
    } else {
      console.log('  No topology entities found');
    }

    // Look for IP address-related entities
    console.log('\n=== IP ADDRESS ENTITIES ===');
    const ipKeywords = ['ip', 'address', 'ipam'];
    const ipEntities = entities.filter(e =>
      ipKeywords.some(kw => e.FullName.toLowerCase().includes(kw)) &&
      !e.FullName.toLowerCase().includes('ipaddresstype') // exclude enum types
    );

    if (ipEntities.length > 0) {
      ipEntities.forEach(e => {
        console.log(`  ${e.FullName}`);
      });
    } else {
      console.log('  No IP address entities found');
    }

    // Look for interface-related entities
    console.log('\n=== INTERFACE ENTITIES ===');
    const interfaceEntities = entities.filter(e =>
      e.FullName.toLowerCase().includes('interface') &&
      !e.FullName.toLowerCase().includes('interfacetype') // exclude enum types
    );

    if (interfaceEntities.length > 0) {
      interfaceEntities.forEach(e => {
        console.log(`  ${e.FullName}`);
      });
    } else {
      console.log('  No interface entities found');
    }

    // Display all namespaces
    console.log('\n=== ALL NAMESPACES ===');
    Object.keys(grouped).sort().forEach(namespace => {
      console.log(`\n${namespace} (${grouped[namespace].length} entities)`);
      grouped[namespace].forEach(e => {
        console.log(`  - ${e.Name}`);
      });
    });

    // Now let's try some specific queries to see what data is actually available
    console.log('\n\n=== TESTING SPECIFIC QUERIES ===\n');

    // Test if interfaces have IP addresses directly
    console.log('Testing Orion.NPM.Interfaces for IP address fields...');
    try {
      const interfaceWithIP = await client.query(`
        SELECT TOP 5
          InterfaceID,
          NodeID,
          InterfaceName,
          IPAddress,
          Caption
        FROM Orion.NPM.Interfaces
        WHERE IPAddress IS NOT NULL
          AND IPAddress != ''
          AND IPAddress != '0.0.0.0'
      `);
      console.log(`✓ Found ${interfaceWithIP.length} interfaces with IP addresses`);
      if (interfaceWithIP.length > 0) {
        console.log('  Sample:', JSON.stringify(interfaceWithIP[0], null, 2));
      }
    } catch (error: any) {
      console.log(`✗ Failed: ${error.message}`);
    }

    // Test nodes for IP addresses
    console.log('\nTesting Orion.Nodes for IP address information...');
    try {
      const nodesWithIP = await client.query(`
        SELECT TOP 5
          NodeID,
          Caption,
          IPAddress,
          IPAddressType
        FROM Orion.Nodes
        WHERE IPAddress IS NOT NULL
      `);
      console.log(`✓ Found ${nodesWithIP.length} nodes with IP addresses`);
      if (nodesWithIP.length > 0) {
        console.log('  Sample:', JSON.stringify(nodesWithIP[0], null, 2));
      }
    } catch (error: any) {
      console.log(`✗ Failed: ${error.message}`);
    }

    // Look for any Layer 2 topology data
    console.log('\nSearching for Layer 2 topology data...');
    const l2Entities = [
      'Orion.NPM.L2TopologyNeighbors',
      'Orion.Core.DiscoveredNeighbors',
      'Orion.Topology.NetworkTopology',
    ];

    for (const entity of l2Entities) {
      try {
        const results = await client.query(`SELECT TOP 1 * FROM ${entity}`);
        console.log(`✓ ${entity} exists and has data!`);
        console.log('  Sample:', JSON.stringify(results[0], null, 2));
      } catch (error: any) {
        if (error.response?.status === 400) {
          console.log(`✗ ${entity} not found`);
        } else {
          console.log(`? ${entity} - error: ${error.message}`);
        }
      }
    }

    console.log('\n✓ Discovery complete!');
    console.log('\nNext steps:');
    console.log('1. Review the topology/IP entities listed above');
    console.log('2. Check if Orion.NPM.Interfaces has IP addresses directly');
    console.log('3. If you see promising entities, let me know and I can update the queries');

  } catch (error) {
    console.error('\n✗ Error:', error);
    process.exit(1);
  }
}

discoverEntities();
