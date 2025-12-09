# SolarWinds NPM to PostgreSQL Network Topology Integration

This package provides a complete solution for querying SolarWinds Network Performance Monitor (NPM) API and storing network topology data in a PostgreSQL relational database with proper foreign key relationships.

## Features

- **SolarWinds NPM API Client**: Query network devices, interfaces, connections, and IP addresses using SWQL (SolarWinds Query Language)
- **PostgreSQL Integration**: Transform network data into normalized relational tables
- **Foreign Key Relationships**: Proper database relationships between devices, interfaces, and IP addresses
- **Batch Operations**: Efficient bulk data loading with UPSERT support
- **Automatic Schema Creation**: Tables and indexes are created automatically

## Database Schema

The integration creates the following normalized relational schema:

### Tables

#### 1. **devices**
Primary table for network devices (routers, switches, servers)

| Column | Type | Description |
|--------|------|-------------|
| node_id | INTEGER (PK) | Unique device identifier |
| caption | VARCHAR(255) | Device display name |
| node_name | VARCHAR(255) | Device hostname |
| ip_address | VARCHAR(50) | Primary IP address |
| vendor | VARCHAR(255) | Device manufacturer |
| machine_type | VARCHAR(255) | Device model/type |
| location | VARCHAR(255) | Physical location |
| status | INTEGER | Device status code |
| status_description | VARCHAR(100) | Status text |
| object_sub_type | VARCHAR(100) | Device category |
| ios_version | VARCHAR(100) | OS version |
| contact | VARCHAR(255) | Device contact |
| description | TEXT | Additional info |
| last_updated | TIMESTAMP | Last sync time |

#### 2. **interfaces**
Network interfaces on devices

| Column | Type | Description |
|--------|------|-------------|
| interface_id | INTEGER (PK) | Unique interface identifier |
| node_id | INTEGER (FK → devices) | Parent device |
| interface_name | VARCHAR(255) | Interface name |
| caption | VARCHAR(255) | Display name |
| full_name | VARCHAR(500) | Full interface path |
| interface_index | INTEGER | SNMP interface index |
| interface_type | INTEGER | Interface type code |
| interface_type_description | VARCHAR(255) | Interface type text |
| physical_address | VARCHAR(50) | MAC address |
| admin_status | INTEGER | Administrative status |
| oper_status | INTEGER | Operational status |
| speed | BIGINT | Interface speed (bps) |
| mtu | INTEGER | Maximum transmission unit |
| in_bandwidth | BIGINT | Inbound bandwidth |
| out_bandwidth | BIGINT | Outbound bandwidth |
| description | TEXT | Interface description |
| last_updated | TIMESTAMP | Last sync time |

#### 3. **ip_addresses**
IP addresses assigned to interfaces

| Column | Type | Description |
|--------|------|-------------|
| ip_address_id | INTEGER (PK) | Unique IP identifier |
| interface_id | INTEGER (FK → interfaces) | Parent interface |
| ip_address | VARCHAR(50) | IP address |
| subnet_mask | VARCHAR(50) | Subnet mask |
| ip_address_type | VARCHAR(50) | Address type |
| last_updated | TIMESTAMP | Last sync time |

#### 4. **connections**
Network connections between interfaces

| Column | Type | Description |
|--------|------|-------------|
| connection_id | SERIAL (PK) | Auto-incrementing ID |
| local_node_id | INTEGER | Local device |
| local_interface_id | INTEGER (FK → interfaces) | Local interface |
| remote_node_id | INTEGER | Remote device |
| remote_interface_id | INTEGER (FK → interfaces) | Remote interface |
| connection_type | VARCHAR(50) | Discovery protocol (CDP/LLDP) |
| last_updated | TIMESTAMP | Last sync time |

### Indexes

Performance indexes are created on:
- `devices.ip_address`, `devices.vendor`, `devices.location`
- `interfaces.node_id`, `interfaces.interface_name`
- `ip_addresses.interface_id`, `ip_addresses.ip_address`
- `connections.local_interface_id`, `connections.remote_interface_id`

## Prerequisites

1. **SolarWinds NPM Instance**: Access to SolarWinds NPM 2025.2.1+ with API access
2. **PostgreSQL Database**: Running PostgreSQL instance (12+)
3. **Node.js**: Version 20.x or higher

