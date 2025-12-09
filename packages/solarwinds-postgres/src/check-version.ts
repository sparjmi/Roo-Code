import * as dotenv from 'dotenv';
import { SolarWindsClient } from './solarwinds-client';

dotenv.config();

/**
 * Check SolarWinds version and available entities
 */
async function checkVersion() {
  console.log('=== SolarWinds Version Checker ===\n');

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

    // Get version information
    console.log('--- Version Information ---');
    try {
      const versionQuery = `
        SELECT
          ProductName,
          ProductVersion,
          ProductTag,
          ReleaseDate
        FROM Orion.Products
      `;

      const products = await client.query<{
        ProductName: string;
        ProductVersion: string;
        ProductTag: string;
        ReleaseDate: string;
      }>(versionQuery);

      if (products.length > 0) {
        console.log('\nInstalled Products:');
        products.forEach(product => {
          console.log(`\n${product.ProductName}`);
          console.log(`  Version: ${product.ProductVersion}`);
          console.log(`  Tag: ${product.ProductTag}`);
          console.log(`  Release Date: ${product.ReleaseDate}`);
        });
      }
    } catch (error) {
      console.error('Could not query product version:', error);
    }

    // Check for available topology entities
    console.log('\n--- Available Topology Entities ---');
    const topologyEntities = [
      'Orion.Nodes',
      'Orion.NPM.Interfaces',
      'Orion.NPM.IPAddresses',
      'Orion.IPAM.IPNode',
      'Orion.Topology.InterfaceNeighbors',
      'Orion.NPM.InterfaceNeighbors',
      'Orion.NPM.CDPNeighbors',
      'Orion.NPM.LLDPNeighbors',
    ];

    for (const entity of topologyEntities) {
      try {
        await client.query(`SELECT TOP 1 * FROM ${entity}`);
        console.log(`✓ ${entity}`);
      } catch (error: any) {
        if (error.response?.status === 400) {
          console.log(`✗ ${entity} (not available)`);
        } else {
          console.log(`? ${entity} (error checking: ${error.message})`);
        }
      }
    }

    console.log('\n✓ Version check complete!');
  } catch (error) {
    console.error('\n✗ Error:', error);
    process.exit(1);
  }
}

checkVersion();
