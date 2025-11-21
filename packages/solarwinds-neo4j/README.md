# SolarWinds NPM to Neo4j Network Topology Integration

This package provides a complete solution for querying SolarWinds Network Performance Monitor (NPM) API and building a network topology map in a Neo4j graph database.

## Features

- **SolarWinds NPM API Client**: Query network devices, interfaces, connections, and IP addresses using SWQL (SolarWinds Query Language)
- **Neo4j Graph Database Integration**: Transform network data into an intuitive graph structure
- **Automated Topology Mapping**: Automatically create relationships between devices, interfaces, and IP addresses
- **Subnet Discovery**: Automatically identify and create subnet nodes based on IP address and subnet mask
- **Performance Optimized**: Uses batch operations and indexes for efficient data loading

## Graph Schema

The integration creates the following graph structure:

### Nodes

- **Device**: Network devices (routers, switches, servers, etc.)
  - Properties: `nodeId`, `name`, `ipAddress`, `vendor`, `machineType`, `location`, `status`, etc.

- **Interface**: Network interfaces on devices
  - Properties: `interfaceId`, `name`, `macAddress`, `adminStatus`, `operStatus`, `speed`, `mtu`, etc.

- **IPAddress**: IP addresses assigned to interfaces
  - Properties: `address`, `subnetMask`, `ipAddressType`

- **Subnet**: Network subnets
  - Properties: `network`, `networkAddress`, `cidr`

### Relationships

- **HAS_INTERFACE**: `(Device)-[:HAS_INTERFACE]->(Interface)`
- **HAS_IP**: `(Interface)-[:HAS_IP]->(IPAddress)`
- **BELONGS_TO_SUBNET**: `(IPAddress)-[:BELONGS_TO_SUBNET]->(Subnet)`
- **CONNECTED_TO**: `(Interface)-[:CONNECTED_TO]->(Interface)` - Physical network connections

## Prerequisites

1. **SolarWinds NPM Instance**: Access to a SolarWinds NPM installation with API access
2. **Neo4j Database**: A running Neo4j instance (4.x or 5.x)
3. **Node.js**: Version 20.x or higher

## SolarWinds NPM 2025.2+ Compatibility

This integration is **fully compatible with SolarWinds NPM 2025.2.1** and later versions.

### Important SSL/TLS Changes in 2025.2+

Starting with **SolarWinds Platform 2025.2**, SSL certificate validation is **enforced by default** for all HTTPS connections to the SWIS API. This is a security improvement but requires proper configuration:

#### Option 1: Use a Valid SSL Certificate (Recommended)

Configure your SolarWinds server with a valid SSL certificate from a trusted Certificate Authority (CA) with:
- Matching Common Name (CN) or Subject Alternative Name (SAN)
- Complete certificate chain
- Valid expiration date

#### Option 2: Provide Self-Signed Certificate Path

If using a self-signed certificate, export the CA certificate from your SolarWinds server and provide the path:

```bash
# Export certificate from SolarWinds (on Windows server)
# Method 1: Using PowerShell
$cert = Get-ChildItem -Path Cert:\LocalMachine\My | Where-Object {$_.Subject -like "*YourSolarWindsServer*"}
Export-Certificate -Cert $cert -FilePath C:\solarwinds-cert.cer

# Method 2: Using MMC (Certificate Manager)
# 1. Run mmc.exe -> Add/Remove Snap-in -> Certificates -> Computer Account
# 2. Navigate to Personal -> Certificates
# 3. Right-click the SolarWinds certificate -> All Tasks -> Export
# 4. Export as Base-64 encoded X.509 (.CER)
```

Then configure the certificate path in your `.env` file:
```env
SOLARWINDS_CERT_PATH=/path/to/solarwinds-cert.pem
```

**📖 For detailed certificate export instructions, see [SSL-CERTIFICATE-GUIDE.md](./SSL-CERTIFICATE-GUIDE.md)**

#### Option 3: Disable SSL Verification (Not Recommended for Production)

For testing or development environments only:
```env
SOLARWINDS_VERIFY_SSL=false
```

**⚠️ Warning**: Disabling SSL verification in production environments exposes you to man-in-the-middle attacks.

## Installation

