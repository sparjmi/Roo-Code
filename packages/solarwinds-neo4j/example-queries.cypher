// Example Cypher Queries for Network Topology Analysis
// Copy and paste these into Neo4j Browser or use with the Neo4j driver

// ==============================================
// Basic Queries
// ==============================================

// Get all devices
MATCH (d:Device)
RETURN d.name, d.ipAddress, d.vendor, d.machineType, d.status
ORDER BY d.name
LIMIT 25;

// Get all interfaces with their operational status
MATCH (d:Device)-[:HAS_INTERFACE]->(i:Interface)
RETURN d.name AS device, i.name AS interface, i.operStatus, i.adminStatus, i.speed
ORDER BY d.name, i.name
LIMIT 50;

// Get all IP addresses and their assignments
MATCH (d:Device)-[:HAS_INTERFACE]->(i:Interface)-[:HAS_IP]->(ip:IPAddress)
RETURN d.name AS device, i.name AS interface, ip.address, ip.subnetMask
ORDER BY d.name
LIMIT 50;

// ==============================================
// Topology Analysis
// ==============================================

// Find all direct connections between devices
MATCH (d1:Device)-[:HAS_INTERFACE]->(i1:Interface)-[:CONNECTED_TO]-(i2:Interface)
      <-[:HAS_INTERFACE]-(d2:Device)
RETURN d1.name AS device1, i1.name AS interface1,
       d2.name AS device2, i2.name AS interface2
LIMIT 50;

// Visualize network topology (use in Neo4j Browser)
MATCH (d:Device)-[:HAS_INTERFACE]->(i:Interface)-[:CONNECTED_TO]-(i2:Interface)
      <-[:HAS_INTERFACE]-(d2:Device)
RETURN d, i, i2, d2
LIMIT 100;

// Find the shortest path between two devices
MATCH (d1:Device {name: 'YourDevice1'}),
      (d2:Device {name: 'YourDevice2'}),
      path = shortestPath((d1)-[:HAS_INTERFACE|CONNECTED_TO*]-(d2))
RETURN path;

// Find all paths between two devices (up to 10 hops)
MATCH (d1:Device {name: 'YourDevice1'}),
      (d2:Device {name: 'YourDevice2'}),
      path = (d1)-[:HAS_INTERFACE|CONNECTED_TO*..20]-(d2)
RETURN path
LIMIT 10;

// ==============================================
// Network Health Monitoring
// ==============================================

// Find all devices with DOWN status
MATCH (d:Device)
WHERE d.status <> 'Up'
RETURN d.name, d.ipAddress, d.status, d.location
ORDER BY d.name;

// Find all interfaces that are down
MATCH (d:Device)-[:HAS_INTERFACE]->(i:Interface)
WHERE i.operStatus <> 1
RETURN d.name AS device, i.name AS interface,
       i.operStatus, i.adminStatus
ORDER BY d.name;

// Find devices with the most down interfaces
MATCH (d:Device)-[:HAS_INTERFACE]->(i:Interface)
WHERE i.operStatus <> 1
RETURN d.name, d.ipAddress, count(i) AS downInterfaces
ORDER BY downInterfaces DESC
LIMIT 10;

// ==============================================
// Subnet Analysis
// ==============================================

// List all subnets with device counts
MATCH (s:Subnet)<-[:BELONGS_TO_SUBNET]-(ip:IPAddress)
      <-[:HAS_IP]-(i:Interface)<-[:HAS_INTERFACE]-(d:Device)
RETURN s.network, s.cidr, count(DISTINCT d) AS deviceCount
ORDER BY deviceCount DESC;

// Find all devices in a specific subnet
MATCH (s:Subnet {network: '192.168.1.0/24'})<-[:BELONGS_TO_SUBNET]-(ip:IPAddress)
      <-[:HAS_IP]-(i:Interface)<-[:HAS_INTERFACE]-(d:Device)
RETURN DISTINCT d.name, d.ipAddress, d.status
ORDER BY d.name;

// Find subnets with no active devices
MATCH (s:Subnet)<-[:BELONGS_TO_SUBNET]-(ip:IPAddress)
      <-[:HAS_IP]-(i:Interface)<-[:HAS_INTERFACE]-(d:Device)
WHERE d.status <> 'Up'
WITH s, count(DISTINCT d) AS totalDevices
WHERE totalDevices = 0
RETURN s.network, s.cidr;

// ==============================================
// Device Inventory
// ==============================================

// Count devices by vendor
MATCH (d:Device)
WHERE d.vendor IS NOT NULL
RETURN d.vendor, count(d) AS deviceCount
ORDER BY deviceCount DESC;

