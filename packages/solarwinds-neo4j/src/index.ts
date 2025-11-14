import * as dotenv from 'dotenv';
import { SolarWindsClient } from './solarwinds-client';
import { Neo4jLoader } from './neo4j-loader';
import { AppConfig } from './types';

// Load environment variables
dotenv.config();

/**
 * Load configuration from environment variables
 */
function loadConfig(): AppConfig {
  const requiredEnvVars = [
    'SOLARWINDS_URL',
    'SOLARWINDS_USERNAME',
    'SOLARWINDS_PASSWORD',
    'NEO4J_URI',
    'NEO4J_USERNAME',
    'NEO4J_PASSWORD',
  ];

  const missing = requiredEnvVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    solarwinds: {
      baseUrl: process.env.SOLARWINDS_URL!,
      username: process.env.SOLARWINDS_USERNAME!,
      password: process.env.SOLARWINDS_PASSWORD!,
      verifySSL: process.env.SOLARWINDS_VERIFY_SSL !== 'false',
    },
    neo4j: {
      uri: process.env.NEO4J_URI!,
      username: process.env.NEO4J_USERNAME!,
      password: process.env.NEO4J_PASSWORD!,
      database: process.env.NEO4J_DATABASE || 'neo4j',
    },
  };
}

/**
 * Main function to sync SolarWinds topology to Neo4j
 */
async function syncTopology() {
  console.log('=== SolarWinds to Neo4j Topology Sync ===\n');

  let neo4jLoader: Neo4jLoader | null = null;

  try {
    // Load configuration
    const config = loadConfig();

    // Initialize clients
    console.log('Initializing clients...');
    const swClient = new SolarWindsClient(config.solarwinds);
    neo4jLoader = new Neo4jLoader(config.neo4j);

    // Test connections
    console.log('\nTesting SolarWinds connection...');
    const swConnected = await swClient.testConnection();
    if (!swConnected) {
      throw new Error('Failed to connect to SolarWinds');
    }
    console.log('✓ SolarWinds connection successful');

    console.log('\nTesting Neo4j connection...');
    const neo4jConnected = await neo4jLoader.testConnection();
    if (!neo4jConnected) {
      throw new Error('Failed to connect to Neo4j');
    }
    console.log('✓ Neo4j connection successful');

    // Fetch data from SolarWinds
    console.log('\n--- Fetching Data from SolarWinds ---');
    const topologyData = await swClient.getAllTopologyData();

    // Prepare Neo4j
    console.log('\n--- Preparing Neo4j Database ---');
    await neo4jLoader.createIndexes();

    // Option to clear existing data
    if (process.env.CLEAR_EXISTING === 'true') {
      await neo4jLoader.clearTopology();
    }

    // Load data into Neo4j
    console.log('\n--- Loading Data into Neo4j ---');
    await neo4jLoader.loadDevices(topologyData.nodes);
    await neo4jLoader.loadInterfaces(topologyData.interfaces);
    await neo4jLoader.loadIPAddresses(topologyData.ipAddresses);
    await neo4jLoader.loadConnections(topologyData.connections);
    await neo4jLoader.createSubnets();

    // Get and display statistics
    console.log('\n--- Topology Statistics ---');
    const stats = await neo4jLoader.getStats();
    console.log(`Devices: ${stats.devices}`);
    console.log(`Interfaces: ${stats.interfaces}`);
    console.log(`IP Addresses: ${stats.ipAddresses}`);
    console.log(`Subnets: ${stats.subnets}`);
    console.log(`Connections: ${stats.connections}`);

    console.log('\n✓ Topology sync completed successfully!');
  } catch (error) {
    console.error('\n✗ Error during topology sync:', error);
    process.exit(1);
  } finally {
    // Cleanup
    if (neo4jLoader) {
      await neo4jLoader.close();
    }
  }
}

// Export for use as a module
export { SolarWindsClient } from './solarwinds-client';
export { Neo4jLoader } from './neo4j-loader';
export * from './types';

// Run if executed directly
if (require.main === module) {
  syncTopology().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