1. Navigate to the package directory:
   ```bash
   cd packages/solarwinds-neo4j
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

4. Configure your credentials in `.env`:
   ```env
   # SolarWinds NPM Configuration
   SOLARWINDS_URL=https://your-solarwinds-server.com
   SOLARWINDS_USERNAME=your_username
   SOLARWINDS_PASSWORD=your_password
   SOLARWINDS_VERIFY_SSL=true

   # SSL Certificate Configuration (for SolarWinds 2025.2+)
   # If using self-signed certificates, provide the path to the CA certificate file
   # SOLARWINDS_CERT_PATH=/path/to/solarwinds-ca-cert.pem

   # Neo4j Configuration
   NEO4J_URI=bolt://localhost:7687
   NEO4J_USERNAME=neo4j
   NEO4J_PASSWORD=your_neo4j_password
   NEO4J_DATABASE=neo4j

   # Options
   CLEAR_EXISTING=false  # Set to 'true' to clear existing topology data before import
   ```

## Usage

### Troubleshooting (Recommended First Step)

Before running the full sync, it's recommended to run the troubleshooting script to verify your configuration and discover available entities:

```bash
pnpm troubleshoot
```

This will:
- Test your SolarWinds connection
- Discover available topology entities in your instance
- Test data retrieval for nodes, interfaces, connections, and IP addresses
- Provide recommendations for configuration

### Quick Start

Run the topology sync:

```bash
pnpm dev
```

Or build and run the compiled version:

```bash
pnpm build
pnpm start
```

### As a Library

You can also use this as a library in your own code:

```typescript
import { SolarWindsClient, Neo4jLoader } from '@roo-code/solarwinds-neo4j';

const swClient = new SolarWindsClient({
  baseUrl: 'https://your-solarwinds-server.com',
  username: 'your_username',
  password: 'your_password',
  verifySSL: true,
});

const neo4jLoader = new Neo4jLoader({
  uri: 'bolt://localhost:7687',
  username: 'neo4j',
  password: 'your_password',
  database: 'neo4j',
});

// Fetch and load data
const topologyData = await swClient.getAllTopologyData();
await neo4jLoader.loadDevices(topologyData.nodes);
await neo4jLoader.loadInterfaces(topologyData.interfaces);
await neo4jLoader.loadConnections(topologyData.connections);
```

## Example Cypher Queries

Once your topology is loaded, you can query it using Cypher. Here are some examples:

### Find all devices
```cypher
MATCH (d:Device)
RETURN d.name, d.ipAddress, d.vendor, d.status
LIMIT 25
```

### Find network path between two devices
```cypher
MATCH path = shortestPath(
  (d1:Device {name: 'Router1'})-[:HAS_INTERFACE|CONNECTED_TO*]-(d2:Device {name: 'Router2'})
)
RETURN path
```

### Find all devices connected to a specific device
```cypher
MATCH (d1:Device {name: 'CoreSwitch'})-[:HAS_INTERFACE]->(i1:Interface)
      -[:CONNECTED_TO]-(i2:Interface)<-[:HAS_INTERFACE]-(d2:Device)
RETURN DISTINCT d2.name, d2.ipAddress, d2.status
```

### Find all interfaces on a device with their IPs
```cypher
MATCH (d:Device {name: 'Router1'})-[:HAS_INTERFACE]->(i:Interface)
      -[:HAS_IP]->(ip:IPAddress)
RETURN i.name, ip.address, ip.subnetMask, i.operStatus
```

### Find all devices in a specific subnet
```cypher
MATCH (s:Subnet {network: '192.168.1.0/24'})<-[:BELONGS_TO_SUBNET]-(ip:IPAddress)
      <-[:HAS_IP]-(i:Interface)<-[:HAS_INTERFACE]-(d:Device)
RETURN DISTINCT d.name, d.ipAddress, d.status
```

### Identify devices with down interfaces
```cypher
MATCH (d:Device)-[:HAS_INTERFACE]->(i:Interface)
WHERE i.operStatus <> 1
RETURN d.name, i.name, i.operStatus
ORDER BY d.name
```

### Find network topology visualization
```cypher
MATCH (d:Device)-[:HAS_INTERFACE]->(i:Interface)-[:CONNECTED_TO]-(i2:Interface)
      <-[:HAS_INTERFACE]-(d2:Device)