## Installation

### 1. Set up PostgreSQL on Mac

```bash
# Install PostgreSQL using Homebrew
brew install postgresql@16

# Start PostgreSQL service
brew services start postgresql@16

# Create database
createdb solarwinds_topology

# Or using psql
psql postgres
CREATE DATABASE solarwinds_topology;
\q
```

### 2. Install Package Dependencies

```bash
cd packages/solarwinds-postgres
pnpm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# SolarWinds NPM Configuration
SOLARWINDS_URL=https://your-solarwinds-server.com
SOLARWINDS_USERNAME=your_username
SOLARWINDS_PASSWORD=your_password
SOLARWINDS_VERIFY_SSL=false

# PostgreSQL Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=solarwinds_topology
POSTGRES_USERNAME=postgres
POSTGRES_PASSWORD=your_postgres_password
POSTGRES_SSL=false

# Options
CLEAR_EXISTING=false  # Set to 'true' to clear existing data before import
```

## Usage

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

```typescript
import { SolarWindsClient, PostgresLoader } from '@roo-code/solarwinds-postgres';

const swClient = new SolarWindsClient({
  baseUrl: 'https://your-solarwinds-server.com',
  username: 'your_username',
  password: 'your_password',
  verifySSL: false,
});

const pgLoader = new PostgresLoader({
  host: 'localhost',
  port: 5432,
  database: 'solarwinds_topology',
  username: 'postgres',
  password: 'your_password',
});

// Fetch and load data
const topologyData = await swClient.getAllTopologyData();
await pgLoader.createTables();
await pgLoader.loadDevices(topologyData.nodes);
await pgLoader.loadInterfaces(topologyData.interfaces);
await pgLoader.loadIPAddresses(topologyData.ipAddresses);
await pgLoader.loadConnections(topologyData.connections);
```

## Example SQL Queries

Once your topology is loaded, you can query it using standard SQL:

### Find all devices by vendor

```sql
SELECT node_name, ip_address, machine_type, location, status_description
FROM devices
WHERE vendor = 'Cisco Systems'
ORDER BY node_name;
```

### Get all interfaces for a specific device

```sql
SELECT
  d.node_name,
  i.interface_name,
  i.oper_status,
  i.speed,
  i.physical_address
FROM interfaces i
JOIN devices d ON i.node_id = d.node_id
WHERE d.node_name = 'your-device-name'
ORDER BY i.interface_name;
```

### Find interfaces with their IP addresses

```sql
SELECT
  d.node_name,
  i.interface_name,
  ip.ip_address,
  ip.subnet_mask
FROM ip_addresses ip
JOIN interfaces i ON ip.interface_id = i.interface_id
JOIN devices d ON i.node_id = d.node_id
WHERE d.node_name = 'your-device-name'
ORDER BY ip.ip_address;
```

### Find network connections between devices

```sql
SELECT
  d1.node_name AS local_device,
  i1.interface_name AS local_interface,
  d2.node_name AS remote_device,
  i2.interface_name AS remote_interface,
  c.connection_type
FROM connections c
JOIN interfaces i1 ON c.local_interface_id = i1.interface_id
JOIN devices d1 ON i1.node_id = d1.node_id
JOIN interfaces i2 ON c.remote_interface_id = i2.interface_id
JOIN devices d2 ON i2.node_id = d2.node_id
ORDER BY d1.node_name, i1.interface_name;
```

### Find all devices in a specific location

```sql
SELECT node_name, ip_address, vendor, machine_type
FROM devices
WHERE location = 'Data Center A'
ORDER BY node_name;
```

### Get interface utilization statistics

```sql
SELECT
  d.node_name,
  i.interface_name,
  i.speed / 1000000 AS speed_mbps,
  i.in_bandwidth,
  i.out_bandwidth,
  i.oper_status
FROM interfaces i
JOIN devices d ON i.node_id = d.node_id
WHERE i.speed > 0
ORDER BY i.speed DESC
LIMIT 20;
```

### Find down interfaces

