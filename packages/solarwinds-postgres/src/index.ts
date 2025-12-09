import * as dotenv from 'dotenv';
import { SolarWindsClient } from './solarwinds-client';
import { PostgresLoader } from './postgres-loader';
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
    'POSTGRES_HOST',
    'POSTGRES_DATABASE',
    'POSTGRES_USERNAME',
    'POSTGRES_PASSWORD',
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
      certificatePath: process.env.SOLARWINDS_CERT_PATH,
    },
    postgres: {
      host: process.env.POSTGRES_HOST!,
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DATABASE!,
      username: process.env.POSTGRES_USERNAME!,
      password: process.env.POSTGRES_PASSWORD!,
      ssl: process.env.POSTGRES_SSL === 'true',
    },
  };
}

/**
 * Main function to sync SolarWinds topology to PostgreSQL
 */
async function syncTopology() {
  console.log('=== SolarWinds to PostgreSQL Topology Sync ===\n');

  let postgresLoader: PostgresLoader | null = null;

  try {
    // Load configuration
    const config = loadConfig();

    // Initialize clients
    console.log('Initializing clients...');
    const swClient = new SolarWindsClient(config.solarwinds);
    postgresLoader = new PostgresLoader(config.postgres);

    // Test connections
    console.log('\nTesting SolarWinds connection...');
    const swConnected = await swClient.testConnection();
    if (!swConnected) {
      throw new Error('Failed to connect to SolarWinds');
    }
    console.log('✓ SolarWinds connection successful');

    console.log('\nTesting PostgreSQL connection...');
    const pgConnected = await postgresLoader.testConnection();
    if (!pgConnected) {
      throw new Error('Failed to connect to PostgreSQL');
    }
    console.log('✓ PostgreSQL connection successful');

    // Fetch data from SolarWinds
    console.log('\n--- Fetching Data from SolarWinds ---');
    const topologyData = await swClient.getAllTopologyData();

    // Prepare PostgreSQL
    console.log('\n--- Preparing PostgreSQL Database ---');

    // Drop and recreate tables to apply schema changes
    await postgresLoader.dropTables();
    await postgresLoader.createTables();

    // Option to clear existing data
    if (process.env.CLEAR_EXISTING === 'true') {
      await postgresLoader.clearTopology();
    }

    // Load data into PostgreSQL
    console.log('\n--- Loading Data into PostgreSQL ---');
    await postgresLoader.loadDevices(topologyData.nodes);
    await postgresLoader.loadInterfaces(topologyData.interfaces);
    await postgresLoader.loadNodeIPAddresses(topologyData.ipAddresses);
    await postgresLoader.loadL2Connections(topologyData.l2Connections);
    await postgresLoader.loadCdpNeighbors(topologyData.cdpEntries);
    await postgresLoader.loadLldpNeighbors(topologyData.lldpEntries);

    // Get and display statistics
    console.log('\n--- Topology Statistics ---');
    const stats = await postgresLoader.getStats();
    console.log(`Devices: ${stats.devices}`);
    console.log(`Interfaces: ${stats.interfaces}`);
    console.log(`IP Addresses: ${stats.ipAddresses}`);
    console.log(`L2 Connections: ${stats.l2Connections}`);
    console.log(`CDP Neighbors: ${stats.cdpNeighbors}`);
    console.log(`LLDP Neighbors: ${stats.lldpNeighbors}`);

    console.log('\n✓ Topology sync completed successfully!');
  } catch (error) {
    console.error('\n✗ Error during topology sync:', error);
    process.exit(1);
  } finally {
    // Cleanup
    if (postgresLoader) {
      await postgresLoader.close();
    }
  }
}

// Export for use as a module
export { SolarWindsClient } from './solarwinds-client';
export { PostgresLoader } from './postgres-loader';
export * from './types';

// Run if executed directly
if (require.main === module) {
  syncTopology().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
