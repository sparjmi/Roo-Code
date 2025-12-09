import * as dotenv from 'dotenv';
import { SolarWindsClient } from './solarwinds-client';

dotenv.config();

/**
 * Inspect the actual schema of specific SolarWinds entities
 */
async function inspectSchema() {
  console.log('=== SolarWinds Entity Schema Inspector ===\n');

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

    // Entities to inspect
    const entitiesToInspect = [
      'Orion.NodeL2Connections',
      'Orion.NodeCdpEntry',
      'Orion.NodeLldpEntry',
    ];

    for (const entityName of entitiesToInspect) {
      console.log(`\n=== ${entityName} ===`);

      try {
        // Get properties for this entity from metadata
        const propertiesQuery = `
          SELECT
            Name,
            Type,
            IsNavigable,
            IsInherited
          FROM Metadata.Property
          WHERE EntityName = '${entityName}'
          ORDER BY Name
        `;

        const properties = await client.query<{
          Name: string;
          Type: string;
          IsNavigable: boolean;
          IsInherited: boolean;
        }>(propertiesQuery);

        if (properties.length > 0) {
          console.log('\nAvailable Properties:');
          properties.forEach(prop => {
            const nav = prop.IsNavigable ? ' (navigable)' : '';
            const inherited = prop.IsInherited ? ' (inherited)' : '';
            console.log(`  - ${prop.Name}: ${prop.Type}${nav}${inherited}`);
          });
        } else {
          console.log('No properties found in metadata');
        }

        // Try to get a sample row
        console.log('\nSample Data (TOP 1):');
        try {
          const sampleQuery = `SELECT TOP 1 * FROM ${entityName}`;
          const sample = await client.query(sampleQuery);

          if (sample.length > 0) {
            console.log(JSON.stringify(sample[0], null, 2));
          } else {
            console.log('No data available');
          }
        } catch (error: any) {
          console.log(`Could not fetch sample: ${error.message}`);
        }

      } catch (error: any) {
        console.error(`Error inspecting ${entityName}:`, error.message);
      }
    }

    console.log('\n✓ Schema inspection complete!');
  } catch (error) {
    console.error('\n✗ Error:', error);
    process.exit(1);
  }
}

inspectSchema();