// Count devices by type
MATCH (d:Device)
WHERE d.machineType IS NOT NULL
RETURN d.machineType, count(d) AS deviceCount
ORDER BY deviceCount DESC;

// Count devices by location
MATCH (d:Device)
WHERE d.location IS NOT NULL
RETURN d.location, count(d) AS deviceCount
ORDER BY deviceCount DESC;

// ==============================================
// Interface Statistics
// ==============================================

// Find high-speed interfaces (10 Gbps and above)
MATCH (d:Device)-[:HAS_INTERFACE]->(i:Interface)
WHERE i.speed >= 10000000000
RETURN d.name AS device, i.name AS interface,
       i.speed / 1000000000.0 AS speedGbps
ORDER BY speedGbps DESC
LIMIT 50;

// Find interfaces with bandwidth utilization data
MATCH (d:Device)-[:HAS_INTERFACE]->(i:Interface)
WHERE i.inBandwidth IS NOT NULL OR i.outBandwidth IS NOT NULL
RETURN d.name AS device, i.name AS interface,
       i.inBandwidth, i.outBandwidth
ORDER BY d.name
LIMIT 50;

// ==============================================
// Connectivity Analysis
// ==============================================

// Find devices with the most connections
MATCH (d:Device)-[:HAS_INTERFACE]->(i:Interface)-[:CONNECTED_TO]-(:Interface)
RETURN d.name, d.ipAddress, count(DISTINCT i) AS connectedInterfaces
ORDER BY connectedInterfaces DESC
LIMIT 20;

// Find isolated devices (no connections)
MATCH (d:Device)
WHERE NOT (d)-[:HAS_INTERFACE]->(:Interface)-[:CONNECTED_TO]-(:Interface)
RETURN d.name, d.ipAddress, d.status
ORDER BY d.name;

// Find leaf devices (only one connection)
MATCH (d:Device)-[:HAS_INTERFACE]->(i:Interface)-[:CONNECTED_TO]-(:Interface)
WITH d, count(DISTINCT i) AS connections
WHERE connections = 1
RETURN d.name, d.ipAddress, connections
ORDER BY d.name;

// ==============================================
// Advanced Analysis
// ==============================================

// Find potential core/distribution layer devices (highly connected)
MATCH (d:Device)-[:HAS_INTERFACE]->(i:Interface)-[:CONNECTED_TO]-(:Interface)
WITH d, count(DISTINCT i) AS connections
WHERE connections >= 5
RETURN d.name, d.ipAddress, d.location, connections
ORDER BY connections DESC;

// Find redundant paths between devices
MATCH (d1:Device {name: 'YourDevice1'}),
      (d2:Device {name: 'YourDevice2'}),
      path = (d1)-[:HAS_INTERFACE|CONNECTED_TO*]-(d2)
WITH collect(path) AS paths
WHERE size(paths) > 1
RETURN paths;

// Identify potential single points of failure
// (devices that if removed would disconnect parts of the network)
MATCH (d:Device)-[:HAS_INTERFACE]->(i:Interface)-[:CONNECTED_TO]-(:Interface)
WITH d, count(DISTINCT i) AS connections
WHERE connections >= 3
RETURN d.name AS criticalDevice, d.ipAddress, connections
ORDER BY connections DESC;

// ==============================================
// Network Diagram Data Export
// ==============================================

// Export topology for external visualization
MATCH (d1:Device)-[:HAS_INTERFACE]->(i1:Interface)-[c:CONNECTED_TO]-(i2:Interface)
      <-[:HAS_INTERFACE]-(d2:Device)
RETURN d1.name AS source,
       d2.name AS target,
       i1.name AS sourceInterface,
       i2.name AS targetInterface,
       c.connectionType AS type
ORDER BY source, target;

// ==============================================
// Maintenance and Cleanup
// ==============================================

// Find duplicate IP addresses (possible configuration issues)
MATCH (ip:IPAddress)<-[:HAS_IP]-(i:Interface)<-[:HAS_INTERFACE]-(d:Device)
WITH ip.address AS ipAddr, collect(d.name) AS devices
WHERE size(devices) > 1
RETURN ipAddr, devices;

// Find interfaces without IP addresses
MATCH (d:Device)-[:HAS_INTERFACE]->(i:Interface)
WHERE NOT (i)-[:HAS_IP]->(:IPAddress)
RETURN d.name AS device, i.name AS interface
ORDER BY d.name;

// Get data freshness (when was data last updated)
MATCH (d:Device)
RETURN max(d.lastUpdated) AS latestUpdate,
       min(d.lastUpdated) AS oldestUpdate;