```sql
SELECT
  d.node_name,
  i.interface_name,
  i.admin_status,
  i.oper_status,
  i.last_updated
FROM interfaces i
JOIN devices d ON i.node_id = d.node_id
WHERE i.oper_status != 1
ORDER BY d.node_name, i.interface_name;
```

### Count devices by vendor

```sql
SELECT
  vendor,
  COUNT(*) AS device_count
FROM devices
WHERE vendor IS NOT NULL
GROUP BY vendor
ORDER BY device_count DESC;
```

### Find devices with most interfaces

```sql
SELECT
  d.node_name,
  d.ip_address,
  COUNT(i.interface_id) AS interface_count
FROM devices d
LEFT JOIN interfaces i ON d.node_id = i.node_id
GROUP BY d.node_id, d.node_name, d.ip_address
ORDER BY interface_count DESC
LIMIT 20;
```

## Accessing PostgreSQL on Mac

### Using psql command line

```bash
# Connect to database
psql solarwinds_topology

# List tables
\dt

# Describe table structure
\d devices

# Run query
SELECT COUNT(*) FROM devices;

# Exit
\q
```

### Using pgAdmin

1. Download pgAdmin from https://www.pgadmin.org/
2. Install and launch
3. Add New Server:
   - Name: Local PostgreSQL
   - Host: localhost
   - Port: 5432
   - Database: solarwinds_topology
   - Username: postgres
   - Password: your_password

### Using DBeaver (Recommended)

1. Download DBeaver from https://dbeaver.io/
2. Install and launch
3. New Database Connection → PostgreSQL
4. Configure connection and connect

## Configuration Options

### Environment Variables

- `SOLARWINDS_URL`: Base URL of your SolarWinds server (required)
- `SOLARWINDS_USERNAME`: SolarWinds username (required)
- `SOLARWINDS_PASSWORD`: SolarWinds password (required)
- `SOLARWINDS_VERIFY_SSL`: Whether to verify SSL certificates (default: true)
- `SOLARWINDS_CERT_PATH`: Path to CA certificate file (optional)
- `POSTGRES_HOST`: PostgreSQL server host (required)
- `POSTGRES_PORT`: PostgreSQL server port (default: 5432)
- `POSTGRES_DATABASE`: Database name (required)
- `POSTGRES_USERNAME`: PostgreSQL username (required)
- `POSTGRES_PASSWORD`: PostgreSQL password (required)
- `POSTGRES_SSL`: Enable SSL connection (default: false)
- `CLEAR_EXISTING`: Clear existing data before import (default: false)

## Troubleshooting

### PostgreSQL Connection Issues

1. **Connection refused**:
   ```bash
   # Check if PostgreSQL is running
   brew services list

   # Start PostgreSQL
   brew services start postgresql@16
   ```

2. **Authentication failed**:
   ```bash
   # Reset PostgreSQL password
   psql postgres
   ALTER USER postgres PASSWORD 'new_password';
   ```

3. **Database does not exist**:
   ```bash
   createdb solarwinds_topology
   ```

### SolarWinds Connection Issues

See the main README for SolarWinds 2025.2.1 SSL certificate configuration.

## Scheduled Sync

To run the sync automatically on a schedule:

### Using cron (Mac/Linux)

```bash
# Edit crontab
crontab -e

# Add line to run every hour
0 * * * * cd /path/to/packages/solarwinds-postgres && /usr/local/bin/pnpm start >> /tmp/solarwinds-sync.log 2>&1
```

### Using launchd (Mac)

Create `~/Library/LaunchAgents/com.solarwinds.sync.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.solarwinds.sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/pnpm</string>
        <string>start</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/path/to/packages/solarwinds-postgres</string>
    <key>StartInterval</key>
    <integer>3600</integer>
    <key>StandardOutPath</key>
    <string>/tmp/solarwinds-sync.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/solarwinds-sync-error.log</string>
</dict>
</plist>
```

Load the agent:
```bash
launchctl load ~/Library/LaunchAgents/com.solarwinds.sync.plist
```

## Development

### Build

```bash
pnpm build
```

### Run in Development Mode

```bash
pnpm dev
```

## License

See the root LICENSE file for license information.

## Support

For issues and questions:
- Check the PostgreSQL documentation
- Check the SolarWinds API documentation
- Open an issue in the repository