RETURN d, i, i2, d2
LIMIT 100
```

## Architecture

### SolarWindsClient

The `SolarWindsClient` class handles all communication with the SolarWinds NPM API using the SWIS (SolarWinds Information Service) REST API. It supports:

- SWQL query execution
- Fetching nodes (devices)
- Fetching interfaces
- Fetching network connections
- Fetching IP addresses
- Connection testing

### Neo4jLoader

The `Neo4jLoader` class manages all Neo4j operations:

- Creating indexes for performance
- Loading devices, interfaces, and IP addresses
- Creating network connections
- Automatically discovering and creating subnets
- Batch operations for efficient data loading
- Transaction management

## Configuration Options

### Environment Variables

- `SOLARWINDS_URL`: Base URL of your SolarWinds server (required)
- `SOLARWINDS_USERNAME`: SolarWinds username (required)
- `SOLARWINDS_PASSWORD`: SolarWinds password (required)
- `SOLARWINDS_VERIFY_SSL`: Whether to verify SSL certificates (default: true)
- `SOLARWINDS_CERT_PATH`: Path to CA certificate file for SSL verification (optional, required for self-signed certs in 2025.2+)
- `NEO4J_URI`: Neo4j connection URI (required)
- `NEO4J_USERNAME`: Neo4j username (required)
- `NEO4J_PASSWORD`: Neo4j password (required)
- `NEO4J_DATABASE`: Neo4j database name (default: neo4j)
- `CLEAR_EXISTING`: Clear existing topology data before import (default: false)

## Troubleshooting

### SolarWinds Connection Issues

1. **SSL Certificate Errors (SolarWinds 2025.2.1+)**:

   **Error**: `unable to verify the first certificate` or `self signed certificate`

   **Solutions**:
   - **Best Practice**: Provide the CA certificate file path via `SOLARWINDS_CERT_PATH` environment variable
   - **Quick Fix**: Set `SOLARWINDS_VERIFY_SSL=false` (not recommended for production)
   - **Permanent Solution**: Install a valid SSL certificate on your SolarWinds server

   **To export the SolarWinds certificate**:
   ```bash
   # On Windows (PowerShell)
   $cert = Get-ChildItem -Path Cert:\LocalMachine\My | Where-Object {$_.Subject -like "*your-solarwinds-server*"}
   Export-Certificate -Cert $cert -FilePath C:\solarwinds-cert.cer

   # Convert to PEM format (if needed)
   openssl x509 -inform DER -in solarwinds-cert.cer -out solarwinds-cert.pem
   ```

   Then set: `SOLARWINDS_CERT_PATH=/path/to/solarwinds-cert.pem`

2. **"Entity not found" errors for topology tables**:

   **Error**: `Source entity [Orion.NPM.InterfaceNeighbors] not found in catalog`

   **Cause**: The topology entity name varies by SolarWinds version and configuration. The integration automatically tries multiple entity names.

   **Solutions**:
   - Run `pnpm troubleshoot` to discover which topology entities are available in your instance
   - The integration will automatically try these entities in order:
     1. `Orion.Topology.InterfaceNeighbors` (newer versions)
     2. `Orion.NPM.InterfaceNeighbors` (older versions)
     3. `Orion.NPM.CDPNeighbors` (Cisco Discovery Protocol)
     4. `Orion.NPM.LLDPNeighbors` (Link Layer Discovery Protocol)
   - If none are available, the sync will continue without connection data (you'll still get devices and interfaces)
   - To enable topology discovery:
     - Enable CDP or LLDP on your network devices
     - Configure SolarWinds NPM to discover Layer 2 topology
     - Wait for the next discovery poll to complete

3. **Authentication Failures**: Verify username and password, ensure the account has API access
4. **Network Errors**: Check firewall settings and network connectivity (SWIS API typically uses port 17778 or 17774)

### Neo4j Connection Issues

1. **Connection Refused**: Ensure Neo4j is running and the URI is correct
2. **Authentication Failed**: Verify Neo4j credentials
3. **Database Not Found**: Check the database name, create it if necessary

### Performance Considerations

- For large networks (>10,000 devices), consider running the sync during off-peak hours
- The script uses batch operations, but very large datasets may take time
- Consider increasing Neo4j heap size for large topologies

## Development

### Build

```bash
pnpm build
```

### Run in Development Mode

```bash
pnpm dev
```

### File Structure

```
src/
├── index.ts              # Main orchestration script
├── solarwinds-client.ts  # SolarWinds API client
├── neo4j-loader.ts       # Neo4j data loader
└── types.ts              # TypeScript type definitions
```

## License

See the root LICENSE file for license information.

## Contributing

Contributions are welcome! Please follow the existing code style and include tests for new features.

## Support

For issues and questions:
- Check the SolarWinds API documentation
- Review Neo4j Cypher documentation
- Open an issue in the repository
